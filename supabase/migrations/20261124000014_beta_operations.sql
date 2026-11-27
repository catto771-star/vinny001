-- Beta — ajustes da operação (escopo final, seção 3).

-- ---------------------------------------------------------------------------
-- Room Check fora do horário exato.
-- Ronda ("Room Check Done") aceita até 60 min antes do horário (antes: 15 min) e grava a
-- hora real (occurred_at); o horário previsto fica em round_slot.
-- ---------------------------------------------------------------------------
create or replace function public.room_check_done(p_lodge uuid, p_day date, p_slot text)
returns jsonb
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
  if not (p_slot = any (public.round_slots())) then raise exception 'invalid_round_slot' using errcode = '22023'; end if;
  if public.slot_instant(p_day, p_slot) > now() + interval '60 minutes' then
    raise exception 'round_in_future' using errcode = '22023';
  end if;
  select id into v_id from public.handover_entries
  where lodge_id = p_lodge and operational_day = p_day and round_slot = p_slot and kind = 'round';
  if found then return jsonb_build_object('status', 'already_recorded', 'entry_id', v_id); end if;
  begin
    v_id := public.insert_handover_entry(p_lodge, 'round', 'Room Check Done', now(), '[]'::jsonb, null, p_day, p_slot);
  exception when unique_violation then
    select id into v_id from public.handover_entries
    where lodge_id = p_lodge and operational_day = p_day and round_slot = p_slot and kind = 'round';
    return jsonb_build_object('status', 'already_recorded', 'entry_id', v_id);
  end;
  return jsonb_build_object('status', 'recorded', 'entry_id', v_id);
end
$$;

-- Check da folha: a hora do check é a hora real em que foi aberto, se estiver a até 60 min
-- do horário previsto (antes ou depois). Aberto bem depois (digitação da folha de papel),
-- começa na hora prevista e pode ser ajustado.
create or replace function public.open_room_check(p_lodge uuid, p_day date, p_slot text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_staff_id();
  v_planned timestamptz;
  v_at timestamptz;
  v_id uuid;
  v_code text;
begin
  if v_me is null or not public.can_write_lodge(p_lodge) then
    raise exception 'not_authorised' using errcode = '42501';
  end if;
  if not (p_slot = any (public.check_slots(p_lodge, p_day))) then
    raise exception 'invalid_slot' using errcode = '22023';
  end if;
  v_planned := public.slot_instant(p_day, p_slot);
  if v_planned > now() + interval '60 minutes' then
    raise exception 'check_in_future' using errcode = '22023';
  end if;
  v_at := case when now() between v_planned - interval '60 minutes' and v_planned + interval '60 minutes'
                    and now() < public.operational_day_end(p_day)
               then now() else v_planned end;

  select id into v_id from public.room_check_runs
  where lodge_id = p_lodge and operational_day = p_day and slot = p_slot;
  if found then
    return v_id;
  end if;

  select code into v_code from public.lodges where id = p_lodge;
  insert into public.room_check_runs (lodge_id, operational_day, slot, checked_at, performed_by, entered_by, sheet_number)
  values (p_lodge, p_day, p_slot, v_at, v_me, v_me,
          left(v_code, 2) || '-' || to_char(p_day, 'YYYYMMDD') || '-' || replace(p_slot, ':', ''))
  on conflict (lodge_id, operational_day, slot) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.room_check_runs
    where lodge_id = p_lodge and operational_day = p_day and slot = p_slot;
  end if;
  return v_id;
end
$$;

-- ---------------------------------------------------------------------------
-- Laundry: o Handover registra exatamente o que começou e o que terminou
-- ("Wash started — A · Wash", "Dry finished — B · Dry"), com o residente mencionado.
-- ---------------------------------------------------------------------------
create or replace function public.laundry_entry_body(p_kind text, p_label text, p_finished boolean)
returns text
language sql immutable
as $$
  select case p_kind when 'wash' then 'Wash' else 'Dry' end
         || case when p_finished then ' finished — ' else ' started — ' end || p_label
$$;

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
  v_entry := public.insert_handover_entry(v_m.lodge_id, 'laundry', public.laundry_entry_body(v_m.kind, v_m.label, false), now(),
    case when p_stay is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('resident_id', v_stay.resident_id)) end);
  insert into public.laundry_uses (machine_id, lodge_id, stay_id, resident_id, started_by, handover_entry_id)
  values (p_machine, v_m.lodge_id, p_stay, v_stay.resident_id, public.current_staff_id(), v_entry)
  returning id into v_id;
  return v_id;
end
$$;

create or replace function public.finish_laundry(p_use uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_u public.laundry_uses;
  v_m public.laundry_machines;
begin
  select * into v_u from public.laundry_uses where id = p_use for update;
  if not found then raise exception 'use_not_found' using errcode = 'P0002'; end if;
  if public.current_staff_id() is null or not public.can_write_lodge(v_u.lodge_id) then
    raise exception 'not_authorised' using errcode = '42501';
  end if;
  if v_u.finished_at is not null then return; end if;
  select * into v_m from public.laundry_machines where id = v_u.machine_id;
  update public.laundry_uses set finished_at = now(), finished_by = public.current_staff_id() where id = p_use;
  perform public.insert_handover_entry(v_u.lodge_id, 'laundry', public.laundry_entry_body(v_m.kind, v_m.label, true), now(),
    case when v_u.resident_id is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('resident_id', v_u.resident_id)) end);
end
$$;
revoke all on function public.laundry_entry_body(text, text, boolean) from public;

-- ---------------------------------------------------------------------------
-- Dinner: liberado a qualquer hora do dia operacional (antes das 18h a tela pede confirmação).
-- Só um dia que ainda não começou é recusado.
-- ---------------------------------------------------------------------------
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
  if public.operational_day_start(p_day) > now() then
    raise exception 'dinner_not_started' using errcode = '22023';
  end if;
  v_service := public.ensure_dinner_service(p_lodge, p_day);
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

-- ---------------------------------------------------------------------------
-- Food Delivery: temperatura opcional (compras de mercado e itens secos, ex.: Tesco).
-- ---------------------------------------------------------------------------
alter table public.food_deliveries alter column temperature drop not null;

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
     or p_expiry is null then
    raise exception 'fields_required' using errcode = '22023';
  end if;
  insert into public.food_deliveries (lodge_id, product, supplier, batch, expiry_date, temperature, note, received_by)
  values (p_lodge, trim(p_product), trim(p_supplier), trim(p_batch), p_expiry, round(p_temperature, 1), nullif(trim(p_note), ''), public.current_staff_id())
  returning id into v_id;
  return v_id;
end
$$;

-- ---------------------------------------------------------------------------
-- Geladeiras: cada casa tem as suas (Amiens 1, Connolly 4); cada leitura é de uma geladeira.
-- ---------------------------------------------------------------------------
create table public.fridges (
  id uuid primary key default gen_random_uuid(),
  lodge_id uuid not null references public.lodges(id),
  code text not null check (length(trim(code)) > 0),
  name text not null check (length(trim(name)) > 0),
  sort_order integer not null default 0,
  active boolean not null default true,
  unique (lodge_id, code)
);
create trigger audit_fridges after insert or update or delete on public.fridges for each row execute function public.audit_row();

insert into public.fridges (lodge_id, code, name, sort_order)
select l.id, f.code, f.name, f.ord
from public.lodges l
join (values ('AMIENS', 'F1', 'Kitchen fridge', 1),
             ('CONNOLLY', 'F1', 'Fridge 1', 1), ('CONNOLLY', 'F2', 'Fridge 2', 2),
             ('CONNOLLY', 'F3', 'Fridge 3', 3), ('CONNOLLY', 'F4', 'Fridge 4', 4)) f(lodge, code, name, ord)
  on f.lodge = l.code;

alter table public.fridge_readings add column fridge_id uuid references public.fridges(id);
update public.fridge_readings r
   set fridge_id = (select f.id from public.fridges f where f.lodge_id = r.lodge_id order by f.sort_order limit 1);
alter table public.fridge_readings alter column fridge_id set not null;
create index fridge_readings_fridge_idx on public.fridge_readings(fridge_id, recorded_at desc);

alter table public.fridges enable row level security;
revoke all on public.fridges from anon, authenticated;
grant select on public.fridges to authenticated;
create policy fridges_read on public.fridges for select to authenticated using (public.is_active_staff());

create or replace function public.record_fridge_reading(p_fridge uuid, p_temperature numeric, p_note text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_f public.fridges;
  v_range jsonb;
  v_min numeric;
  v_max numeric;
  v_out boolean;
  v_id uuid;
begin
  select * into v_f from public.fridges where id = p_fridge and active;
  if not found then raise exception 'fridge_not_found' using errcode = 'P0002'; end if;
  if public.current_staff_id() is null or not public.can_write_lodge(v_f.lodge_id) then
    raise exception 'not_authorised' using errcode = '42501';
  end if;
  -- Em branco não é 0 °C.
  if p_temperature is null then raise exception 'temperature_required' using errcode = '22023'; end if;
  if p_temperature < -40 or p_temperature > 40 then raise exception 'invalid_temperature' using errcode = '22023'; end if;
  v_range := public.param_value('fridge.range_celsius', v_f.lodge_id);
  v_min := coalesce((v_range ->> 'min')::numeric, 0);
  v_max := coalesce((v_range ->> 'max')::numeric, 5);
  v_out := p_temperature < v_min or p_temperature > v_max;
  insert into public.fridge_readings (lodge_id, fridge_id, temperature, range_min, range_max, out_of_range, note, recorded_by)
  values (v_f.lodge_id, v_f.id, round(p_temperature, 1), v_min, v_max, v_out, nullif(trim(p_note), ''), public.current_staff_id())
  returning id into v_id;
  if v_out then
    insert into public.notifications (kind, audience, lodge_id, payload)
    values ('fridge_out_of_range', 'management', v_f.lodge_id,
            jsonb_build_object('reading_id', v_id, 'temperature', round(p_temperature, 1), 'min', v_min, 'max', v_max,
                               'fridge_id', v_f.id, 'fridge_name', v_f.name));
  end if;
  perform public.auto_sign_task(v_f.lodge_id, 'fridge_temperature');
  return v_id;
end
$$;

-- Chamada antiga (por casa): grava na primeira geladeira da casa.
create or replace function public.record_fridge_temperature(p_lodge uuid, p_temperature numeric, p_note text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fridge uuid;
begin
  select id into v_fridge from public.fridges where lodge_id = p_lodge and active order by sort_order limit 1;
  if v_fridge is null then raise exception 'fridge_not_found' using errcode = 'P0002'; end if;
  return public.record_fridge_reading(v_fridge, p_temperature, p_note);
end
$$;

revoke all on function public.record_fridge_reading(uuid, numeric, text) from public, anon;
grant execute on function public.record_fridge_reading(uuid, numeric, text) to authenticated;
