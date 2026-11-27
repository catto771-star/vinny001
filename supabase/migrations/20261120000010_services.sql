-- DS Lodge — Fase 2: Serviços (spec v1.1, s.8; s.14 itens 10 e 11)
-- Fridge/Temperatura, Food Delivery (Amiens), Dinner (Amiens), Laundry (Connolly)
-- e as notificações da gestão.

alter table public.handover_entries drop constraint handover_entries_kind_check;
alter table public.handover_entries add constraint handover_entries_kind_check
  check (kind in ('note', 'round', 'maintenance', 'warning', 'laundry'));

-- Tarefas que se concluem sozinhas quando o registro é salvo (s.7: abrir a tela sem salvar não conclui).
alter table public.task_templates add column auto_key text;
update public.task_templates set auto_key = 'fridge_temperature' where title ->> 'en-IE' = 'Fridge temperature';

-- Assinatura automática da tarefa ligada a um registro, no turno atual.
create or replace function public.auto_sign_task(p_lodge uuid, p_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := public.operational_day(now());
  v_shift text := public.shift_of(now());
  v_post public.duty_posts := public.my_open_post();
begin
  insert into public.task_signatures (lodge_id, operational_day, shift, template_id, staff_id, duty_function)
  select p_lodge, v_day, v_shift, t.task_id, public.current_staff_id(), coalesce(v_post.function::text, public.current_staff_role()::text)
  from public.shift_tasks(p_lodge, v_day, v_shift) t
  join public.task_templates tt on tt.id = t.task_id
  where t.kind = 'template' and tt.auto_key = p_key
  on conflict do nothing;
end
$$;

-- ---------------------------------------------------------------------------
-- Fridge / Temperatura: só a geladeira é medida; fora da faixa → alerta ao Manager (B46).
-- ---------------------------------------------------------------------------
create table public.fridge_readings (
  id uuid primary key default gen_random_uuid(),
  lodge_id uuid not null references public.lodges(id),
  temperature numeric(4, 1) not null,
  range_min numeric(4, 1) not null,
  range_max numeric(4, 1) not null,
  out_of_range boolean not null,
  note text,
  recorded_by uuid not null references public.staff(id),
  recorded_at timestamptz not null default now()
);

create index fridge_readings_lodge_idx on public.fridge_readings(lodge_id, recorded_at desc);
create trigger audit_fridge_readings after insert or update or delete on public.fridge_readings for each row execute function public.audit_row();

create or replace function public.record_fridge_temperature(p_lodge uuid, p_temperature numeric, p_note text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_range jsonb := public.param_value('fridge.range_celsius', p_lodge);
  v_min numeric := coalesce((v_range ->> 'min')::numeric, 0);
  v_max numeric := coalesce((v_range ->> 'max')::numeric, 5);
  v_out boolean;
  v_id uuid;
begin
  if public.current_staff_id() is null or not public.can_write_lodge(p_lodge) then
    raise exception 'not_authorised' using errcode = '42501';
  end if;
  -- Em branco não é 0 °C.
  if p_temperature is null then raise exception 'temperature_required' using errcode = '22023'; end if;
  if p_temperature < -40 or p_temperature > 40 then raise exception 'invalid_temperature' using errcode = '22023'; end if;
  v_out := p_temperature < v_min or p_temperature > v_max;
  insert into public.fridge_readings (lodge_id, temperature, range_min, range_max, out_of_range, note, recorded_by)
  values (p_lodge, round(p_temperature, 1), v_min, v_max, v_out, nullif(trim(p_note), ''), public.current_staff_id())
  returning id into v_id;
  if v_out then
    insert into public.notifications (kind, audience, lodge_id, payload)
    values ('fridge_out_of_range', 'management', p_lodge,
            jsonb_build_object('reading_id', v_id, 'temperature', round(p_temperature, 1), 'min', v_min, 'max', v_max));
  end if;
  perform public.auto_sign_task(p_lodge, 'fridge_temperature');
  return v_id;
end
$$;

-- ---------------------------------------------------------------------------
-- Food Delivery: todos os campos obrigatórios; temperatura só registrada (sem limite/alerta).
-- ---------------------------------------------------------------------------
create table public.food_deliveries (
  id uuid primary key default gen_random_uuid(),
  lodge_id uuid not null references public.lodges(id),
  product text not null,
  supplier text not null,
  batch text not null,
  expiry_date date not null,
  temperature numeric(4, 1) not null,
  note text,
  received_by uuid not null references public.staff(id),
  received_at timestamptz not null default now()
);

create index food_deliveries_lodge_idx on public.food_deliveries(lodge_id, received_at desc);
create trigger audit_food_deliveries after insert or update or delete on public.food_deliveries for each row execute function public.audit_row();

create or replace function public.record_food_delivery(
  p_lodge uuid, p_product text, p_supplier text, p_batch text, p_expiry date, p_temperature numeric, p_note text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if public.current_staff_id() is null or not public.can_write_lodge(p_lodge) then
    raise exception 'not_authorised' using errcode = '42501';
  end if;
  if not exists (select 1 from public.lodges where id = p_lodge and has_dinner) then
    raise exception 'service_not_available' using errcode = '22023';
  end if;
  if coalesce(trim(p_product), '') = '' or coalesce(trim(p_supplier), '') = '' or coalesce(trim(p_batch), '') = ''
     or p_expiry is null or p_temperature is null then
    raise exception 'fields_required' using errcode = '22023';
  end if;
  insert into public.food_deliveries (lodge_id, product, supplier, batch, expiry_date, temperature, note, received_by)
  values (p_lodge, trim(p_product), trim(p_supplier), trim(p_batch), p_expiry, round(p_temperature, 1), nullif(trim(p_note), ''), public.current_staff_id())
  returning id into v_id;
  return v_id;
end
$$;

-- ---------------------------------------------------------------------------
-- Dinner (Amiens, 18h–22h): uma marca por residente por serviço; "sim" vale como Seen Night.
-- ---------------------------------------------------------------------------
create table public.dinner_services (
  id uuid primary key default gen_random_uuid(),
  lodge_id uuid not null references public.lodges(id),
  operational_day date not null,
  leftovers integer check (leftovers >= 0),
  packaged integer check (packaged >= 0),   -- embalagens: não são pessoas atendidas
  close_note text,
  closed_at timestamptz,
  closed_by uuid references public.staff(id),
  edited_at timestamptz,
  edited_by uuid references public.staff(id),
  version integer not null default 1,
  unique (lodge_id, operational_day)
);

create table public.dinner_marks (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.dinner_services(id),
  stay_id uuid not null references public.stays(id),
  resident_id uuid not null references public.residents(id),
  served boolean not null,
  marked_by uuid not null references public.staff(id),
  marked_at timestamptz not null default now(),
  version integer not null default 1,
  unique (service_id, stay_id)
);

create index dinner_marks_resident_idx on public.dinner_marks(resident_id);
create trigger dinner_services_bump before update on public.dinner_services for each row execute function public.bump_version();
create trigger dinner_marks_bump before update on public.dinner_marks for each row execute function public.bump_version();
create trigger audit_dinner_services after insert or update or delete on public.dinner_services for each row execute function public.audit_row();
create trigger audit_dinner_marks after insert or update or delete on public.dinner_marks for each row execute function public.audit_row();

create or replace function public.ensure_dinner_service(p_lodge uuid, p_day date)
returns public.dinner_services
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.dinner_services;
begin
  if not exists (select 1 from public.lodges where id = p_lodge and has_dinner) then
    raise exception 'service_not_available' using errcode = '22023';
  end if;
  insert into public.dinner_services (lodge_id, operational_day) values (p_lodge, p_day)
  on conflict (lodge_id, operational_day) do nothing;
  select * into v from public.dinner_services where lodge_id = p_lodge and operational_day = p_day;
  return v;
end
$$;

-- Residentes no Lodge durante o serviço (18h–22h).
create or replace function public.dinner_stays(p_lodge uuid, p_day date)
returns setof public.stays
language sql stable
security definer
set search_path = public
as $$
  select * from public.stays s
  where s.lodge_id = p_lodge
    and s.admitted_at < public.slot_instant(p_day, '22:00')
    and (s.ended_at is null or s.ended_at > public.slot_instant(p_day, '18:00'))
$$;

create or replace function public.mark_dinner(p_lodge uuid, p_day date, p_stay uuid, p_served boolean)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service public.dinner_services;
  v_stay public.stays;
  v_mark public.dinner_marks;
begin
  if public.current_staff_id() is null or not public.can_write_lodge(p_lodge) then
    raise exception 'not_authorised' using errcode = '42501';
  end if;
  v_service := public.ensure_dinner_service(p_lodge, p_day);
  if public.slot_instant(p_day, '18:00') > now() + interval '30 minutes' then
    raise exception 'dinner_not_started' using errcode = '22023';
  end if;
  if v_service.closed_at is not null and not public.is_management() then
    raise exception 'dinner_closed' using errcode = '22023';
  end if;
  select * into v_stay from public.dinner_stays(p_lodge, p_day) s where s.id = p_stay;
  if not found then raise exception 'stay_not_in_service' using errcode = '22023'; end if;
  if p_served is null then raise exception 'served_required' using errcode = '22023'; end if;

  select * into v_mark from public.dinner_marks where service_id = v_service.id and stay_id = p_stay for update;
  if found then
    if not public.is_management() then
      if v_mark.marked_by <> public.current_staff_id() then raise exception 'not_author' using errcode = '42501'; end if;
      if v_mark.marked_at < now() - public.correction_window() then raise exception 'correction_window_closed' using errcode = '42501'; end if;
    end if;
    if v_mark.served is distinct from p_served then
      update public.dinner_marks set served = p_served where id = v_mark.id;
    end if;
    return v_mark.id;
  end if;
  insert into public.dinner_marks (service_id, stay_id, resident_id, served, marked_by)
  values (v_service.id, p_stay, v_stay.resident_id, p_served, public.current_staff_id())
  returning id into v_mark.id;
  return v_mark.id;
end
$$;

-- Sobras: Manager fecha depois das 22h; depois de fechado, só Owner (ou Developer) edita.
create or replace function public.close_dinner(p_lodge uuid, p_day date, p_leftovers integer, p_packaged integer, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.staff_role := public.current_staff_role();
  v_service public.dinner_services;
begin
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  v_service := public.ensure_dinner_service(p_lodge, p_day);
  if now() < public.slot_instant(p_day, '22:00') then raise exception 'dinner_not_finished' using errcode = '22023'; end if;
  if p_leftovers is null or p_leftovers < 0 or p_packaged is null or p_packaged < 0 then
    raise exception 'invalid_quantities' using errcode = '22023';
  end if;
  if v_service.closed_at is null then
    if v_role not in ('manager', 'developer') then raise exception 'not_authorised' using errcode = '42501'; end if;
    update public.dinner_services
       set leftovers = p_leftovers, packaged = p_packaged, close_note = nullif(trim(p_note), ''),
           closed_at = now(), closed_by = public.current_staff_id()
     where id = v_service.id;
  else
    if v_role not in ('owner', 'developer') then raise exception 'dinner_already_closed' using errcode = '22023'; end if;
    update public.dinner_services
       set leftovers = p_leftovers, packaged = p_packaged, close_note = coalesce(nullif(trim(p_note), ''), close_note),
           edited_at = now(), edited_by = public.current_staff_id()
     where id = v_service.id;
  end if;
end
$$;

create or replace function public.dinner_summary(p_lodge uuid, p_day date)
returns table (service_id uuid, leftovers integer, packaged integer, close_note text, closed_at timestamptz, closed_by uuid,
               edited_at timestamptz, edited_by uuid, served_count integer, not_served_count integer, residents_count integer)
language sql stable
security definer
set search_path = public
as $$
  select s.id, s.leftovers, s.packaged, s.close_note, s.closed_at, s.closed_by, s.edited_at, s.edited_by,
         (select count(*)::int from public.dinner_marks m where m.service_id = s.id and m.served),
         (select count(*)::int from public.dinner_marks m where m.service_id = s.id and not m.served),
         (select count(*)::int from public.dinner_stays(p_lodge, p_day))
  from (select 1) one
  left join public.dinner_services s on s.lodge_id = p_lodge and s.operational_day = p_day
  where public.is_active_staff()
$$;

create or replace function public.dinner_sheet(p_lodge uuid, p_day date)
returns table (stay_id uuid, resident_id uuid, first_name text, last_name text, room_kind public.room_kind, room_code text,
               room_sort integer, bed_number integer, served boolean, marked_by uuid, final_warning boolean)
language sql stable
security definer
set search_path = public
as $$
  select st.id, st.resident_id, r.first_name, r.last_name, rm.kind, rm.code, rm.sort_order, b.number, m.served, m.marked_by,
         public.has_final_warning(st.resident_id)
  from public.dinner_stays(p_lodge, p_day) st
  join public.residents r on r.id = st.resident_id
  join public.beds b on b.id = st.bed_id
  join public.rooms rm on rm.id = b.room_id
  left join public.dinner_services s on s.lodge_id = p_lodge and s.operational_day = p_day
  left join public.dinner_marks m on m.service_id = s.id and m.stay_id = st.id
  where public.is_active_staff()
  order by rm.sort_order, rm.code, b.number
$$;

-- Evidências de presença: Dinner "sim" entra como Seen Night (s.5, confirmado em 20/11).
create or replace function public.resident_evidence(p_resident uuid, p_day date)
returns table (source text, shift text, lodge_id uuid, occurred_at timestamptz)
language sql stable
security definer
set search_path = public
as $$
  select 'check', public.slot_shift(r.slot), r.lodge_id, r.checked_at
  from public.room_check_marks m join public.room_check_runs r on r.id = m.run_id
  where m.resident_id = p_resident and m.result = 'seen' and r.operational_day = p_day
  union all
  select 'manual', public.shift_of(s.seen_at), s.lodge_id, s.seen_at
  from public.sightings s
  where s.resident_id = p_resident and public.operational_day(s.seen_at) = p_day
  union all
  select 'check-in', public.shift_of(st.admitted_at), st.lodge_id, st.admitted_at
  from public.stays st
  where st.resident_id = p_resident and public.operational_day(st.admitted_at) = p_day
  union all
  select 'dinner', 'night', ds.lodge_id, dm.marked_at
  from public.dinner_marks dm join public.dinner_services ds on ds.id = dm.service_id
  where dm.resident_id = p_resident and dm.served and ds.operational_day = p_day
$$;

-- ---------------------------------------------------------------------------
-- Laundry (Connolly): quatro máquinas, sem reservas.
-- ---------------------------------------------------------------------------
create table public.laundry_machines (
  id uuid primary key default gen_random_uuid(),
  lodge_id uuid not null references public.lodges(id),
  code text not null,
  label text not null,
  kind text not null check (kind in ('wash', 'dry')),
  sort_order integer not null default 0,
  active boolean not null default true,
  unique (lodge_id, code)
);

insert into public.laundry_machines (lodge_id, code, label, kind, sort_order)
select l.id, m.code, m.label, m.kind, m.ord
from public.lodges l
cross join (values ('A-WASH', 'A · Wash', 'wash', 1), ('A-DRY', 'A · Dry', 'dry', 2),
                   ('B-WASH', 'B · Wash', 'wash', 3), ('B-DRY', 'B · Dry', 'dry', 4)) m(code, label, kind, ord)
where l.has_laundry;

create table public.laundry_uses (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid not null references public.laundry_machines(id),
  lodge_id uuid not null references public.lodges(id),
  stay_id uuid references public.stays(id),
  resident_id uuid references public.residents(id),
  started_at timestamptz not null default now(),
  started_by uuid not null references public.staff(id),
  finished_at timestamptz,
  finished_by uuid references public.staff(id),
  handover_entry_id uuid references public.handover_entries(id)
);

create unique index laundry_one_open_use on public.laundry_uses(machine_id) where finished_at is null;
create trigger audit_laundry_uses after insert or update or delete on public.laundry_uses for each row execute function public.audit_row();

create or replace function public.start_laundry(p_machine uuid, p_stay uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m public.laundry_machines;
  v_stay public.stays;
  v_entry uuid;
  v_id uuid;
begin
  select * into v_m from public.laundry_machines where id = p_machine and active;
  if not found then raise exception 'machine_not_found' using errcode = 'P0002'; end if;
  if public.current_staff_id() is null or not public.can_write_lodge(v_m.lodge_id) then
    raise exception 'not_authorised' using errcode = '42501';
  end if;
  if exists (select 1 from public.laundry_uses where machine_id = p_machine and finished_at is null) then
    raise exception 'machine_busy' using errcode = '23505';
  end if;
  if p_stay is not null then
    select * into v_stay from public.stays where id = p_stay and lodge_id = v_m.lodge_id and status <> 'ended';
    if not found then raise exception 'stay_not_open' using errcode = '22023'; end if;
  end if;
  v_entry := public.insert_handover_entry(v_m.lodge_id, 'laundry', 'Laundry — ' || v_m.label, now(),
    case when p_stay is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('resident_id', v_stay.resident_id)) end);
  insert into public.laundry_uses (machine_id, lodge_id, stay_id, resident_id, started_by, handover_entry_id)
  values (p_machine, v_m.lodge_id, p_stay, v_stay.resident_id, public.current_staff_id(), v_entry)
  returning id into v_id;
  return v_id;
end
$$;

-- Finalizar libera a máquina sem nova anotação.
create or replace function public.finish_laundry(p_use uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_u public.laundry_uses;
begin
  select * into v_u from public.laundry_uses where id = p_use for update;
  if not found then raise exception 'use_not_found' using errcode = 'P0002'; end if;
  if not public.can_write_lodge(v_u.lodge_id) then raise exception 'not_authorised' using errcode = '42501'; end if;
  if v_u.finished_at is not null then return; end if;
  update public.laundry_uses set finished_at = now(), finished_by = public.current_staff_id() where id = p_use;
end
$$;

create or replace function public.laundry_status(p_lodge uuid)
returns table (machine_id uuid, code text, label text, kind text, use_id uuid, started_at timestamptz, started_by uuid,
               resident_id uuid, first_name text, last_name text)
language sql stable
security definer
set search_path = public
as $$
  select m.id, m.code, m.label, m.kind, u.id, u.started_at, u.started_by, u.resident_id, r.first_name, r.last_name
  from public.laundry_machines m
  left join public.laundry_uses u on u.machine_id = m.id and u.finished_at is null
  left join public.residents r on r.id = u.resident_id
  where public.is_active_staff() and m.lodge_id = p_lodge and m.active
  order by m.sort_order
$$;

-- ---------------------------------------------------------------------------
-- Notificações (aba "Notificações" da tela Hoje — s.11)
-- ---------------------------------------------------------------------------
create or replace function public.my_notifications(p_limit integer)
returns table (id bigint, kind text, lodge_id uuid, resident_id uuid, payload jsonb, created_at timestamptz, read boolean)
language sql stable
security definer
set search_path = public
as $$
  select n.id, n.kind, n.lodge_id, n.resident_id, n.payload, n.created_at,
         exists (select 1 from public.notification_reads r where r.notification_id = n.id and r.staff_id = public.current_staff_id())
  from public.notifications n
  where public.is_active_staff() and (n.audience = 'lodge' or public.is_management())
  order by n.created_at desc, n.id desc
  limit greatest(1, least(coalesce(p_limit, 50), 200))
$$;

create or replace function public.mark_notification_read(p_id bigint)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notification_reads (notification_id, staff_id)
  select n.id, public.current_staff_id() from public.notifications n
  where n.id = p_id and public.is_active_staff() and (n.audience = 'lodge' or public.is_management())
  on conflict do nothing
$$;

create or replace function public.unread_notifications_count()
returns integer
language sql stable
security definer
set search_path = public
as $$
  select count(*)::int from public.notifications n
  where public.is_active_staff() and (n.audience = 'lodge' or public.is_management())
    and n.created_at > now() - interval '30 days'
    and not exists (select 1 from public.notification_reads r where r.notification_id = n.id and r.staff_id = public.current_staff_id())
$$;

-- ---------------------------------------------------------------------------
-- Acesso
-- ---------------------------------------------------------------------------
alter table public.fridge_readings enable row level security;
alter table public.food_deliveries enable row level security;
alter table public.dinner_services enable row level security;
alter table public.dinner_marks enable row level security;
alter table public.laundry_machines enable row level security;
alter table public.laundry_uses enable row level security;

revoke all on public.fridge_readings, public.food_deliveries, public.dinner_services, public.dinner_marks,
  public.laundry_machines, public.laundry_uses from anon, authenticated;

-- Horários de registro são o horário real do fato (registro na hora) — visíveis a todos.
grant select on public.fridge_readings, public.food_deliveries, public.dinner_services, public.laundry_machines, public.laundry_uses to authenticated;
grant select (id, service_id, stay_id, resident_id, served, marked_by, version) on public.dinner_marks to authenticated;

create policy fridge_read on public.fridge_readings for select to authenticated using (public.is_active_staff());
create policy deliveries_read on public.food_deliveries for select to authenticated using (public.is_active_staff());
create policy dinner_services_read on public.dinner_services for select to authenticated using (public.is_active_staff());
create policy dinner_marks_read on public.dinner_marks for select to authenticated using (public.is_active_staff());
create policy machines_read on public.laundry_machines for select to authenticated using (public.is_active_staff());
create policy laundry_read on public.laundry_uses for select to authenticated using (public.is_active_staff());

revoke all on function
  public.auto_sign_task(uuid, text), public.record_fridge_temperature(uuid, numeric, text),
  public.record_food_delivery(uuid, text, text, text, date, numeric, text),
  public.ensure_dinner_service(uuid, date), public.dinner_stays(uuid, date),
  public.mark_dinner(uuid, date, uuid, boolean), public.close_dinner(uuid, date, integer, integer, text),
  public.dinner_summary(uuid, date), public.dinner_sheet(uuid, date), public.resident_evidence(uuid, date),
  public.start_laundry(uuid, uuid), public.finish_laundry(uuid), public.laundry_status(uuid),
  public.my_notifications(integer), public.mark_notification_read(bigint), public.unread_notifications_count()
from public, anon;

grant execute on function
  public.record_fridge_temperature(uuid, numeric, text),
  public.record_food_delivery(uuid, text, text, text, date, numeric, text),
  public.mark_dinner(uuid, date, uuid, boolean), public.close_dinner(uuid, date, integer, integer, text),
  public.dinner_summary(uuid, date), public.dinner_sheet(uuid, date),
  public.start_laundry(uuid, uuid), public.finish_laundry(uuid), public.laundry_status(uuid),
  public.my_notifications(integer), public.mark_notification_read(bigint), public.unread_notifications_count()
to authenticated;
