-- Revisão 8: isolamento das casas no banco. Conta de casa (station) só lê e grava na própria casa
-- (staff.home_lodge_id); Admin vê as duas. Sem casa definida = não vê nada (falha fechada).
-- O turno de Float aberto continua visível nas duas casas (quem e desde quando).

create or replace function public.house_scope()
returns uuid language sql stable security definer set search_path = public as $$
  select case when public.current_staff_role() = 'station'
              then (select s.home_lodge_id from public.staff s where s.id = public.current_staff_id()) end
$$;

-- auth.uid() nulo = contexto interno (migrações, agendador): sem restrição. Pela API, só equipe ativa.
create or replace function public.can_see_lodge(p_lodge uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is null
      or (public.is_active_staff() and (public.current_staff_role() is distinct from 'station' or p_lodge is not distinct from public.house_scope()))
$$;
grant execute on function public.house_scope(), public.can_see_lodge(uuid) to authenticated;

create or replace function public.can_write_lodge(p_lodge uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_management()
      or (public.current_staff_role() = 'station' and p_lodge = public.house_scope() and exists (select 1 from public.lodges where id = p_lodge and active))
      or exists (
        select 1 from public.duty_posts p
        where p.staff_id = public.current_staff_id() and p.ended_at is null
          and (p.function = 'float' or p.lodge_id = p_lodge)
      )
$$;

-- Políticas restritivas (somam-se às existentes): tabelas com lodge_id.
do $$
declare r record;
begin
  for r in
    select c.table_name as t from information_schema.columns c
    join information_schema.tables x on x.table_name = c.table_name and x.table_schema = 'public' and x.table_type = 'BASE TABLE'
    where c.table_schema = 'public' and c.column_name = 'lodge_id' and c.table_name <> 'handover_shifts'
  loop
    execute format('drop policy if exists house_scope on public.%I', r.t);
    execute format('create policy house_scope on public.%I as restrictive for select to authenticated using (lodge_id is null or public.can_see_lodge(lodge_id))', r.t);
  end loop;
end $$;

-- Turnos: o Float aberto aparece nas duas casas; o resto segue a casa.
drop policy if exists house_scope on public.handover_shifts;
create policy house_scope on public.handover_shifts as restrictive for select to authenticated
  using ((function = 'float' and closed_at is null) or public.can_see_lodge(lodge_id));

-- Lodges, camas e tabelas ligadas por pai.
drop policy if exists house_scope on public.lodges;
create policy house_scope on public.lodges as restrictive for select to authenticated using (public.can_see_lodge(id));
drop policy if exists house_scope on public.beds;
create policy house_scope on public.beds as restrictive for select to authenticated using (exists (select 1 from public.rooms r where r.id = beds.room_id and public.can_see_lodge(r.lodge_id)));
drop policy if exists house_scope on public.absences;
create policy house_scope on public.absences as restrictive for select to authenticated using (exists (select 1 from public.stays s where s.id = absences.stay_id and public.can_see_lodge(s.lodge_id)));
drop policy if exists house_scope on public.dinner_marks;
create policy house_scope on public.dinner_marks as restrictive for select to authenticated using (exists (select 1 from public.dinner_services d where d.id = dinner_marks.service_id and public.can_see_lodge(d.lodge_id)));
drop policy if exists house_scope on public.room_check_marks;
create policy house_scope on public.room_check_marks as restrictive for select to authenticated using (exists (select 1 from public.room_check_runs r where r.id = room_check_marks.run_id and public.can_see_lodge(r.lodge_id)));
drop policy if exists house_scope on public.handover_mentions;
create policy house_scope on public.handover_mentions as restrictive for select to authenticated using (exists (select 1 from public.handover_entries e where e.id = handover_mentions.entry_id and public.can_see_lodge(e.lodge_id)));
drop policy if exists house_scope on public.handover_entry_tags;
create policy house_scope on public.handover_entry_tags as restrictive for select to authenticated using (exists (select 1 from public.handover_entries e where e.id = handover_entry_tags.entry_id and public.can_see_lodge(e.lodge_id)));
drop policy if exists house_scope on public.handover_entry_staff;
create policy house_scope on public.handover_entry_staff as restrictive for select to authenticated using (exists (select 1 from public.handover_entries e where e.id = handover_entry_staff.entry_id and public.can_see_lodge(e.lodge_id)));
drop policy if exists house_scope on public.maintenance_events;
create policy house_scope on public.maintenance_events as restrictive for select to authenticated using (exists (select 1 from public.maintenance_tickets t where t.id = maintenance_events.ticket_id and public.can_see_lodge(t.lodge_id)));
drop policy if exists house_scope on public.maintenance_reminder_snoozes;
create policy house_scope on public.maintenance_reminder_snoozes as restrictive for select to authenticated using (exists (select 1 from public.maintenance_tickets t where t.id = maintenance_reminder_snoozes.ticket_id and public.can_see_lodge(t.lodge_id)));
drop policy if exists house_scope on public.product_movements;
create policy house_scope on public.product_movements as restrictive for select to authenticated using (public.can_see_lodge(from_lodge_id) or public.can_see_lodge(to_lodge_id));
-- Residente: sem estadia ainda (admissão em curso) ou com estadia numa casa visível.
drop policy if exists house_scope on public.residents;
create policy house_scope on public.residents as restrictive for select to authenticated using (
  not exists (select 1 from public.stays s where s.resident_id = residents.id)
  or exists (select 1 from public.stays s where s.resident_id = residents.id and public.can_see_lodge(s.lodge_id)));

-- Funções de leitura/escrita por casa: recusam a casa errada (a conta de casa só passa na dela).
CREATE OR REPLACE FUNCTION public.add_handover_note(p_lodge uuid, p_body text, p_occurred_at timestamp with time zone, p_mentions jsonb, p_late_reason text, p_filled_by uuid DEFAULT NULL::uuid, p_tags uuid[] DEFAULT NULL::uuid[], p_co_authors uuid[] DEFAULT NULL::uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_at timestamptz := coalesce(p_occurred_at, now());
  v_reasons jsonb := public.param_value('handover.late_reasons');
  v_id uuid;
  v_codes text[];
  v_co uuid[];
begin
    if not public.can_see_lodge(p_lodge) then raise exception 'not_authorised' using errcode = '42501'; end if;
  if public.current_staff_id() is null or not public.can_write_lodge(p_lodge) then
    raise exception 'not_authorised' using errcode = '42501';
  end if;
  if coalesce(trim(p_body), '') = '' then raise exception 'body_required' using errcode = '22023'; end if;
  if v_at > now() + interval '5 minutes' then raise exception 'invalid_time' using errcode = '22023'; end if;
  if p_filled_by is not null and not exists (
       select 1 from public.staff where id = p_filled_by and active and role in ('porter', 'manager', 'owner', 'developer')) then
    raise exception 'invalid_filled_by' using errcode = '22023';
  end if;
  -- Colegas: sem repetição e sem o próprio autor; no máximo 3.
  select coalesce(array_agg(x.id order by x.ord), '{}') into v_co
  from (select c.id, min(c.ord) as ord from unnest(coalesce(p_co_authors, '{}')) with ordinality c(id, ord)
        where c.id is distinct from p_filled_by group by c.id) x;
  if cardinality(v_co) > 3 then raise exception 'too_many_authors' using errcode = '22023'; end if;
  if exists (select 1 from unnest(v_co) c(id) where not exists (
       select 1 from public.staff s where s.id = c.id and s.active and s.role in ('porter', 'manager', 'owner', 'developer'))) then
    raise exception 'invalid_co_author' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(coalesce(p_tags, '{}')) t(id) where not exists (select 1 from public.handover_tags g where g.id = t.id and g.visible)) then
    raise exception 'invalid_tag' using errcode = '22023';
  end if;
  if now() > public.shift_end(v_at) and not public.is_management() then
    if p_late_reason is null or not (v_reasons ? p_late_reason) then
      raise exception 'late_reason_required' using errcode = '22023';
    end if;
  end if;
  perform set_config('app.filled_by', coalesce(p_filled_by::text, ''), true);
  v_id := public.insert_handover_entry(p_lodge, 'note', p_body, v_at, p_mentions,
    case when now() > public.shift_end(v_at) then p_late_reason end);
  perform set_config('app.filled_by', '', true);
  insert into public.handover_entry_tags (entry_id, tag_id) select distinct v_id, t from unnest(coalesce(p_tags, '{}')) t;
  insert into public.handover_entry_staff (entry_id, staff_id, position)
    select v_id, c.id, c.ord::smallint from unnest(v_co) with ordinality c(id, ord);
  select array_agg(g.code order by g.sort_order) into v_codes from public.handover_tags g where g.id = any (coalesce(p_tags, '{}'));
  if v_codes is not null then
    insert into public.notifications (kind, audience, lodge_id, payload)
    values ('handover_tag', 'management', p_lodge,
            jsonb_build_object('entry_id', v_id, 'tags', to_jsonb(v_codes), 'excerpt', left(trim(p_body), 140)));
  end if;
  return v_id;
end
$function$;

CREATE OR REPLACE FUNCTION public.add_work_interval(p_staff uuid, p_lodge uuid, p_start timestamp with time zone, p_end timestamp with time zone, p_note text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
begin
    if not public.can_see_lodge(p_lodge) then raise exception 'not_authorised' using errcode = '42501'; end if;
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  if p_staff is null or p_start is null or p_end is null or not isfinite(p_start) or not isfinite(p_end) or p_end <= p_start then
    raise exception 'invalid_period' using errcode = '22023';
  end if;
  if p_end - p_start > interval '24 hours' then raise exception 'interval_too_long' using errcode = '22023'; end if;
  if p_end > now() + interval '5 minutes' then raise exception 'in_future' using errcode = '22023'; end if;
  insert into public.work_intervals (staff_id, lodge_id, starts_at, ends_at, note, created_by)
  values (p_staff, p_lodge, p_start, p_end, nullif(trim(p_note), ''), public.current_staff_id())
  returning id into v_id;
  return v_id;
end
$function$;

CREATE OR REPLACE FUNCTION public.admit_resident(p_lodge uuid, p_bed uuid, p_resident_id uuid DEFAULT NULL::uuid, p_first_name text DEFAULT NULL::text, p_last_name text DEFAULT NULL::text, p_date_of_birth date DEFAULT NULL::date, p_pass_id text DEFAULT NULL::text, p_admitted_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_me uuid := public.current_staff_id();
  v_resident uuid := p_resident_id;
  v_stay uuid;
begin
    if not public.can_see_lodge(p_lodge) then raise exception 'not_authorised' using errcode = '42501'; end if;
  if v_me is null or not public.can_write_lodge(p_lodge) then
    raise exception 'not_authorised' using errcode = '42501';
  end if;
  if p_admitted_at is not null and p_admitted_at > now() + interval '5 minutes' then
    raise exception 'admitted_in_future' using errcode = '22023';
  end if;

  if v_resident is null then
    insert into public.residents (first_name, last_name, date_of_birth, pass_id, created_by)
    values (trim(p_first_name), coalesce(trim(p_last_name), ''), p_date_of_birth, nullif(trim(p_pass_id), ''), v_me)
    returning id into v_resident;
  end if;

  insert into public.stays (resident_id, lodge_id, bed_id, admitted_at, created_by)
  values (v_resident, p_lodge, p_bed, coalesce(p_admitted_at, now()), v_me)
  returning id into v_stay;

  return v_stay;
end
$function$;

CREATE OR REPLACE FUNCTION public.allocate_purchase_line(p_line uuid, p_lodge uuid, p_quantity numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_line public.purchase_lines;
  v_allocated numeric;
  v_id uuid;
begin
    if not public.can_see_lodge(p_lodge) then raise exception 'not_authorised' using errcode = '42501'; end if;
  if public.current_staff_id() is null or not public.can_write_lodge(p_lodge) then raise exception 'not_authorised' using errcode = '42501'; end if;
  select * into v_line from public.purchase_lines where id = p_line for update;
  if not found then raise exception 'line_not_found' using errcode = 'P0002'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'invalid_quantity' using errcode = '22023'; end if;
  select coalesce(sum(quantity), 0) into v_allocated from public.product_movements where purchase_line_id = p_line and kind = 'allocation';
  if v_allocated + p_quantity > v_line.quantity then raise exception 'exceeds_purchased_quantity' using errcode = '22023'; end if;
  insert into public.product_movements (kind, product_id, purchase_line_id, to_lodge_id, quantity, created_by)
  values ('allocation', v_line.product_id, p_line, p_lodge, p_quantity, public.current_staff_id())
  returning id into v_id;
  return v_id;
end
$function$;

CREATE OR REPLACE FUNCTION public.assume_post(p_function duty_function, p_lodge uuid DEFAULT NULL::uuid, p_confirm_takeover boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_me uuid := public.current_staff_id();
  v_role public.staff_role := public.current_staff_role();
  v_occupant public.duty_posts;
  v_occupant_name text;
  v_mine public.duty_posts;
  v_new public.duty_posts;
begin
    if not public.can_see_lodge(p_lodge) then raise exception 'not_authorised' using errcode = '42501'; end if;
  if v_me is null then
    raise exception 'not_authorised' using errcode = '42501';
  end if;

  -- Office: Porter. Float: Porter ou Manager (o Manager mantém as permissões de Manager).
  if p_function = 'office' and v_role <> 'porter' then
    raise exception 'role_cannot_take_office' using errcode = '42501';
  end if;
  if p_function = 'float' and v_role not in ('porter', 'manager') then
    raise exception 'role_cannot_take_float' using errcode = '42501';
  end if;

  if p_function = 'office' then
    if p_lodge is null or not exists (select 1 from public.lodges where id = p_lodge and active) then
      raise exception 'lodge_required' using errcode = '22023';
    end if;
  else
    p_lodge := null; -- Float cobre os dois Lodges
  end if;

  -- Serializa a troca de postos para não haver duas pessoas no mesmo posto.
  perform pg_advisory_xact_lock(hashtext('duty_posts'));

  select * into v_occupant from public.duty_posts p
  where p.ended_at is null
    and p.staff_id <> v_me
    and p.function = p_function
    and (p_function = 'float' or p.lodge_id = p_lodge);

  if found then
    if not p_confirm_takeover then
      select coalesce(s.display_name, s.full_name) into v_occupant_name
      from public.staff s where s.id = v_occupant.staff_id;
      return jsonb_build_object(
        'status', 'occupied',
        'occupant_staff_id', v_occupant.staff_id,
        'occupant_name', v_occupant_name,
        'since', v_occupant.started_at
      );
    end if;

    update public.duty_posts
       set ended_at = now(), ended_by = v_me, end_reason = 'taken_over'
     where id = v_occupant.id;
  end if;

  select * into v_mine from public.duty_posts p
  where p.staff_id = v_me and p.ended_at is null;

  if found then
    if v_mine.function = p_function and v_mine.lodge_id is not distinct from p_lodge then
      return jsonb_build_object('status', 'already_on_post', 'post_id', v_mine.id, 'since', v_mine.started_at);
    end if;
    update public.duty_posts
       set ended_at = now(), ended_by = v_me, end_reason = 'switched'
     where id = v_mine.id;
  end if;

  insert into public.duty_posts (staff_id, function, lodge_id)
  values (v_me, p_function, p_lodge)
  returning * into v_new;

  return jsonb_build_object(
    'status', 'assumed',
    'post_id', v_new.id,
    'since', v_new.started_at,
    'took_over_staff_id', v_occupant.staff_id
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.auto_sign_task(p_lodge uuid, p_key text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_day date := public.operational_day(now());
  v_shift text := public.shift_of(now());
  v_post public.duty_posts := public.my_open_post();
begin
    if not public.can_see_lodge(p_lodge) then raise exception 'not_authorised' using errcode = '42501'; end if;
  insert into public.task_signatures (lodge_id, operational_day, shift, template_id, staff_id, duty_function)
  select p_lodge, v_day, v_shift, t.task_id, public.current_staff_id(), coalesce(v_post.function::text, public.current_staff_role()::text)
  from public.shift_tasks(p_lodge, v_day, v_shift) t
  join public.task_templates tt on tt.id = t.task_id
  where t.kind = 'template' and tt.auto_key = p_key
  on conflict do nothing;
end
$function$;

CREATE OR REPLACE FUNCTION public.check_slots(p_lodge uuid, p_day date)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
begin
    if not public.can_see_lodge(p_lodge) then raise exception 'not_authorised' using errcode = '42501'; end if;
  return (select coalesce(array(
    select s from jsonb_array_elements_text(public.param_value('presence.check_times', p_lodge, public.operational_day_start(p_day))) s
    order by (s < '07:00'), s
  ), '{}'));
end
$function$;

CREATE OR REPLACE FUNCTION public.close_dinner(p_lodge uuid, p_day date, p_leftovers integer, p_packaged integer, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role public.staff_role := public.current_staff_role();
  v_service public.dinner_services;
begin
    if not public.can_see_lodge(p_lodge) then raise exception 'not_authorised' using errcode = '42501'; end if;
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
$function$;

CREATE OR REPLACE FUNCTION public.confirm_no_shows(p_lodge uuid, p_day date, p_stays uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_me uuid := public.current_staff_id();
  v_stay uuid;
  v_cand record;
  v_id uuid;
  v_count integer;
  v_limit integer := coalesce((public.param_value('presence.no_show_monthly_alert') #>> '{}')::int, 3);
  v_out jsonb := '[]'::jsonb;
begin
    if not public.can_see_lodge(p_lodge) then raise exception 'not_authorised' using errcode = '42501'; end if;
  if v_me is null or not public.can_write_lodge(p_lodge) then
    raise exception 'not_authorised' using errcode = '42501';
  end if;
  if now() < public.operational_day_end(p_day) - interval '30 minutes' then
    raise exception 'day_not_finished' using errcode = '22023';
  end if;
  if cardinality(public.pending_slots(p_lodge, p_day)) > 0 then
    raise exception 'checks_pending' using errcode = '22023';
  end if;

  foreach v_stay in array coalesce(p_stays, '{}') loop
    select * into v_cand from public.residents_without_evidence(p_lodge, p_day, public.operational_day_end(p_day)) c
    where c.stay_id = v_stay;
    if not found then
      raise exception 'not_a_candidate' using errcode = '22023';
    end if;
    insert into public.no_shows (resident_id, stay_id, lodge_id, operational_day, confirmed_by)
    values (v_cand.resident_id, v_stay, p_lodge, p_day, v_me)
    returning id into v_id;
    v_count := public.no_show_month_count(v_cand.resident_id, v_stay, p_day);
    if v_count >= v_limit then
      insert into public.notifications (kind, audience, lodge_id, resident_id, payload)
      values ('no_show_monthly_limit', 'management', p_lodge, v_cand.resident_id, jsonb_build_object(
        'no_show_id', v_id, 'month_count', v_count, 'operational_day', p_day,
        'first_name', v_cand.first_name, 'last_name', v_cand.last_name));
    end if;
    v_out := v_out || jsonb_build_object('stay_id', v_stay, 'resident_id', v_cand.resident_id, 'no_show_id', v_id, 'month_count', v_count);
  end loop;
  return v_out;
end
$function$;

CREATE OR REPLACE FUNCTION public.create_extra_task(p_lodge uuid, p_day date, p_shift text, p_staff uuid, p_title text, p_due_at timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
begin
    if not public.can_see_lodge(p_lodge) then raise exception 'not_authorised' using errcode = '42501'; end if;
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  insert into public.task_extras (lodge_id, operational_day, shift, staff_id, title, due_at, created_by)
  values (p_lodge, p_day, p_shift, p_staff, trim(p_title), p_due_at, public.current_staff_id())
  returning id into v_id;
  return v_id;
end
$function$;

CREATE OR REPLACE FUNCTION public.create_maintenance(p_lodge uuid, p_location text, p_description text, p_priority text, p_request_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_existing public.maintenance_tickets;
  v_entry uuid;
  v_id uuid;
  v_hours integer;
begin
    if not public.can_see_lodge(p_lodge) then raise exception 'not_authorised' using errcode = '42501'; end if;
  if public.current_staff_id() is null or not public.can_write_lodge(p_lodge) then
    raise exception 'not_authorised' using errcode = '42501';
  end if;
  select * into v_existing from public.maintenance_tickets where request_key = p_request_key;
  if found then
    return jsonb_build_object('ticket_id', v_existing.id, 'entry_id', v_existing.handover_entry_id, 'duplicate', true);
  end if;
  if p_priority not in ('urgent', 'normal', 'low') then raise exception 'invalid_priority' using errcode = '22023'; end if;
  v_hours := coalesce((public.param_value('maintenance.default_deadline_hours') ->> p_priority)::int, 168);
  v_entry := public.insert_handover_entry(p_lodge, 'maintenance', trim(p_location) || ' — ' || trim(p_description), now(), '[]'::jsonb);
  insert into public.maintenance_tickets (lodge_id, location, description, priority, deadline_at, request_key, handover_entry_id, created_by)
  values (p_lodge, trim(p_location), trim(p_description), p_priority, now() + make_interval(hours => v_hours), p_request_key, v_entry, public.current_staff_id())
  returning id into v_id;
  insert into public.maintenance_events (ticket_id, kind, to_value, staff_id) values (v_id, 'created', 'open', public.current_staff_id());
  insert into public.notifications (kind, audience, lodge_id, payload)
  values ('maintenance_opened', 'management', p_lodge, jsonb_build_object('ticket_id', v_id, 'location', trim(p_location), 'priority', p_priority));
  return jsonb_build_object('ticket_id', v_id, 'entry_id', v_entry, 'duplicate', false);
end
$function$;

CREATE OR REPLACE FUNCTION public.create_task_template(p_lodge uuid, p_shift text, p_weekdays integer[], p_title jsonb, p_sort integer, p_suggested_time text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
begin
    if not public.can_see_lodge(p_lodge) then raise exception 'not_authorised' using errcode = '42501'; end if;
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  insert into public.task_templates (lodge_id, shift, weekdays, title, sort_order, suggested_time, created_by)
  values (p_lodge, p_shift, p_weekdays, p_title, coalesce(p_sort, 0), p_suggested_time, public.current_staff_id())
  returning id into v_id;
  return v_id;
end
$function$;

CREATE OR REPLACE FUNCTION public.dinner_sheet(p_lodge uuid, p_day date)
 RETURNS TABLE(stay_id uuid, resident_id uuid, first_name text, last_name text, room_kind room_kind, room_code text, room_sort integer, bed_number integer, served boolean, marked_by uuid, final_warning boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
begin
    if not public.can_see_lodge(p_lodge) then raise exception 'not_authorised' using errcode = '42501'; end if;
  return query select st.id, st.resident_id, r.first_name, r.last_name, rm.kind, rm.code, rm.sort_order, b.number, m.served, m.marked_by,
         public.has_final_warning(st.resident_id)
  from public.dinner_stays(p_lodge, p_day) st
  join public.residents r on r.id = st.resident_id
  join public.beds b on b.id = st.bed_id
  join public.rooms rm on rm.id = b.room_id
  left join public.dinner_services s on s.lodge_id = p_lodge and s.operational_day = p_day
  left join public.dinner_marks m on m.service_id = s.id and m.stay_id = st.id
  where public.is_active_staff()
  order by rm.sort_order, rm.code, b.number;
end
$function$;

CREATE OR REPLACE FUNCTION public.dinner_stays(p_lodge uuid, p_day date)
 RETURNS SETOF stays
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
begin
    if not public.can_see_lodge(p_lodge) then raise exception 'not_authorised' using errcode = '42501'; end if;
  return query select * from public.stays s
  where s.lodge_id = p_lodge
    and s.admitted_at < public.slot_instant(p_day, '22:00')
    and (s.ended_at is null or s.ended_at > public.slot_instant(p_day, '18:00'));
end
$function$;

CREATE OR REPLACE FUNCTION public.dinner_summary(p_lodge uuid, p_day date)
 RETURNS TABLE(service_id uuid, leftovers integer, packaged integer, close_note text, closed_at timestamp with time zone, closed_by uuid, edited_at timestamp with time zone, edited_by uuid, served_count integer, not_served_count integer, residents_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
begin
    if not public.can_see_lodge(p_lodge) then raise exception 'not_authorised' using errcode = '42501'; end if;
  return query select s.id, s.leftovers, s.packaged, s.close_note, s.closed_at, s.closed_by, s.edited_at, s.edited_by,
         (select count(*)::int from public.dinner_marks m where m.service_id = s.id and m.served),
         (select count(*)::int from public.dinner_marks m where m.service_id = s.id and not m.served),
         (select count(*)::int from public.dinner_stays(p_lodge, p_day))
  from (select 1) one
  left join public.dinner_services s on s.lodge_id = p_lodge and s.operational_day = p_day
  where public.is_active_staff();
end
$function$;

CREATE OR REPLACE FUNCTION public.ensure_dinner_service(p_lodge uuid, p_day date)
 RETURNS dinner_services
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v public.dinner_services;
begin
    if not public.can_see_lodge(p_lodge) then raise exception 'not_authorised' using errcode = '42501'; end if;
  if not exists (select 1 from public.lodges where id = p_lodge and has_dinner) then
    raise exception 'service_not_available' using errcode = '22023';
  end if;
  insert into public.dinner_services (lodge_id, operational_day) values (p_lodge, p_day)
  on conflict (lodge_id, operational_day) do nothing;
  select * into v from public.dinner_services where lodge_id = p_lodge and operational_day = p_day;
  return v;
end
$function$;

CREATE OR REPLACE FUNCTION public.insert_handover_entry(p_lodge uuid, p_kind text, p_body text, p_occurred_at timestamp with time zone, p_mentions jsonb, p_late_reason text DEFAULT NULL::text, p_round_day date DEFAULT NULL::date, p_round_slot text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_m jsonb;
begin
    if not public.can_see_lodge(p_lodge) then raise exception 'not_authorised' using errcode = '42501'; end if;
  insert into public.handover_entries (lodge_id, kind, body, occurred_at, operational_day, round_slot, author_id, late_reason)
  values (p_lodge, p_kind, trim(p_body), p_occurred_at, coalesce(p_round_day, public.operational_day(p_occurred_at)),
          p_round_slot, public.current_staff_id(), p_late_reason)
  returning id into v_id;
  for v_m in select * from jsonb_array_elements(coalesce(p_mentions, '[]'::jsonb)) loop
    insert into public.handover_mentions (entry_id, resident_id, staff_id)
    values (v_id, nullif(v_m ->> 'resident_id', '')::uuid, nullif(v_m ->> 'staff_id', '')::uuid);
  end loop;
  return v_id;
end
$function$;

CREATE OR REPLACE FUNCTION public.laundry_status(p_lodge uuid)
 RETURNS TABLE(machine_id uuid, code text, label text, kind text, use_id uuid, started_at timestamp with time zone, started_by uuid, resident_id uuid, first_name text, last_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
begin
    if not public.can_see_lodge(p_lodge) then raise exception 'not_authorised' using errcode = '42501'; end if;
  return query select m.id, m.code, m.label, m.kind, u.id, u.started_at, u.started_by, u.resident_id, r.first_name, r.last_name
  from public.laundry_machines m
  left join public.laundry_uses u on u.machine_id = m.id and u.finished_at is null
  left join public.residents r on r.id = u.resident_id
  where public.is_active_staff() and m.lodge_id = p_lodge and m.active
  order by m.sort_order;
end
$function$;

CREATE OR REPLACE FUNCTION public.maintenance_list(p_lodge uuid)
 RETURNS TABLE(id uuid, lodge_id uuid, location text, description text, priority text, status text, deadline_at timestamp with time zone, created_at timestamp with time zone, created_by uuid, resolved_at timestamp with time zone, overdue boolean, last_event_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
begin
    if not public.can_see_lodge(p_lodge) then raise exception 'not_authorised' using errcode = '42501'; end if;
  return query select t.id, t.lodge_id, t.location, t.description, t.priority, t.status, t.deadline_at, t.created_at, t.created_by, t.resolved_at,
         t.status <> 'resolved' and t.deadline_at < now(),
         (select max(e.at) from public.maintenance_events e where e.ticket_id = t.id)
  from public.maintenance_tickets t
  where public.is_active_staff() and (p_lodge is null or t.lodge_id = p_lodge)
  order by (t.status = 'resolved'), t.deadline_at;
end
$function$;

CREATE OR REPLACE FUNCTION public.mark_dinner(p_lodge uuid, p_day date, p_stay uuid, p_served boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_service public.dinner_services;
  v_stay public.stays;
  v_mark public.dinner_marks;
begin
    if not public.can_see_lodge(p_lodge) then raise exception 'not_authorised' using errcode = '42501'; end if;
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
$function$;

CREATE OR REPLACE FUNCTION public.match_rota_shift(p_staff uuid, p_lodge uuid, p_at timestamp with time zone, p_function text DEFAULT 'office'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
begin
    if not public.can_see_lodge(p_lodge) then raise exception 'not_authorised' using errcode = '42501'; end if;
  return (select r.id from public.rota_shifts r
  where r.staff_id = p_staff and r.status = 'published'
    and case when p_function = 'float' then r.function = 'float' else (r.lodge_id = p_lodge or r.lodge_id is null) end
    and r.starts_at - interval '3 hours' <= p_at and r.ends_at > p_at
  order by abs(extract(epoch from r.starts_at - p_at))
  limit 1);
end
$function$;

CREATE OR REPLACE FUNCTION public.no_show_review(p_lodge uuid, p_day date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_end timestamptz := public.operational_day_end(p_day);
begin
    if not public.can_see_lodge(p_lodge) then raise exception 'not_authorised' using errcode = '42501'; end if;
  if not public.is_active_staff() then raise exception 'not_authorised' using errcode = '42501'; end if;
  return jsonb_build_object(
    'operational_day', p_day,
    'day_finished', now() >= v_end - interval '30 minutes',
    'pending_slots', to_jsonb(public.pending_slots(p_lodge, p_day)),
    'complete', cardinality(public.pending_slots(p_lodge, p_day)) = 0,
    'candidates', coalesce((
      select jsonb_agg(to_jsonb(c) || jsonb_build_object(
        'month_count', public.no_show_month_count(c.resident_id, c.stay_id, p_day)))
      from public.residents_without_evidence(p_lodge, p_day, v_end) c
    ), '[]'::jsonb),
    'confirmed', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', n.id, 'stay_id', n.stay_id, 'resident_id', n.resident_id,
        'first_name', r.first_name, 'last_name', r.last_name,
        'status', n.status, 'confirmed_at', n.confirmed_at, 'undo_reason', n.undo_reason,
        'month_count', public.no_show_month_count(n.resident_id, n.stay_id, p_day)) order by r.first_name)
      from public.no_shows n join public.residents r on r.id = n.resident_id
      where n.lodge_id = p_lodge and n.operational_day = p_day
    ), '[]'::jsonb)
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.on_duty_staff(p_lodge uuid, p_at timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
begin
    if not public.can_see_lodge(p_lodge) then raise exception 'not_authorised' using errcode = '42501'; end if;
  return (select r.staff_id from public.rota_shifts r
  where r.status = 'published' and r.starts_at <= p_at and r.ends_at > p_at
    and ((r.function = 'office' and r.lodge_id = p_lodge) or r.function = 'float')
  order by (r.function = 'office') desc, r.starts_at desc
  limit 1);
end
$function$;

CREATE OR REPLACE FUNCTION public.open_handover_shift(p_lodge uuid, p_staff uuid, p_function text DEFAULT 'office'::text, p_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_name text;
  v_fn text := coalesce(p_function, 'office');
  v_at timestamptz := coalesce(p_at, now());
begin
    if not public.can_see_lodge(p_lodge) then raise exception 'not_authorised' using errcode = '42501'; end if;
  if public.current_staff_id() is null or not public.can_write_lodge(p_lodge) then
    raise exception 'not_authorised' using errcode = '42501';
  end if;
  if v_fn not in ('office', 'float') then raise exception 'invalid_function' using errcode = '22023'; end if;
  if v_at > now() + interval '5 minutes' or v_at < now() - interval '24 hours' then raise exception 'invalid_time' using errcode = '22023'; end if;
  select coalesce(display_name, full_name) into v_name from public.staff
  where id = p_staff and active and role in ('porter', 'manager', 'owner', 'developer');
  if v_name is null then raise exception 'invalid_filled_by' using errcode = '22023'; end if;
  if exists (select 1 from public.handover_shifts where closed_at is null and function = v_fn and (v_fn = 'float' or lodge_id = p_lodge)) then
    raise exception 'shift_already_open' using errcode = '23505';
  end if;
  insert into public.handover_shifts (lodge_id, staff_id, opened_by, rota_shift_id, function, opened_at)
  values (p_lodge, p_staff, public.current_staff_id(), public.match_rota_shift(p_staff, p_lodge, v_at, v_fn), v_fn, v_at)
  returning id into v_id;
  insert into public.handover_entries (lodge_id, kind, body, occurred_at, operational_day, author_id, shift_id, filled_by)
  values (p_lodge, 'shift', case when v_fn = 'float' then 'Float shift opened — ' else 'Shift opened — ' end || v_name,
          v_at, public.operational_day(v_at), public.current_staff_id(), case when v_fn = 'office' then v_id end, p_staff);
  return v_id;
end
$function$;

CREATE OR REPLACE FUNCTION public.open_room_check(p_lodge uuid, p_day date, p_slot text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_me uuid := public.current_staff_id();
  v_planned timestamptz;
  v_at timestamptz;
  v_id uuid;
  v_code text;
begin
    if not public.can_see_lodge(p_lodge) then raise exception 'not_authorised' using errcode = '42501'; end if;
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
$function$;

CREATE OR REPLACE FUNCTION public.overdue_absences(p_lodge uuid)
 RETURNS TABLE(absence_id uuid, stay_id uuid, resident_id uuid, first_name text, last_name text, starts_at timestamp with time zone, expected_return_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
begin
    if not public.can_see_lodge(p_lodge) then raise exception 'not_authorised' using errcode = '42501'; end if;
  return query select a.id, a.stay_id, a.resident_id, r.first_name, r.last_name, a.starts_at, a.expected_return_at
  from public.absences a
  join public.stays s on s.id = a.stay_id
  join public.residents r on r.id = a.resident_id
  where public.is_active_staff() and s.lodge_id = p_lodge and s.status <> 'ended'
    and a.ended_at is null and a.expected_return_at < now()
  order by a.expected_return_at;
end
$function$;

CREATE OR REPLACE FUNCTION public.pending_counts(p_lodge uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
begin
    if not public.can_see_lodge(p_lodge) then raise exception 'not_authorised' using errcode = '42501'; end if;
  return (select case when not public.is_active_staff() then null else jsonb_build_object(
    'tasks', (select count(*) from public.pending_tasks(p_lodge)),
    'maintenance', (select count(*) from public.maintenance_tickets t where t.lodge_id = p_lodge and t.status <> 'resolved'),
    'absences', (select count(*) from public.overdue_absences(p_lodge)),
    'checks', cardinality(public.pending_slots(p_lodge, public.operational_day(now()), now())),
    'rounds', cardinality(public.pending_rounds(p_lodge)),
    'no_shows', (select count(*) from public.residents_without_evidence(p_lodge, public.operational_day(now()) - 1,
                                                                     public.operational_day_end(public.operational_day(now()) - 1)))
  ) end);
end
$function$;

CREATE OR REPLACE FUNCTION public.pending_rounds(p_lodge uuid)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
begin
    if not public.can_see_lodge(p_lodge) then raise exception 'not_authorised' using errcode = '42501'; end if;
  return (select coalesce(array(
    select s from unnest(public.round_slots()) s
    where public.is_active_staff()
      and public.slot_instant(public.operational_day(now()), s) + interval '30 minutes' <= now()
      and not exists (
        select 1 from public.handover_entries e
        where e.lodge_id = p_lodge and e.kind = 'round'
          and e.operational_day = public.operational_day(now()) and e.round_slot = s)
    order by (s < '07:00'), s
  ), '{}'));
end
$function$;

CREATE OR REPLACE FUNCTION public.pending_slots(p_lodge uuid, p_day date, p_until timestamp with time zone DEFAULT 'infinity'::timestamp with time zone)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
begin
    if not public.can_see_lodge(p_lodge) then raise exception 'not_authorised' using errcode = '42501'; end if;
  return (select coalesce(array(
    select s from unnest(public.check_slots(p_lodge, p_day)) s
    where public.slot_instant(p_day, s) <= p_until
      and not exists (
        select 1 from public.room_check_runs r
        where r.lodge_id = p_lodge and r.operational_day = p_day and r.slot = s and r.status = 'launched')
    order by (s < '07:00'), s
  ), '{}'));
end
$function$;

CREATE OR REPLACE FUNCTION public.pending_tasks(p_lodge uuid)
 RETURNS TABLE(kind text, task_id uuid, title jsonb, operational_day date, shift text, staff_id uuid, due_at timestamp with time zone, overdue boolean, overdue_since timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
begin
    if not public.can_see_lodge(p_lodge) then raise exception 'not_authorised' using errcode = '42501'; end if;
  return query with shifts as (
    select d::date as day, s as shift
    from generate_series(public.operational_day(now()) - 6, public.operational_day(now()), interval '1 day') d,
         unnest(array['day', 'night']) s
    where public.shift_start_of(d::date, s) <= now()
  )
  select t.kind, t.task_id, t.title, sh.day, sh.shift, t.staff_id, t.due_at,
         coalesce(t.due_at, public.shift_end_of(sh.day, sh.shift)) < now(),
         case when coalesce(t.due_at, public.shift_end_of(sh.day, sh.shift)) < now()
              then coalesce(t.due_at, public.shift_end_of(sh.day, sh.shift)) end
  from shifts sh
  cross join lateral public.shift_tasks(p_lodge, sh.day, sh.shift) t
  where jsonb_array_length(t.signatures) = 0
  order by 4, 5, t.sort_order;
end
$function$;

CREATE OR REPLACE FUNCTION public.presence_alert(p_lodge uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_day date := public.operational_day(now());
begin
    if not public.can_see_lodge(p_lodge) then raise exception 'not_authorised' using errcode = '42501'; end if;
  if not public.is_active_staff() then raise exception 'not_authorised' using errcode = '42501'; end if;
  return jsonb_build_object(
    'operational_day', v_day,
    'pending_slots', to_jsonb(public.pending_slots(p_lodge, v_day, now())),
    'complete', cardinality(public.pending_slots(p_lodge, v_day, now())) = 0,
    'without_evidence', coalesce((
      select jsonb_agg(to_jsonb(c)) from public.residents_without_evidence(p_lodge, v_day, now()) c
    ), '[]'::jsonb)
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.record_food_delivery(p_lodge uuid, p_product text, p_supplier text, p_batch text, p_expiry date, p_temperature numeric, p_note text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
begin
    if not public.can_see_lodge(p_lodge) then raise exception 'not_authorised' using errcode = '42501'; end if;
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
  if p_temperature is not null and (p_temperature < -40 or p_temperature > 99) then
    raise exception 'invalid_temperature' using errcode = '22023';
  end if;
  insert into public.food_deliveries (lodge_id, product, supplier, batch, expiry_date, temperature, note, received_by)
  values (p_lodge, trim(p_product), trim(p_supplier), trim(p_batch), p_expiry, round(p_temperature, 1), nullif(trim(p_note), ''), public.current_staff_id())
  returning id into v_id;
  return v_id;
end
$function$;

CREATE OR REPLACE FUNCTION public.record_fridge_temperature(p_lodge uuid, p_temperature numeric, p_note text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_fridge uuid;
begin
    if not public.can_see_lodge(p_lodge) then raise exception 'not_authorised' using errcode = '42501'; end if;
  select id into v_fridge from public.fridges where lodge_id = p_lodge and active order by sort_order limit 1;
  if v_fridge is null then raise exception 'fridge_not_found' using errcode = 'P0002'; end if;
  return public.record_fridge_reading(v_fridge, p_temperature, p_note);
end
$function$;

CREATE OR REPLACE FUNCTION public.record_sighting(p_resident uuid, p_lodge uuid, p_seen_at timestamp with time zone, p_place text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_at timestamptz := coalesce(p_seen_at, now());
  v_stay public.stays;
  v_absence public.absences;
  v_id uuid;
begin
    if not public.can_see_lodge(p_lodge) then raise exception 'not_authorised' using errcode = '42501'; end if;
  if not public.can_write_lodge(p_lodge) then raise exception 'not_authorised' using errcode = '42501'; end if;
  if v_at > now() + interval '5 minutes' then raise exception 'invalid_seen_time' using errcode = '22023'; end if;
  select * into v_stay from public.stays_present_at(p_lodge, v_at) s where s.resident_id = p_resident;
  if not found then raise exception 'resident_not_in_lodge' using errcode = '22023'; end if;
  insert into public.sightings (resident_id, lodge_id, seen_at, place, recorded_by)
  values (p_resident, p_lodge, v_at, nullif(trim(p_place), ''), public.current_staff_id())
  returning id into v_id;
  v_absence := public.active_absence(v_stay.id, v_at);
  return jsonb_build_object('sighting_id', v_id, 'absence_active', v_absence.id is not null, 'absence_id', v_absence.id);
end
$function$;

CREATE OR REPLACE FUNCTION public.report_details(p_lodge uuid, p_month date, p_metric text)
 RETURNS TABLE(ref_id text, label text, at timestamp with time zone, extra text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
    if not public.can_see_lodge(p_lodge) then raise exception 'not_authorised' using errcode = '42501'; end if;
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  perform public.check_month(p_month);
  return query select d.ref_id, d.label, d.at, d.extra
    from public.report_details_period(array[p_lodge], date_trunc('month', p_month)::date, (date_trunc('month', p_month) + interval '1 month')::date, p_metric) d;
end
$function$;

CREATE OR REPLACE FUNCTION public.report_details_period(p_lodges uuid[], p_from date, p_to date, p_metric text)
 RETURNS TABLE(ref_id text, label text, at timestamp with time zone, extra text, lodge_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_from timestamptz;
  v_to timestamptz;
  v_d1 date := p_from;
  v_d2 date := p_to;
begin
    if exists (select 1 from unnest(coalesce(p_lodges, '{}')) l(id) where not public.can_see_lodge(l.id)) then raise exception 'not_authorised' using errcode = '42501'; end if;
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  perform public.check_period(p_lodges, p_from, p_to);
  v_from := public.operational_day_start(p_from);
  v_to := public.operational_day_start(p_to);
  return query
  select x.ref_id, x.label, x.at, x.extra, x.lodge_id from (
    -- Ocupação e movimentação
    select s.id::text as ref_id, r.first_name || ' ' || r.last_name as label, s.admitted_at as at, null::text as extra, 'occupancy.admissions' as metric, s.lodge_id as lodge_id
    from public.stays s join public.residents r on r.id = s.resident_id
    where p_metric = 'occupancy.admissions' and s.lodge_id = any (p_lodges) and s.transfer_from_stay_id is null and s.admitted_at >= v_from and s.admitted_at < v_to
    union all
    select s.id::text, r.first_name || ' ' || r.last_name, s.ended_at, s.out_reason, 'occupancy.outs', s.lodge_id
    from public.stays s join public.residents r on r.id = s.resident_id
    where p_metric = 'occupancy.outs' and s.lodge_id = any (p_lodges) and s.end_reason = 'out' and s.ended_at >= v_from and s.ended_at < v_to
    union all
    select s.id::text, r.first_name || ' ' || r.last_name, s.admitted_at, null, 'occupancy.transfers_in', s.lodge_id
    from public.stays s join public.residents r on r.id = s.resident_id
    where p_metric = 'occupancy.transfers_in' and s.lodge_id = any (p_lodges) and s.transfer_from_stay_id is not null and s.admitted_at >= v_from and s.admitted_at < v_to
    union all
    select s.id::text, r.first_name || ' ' || r.last_name, s.ended_at, null, 'occupancy.transfers_out', s.lodge_id
    from public.stays s join public.residents r on r.id = s.resident_id
    where p_metric = 'occupancy.transfers_out' and s.lodge_id = any (p_lodges) and s.end_reason = 'transfer' and s.ended_at >= v_from and s.ended_at < v_to
    -- Manutenção
    union all
    select t.id::text, t.location || ' — ' || t.description, t.created_at, t.priority, 'maintenance.opened', t.lodge_id
    from public.maintenance_tickets t where p_metric = 'maintenance.opened' and t.lodge_id = any (p_lodges) and t.created_at >= v_from and t.created_at < v_to
    union all
    select t.id::text, t.location || ' — ' || t.description, t.resolved_at, t.priority, 'maintenance.resolved', t.lodge_id
    from public.maintenance_tickets t where p_metric = 'maintenance.resolved' and t.lodge_id = any (p_lodges) and t.resolved_at >= v_from and t.resolved_at < v_to
    union all
    select t.id::text, t.location || ' — ' || t.description, t.deadline_at, t.priority, 'maintenance.overdue', t.lodge_id
    from public.maintenance_tickets t where p_metric = 'maintenance.overdue' and t.lodge_id = any (p_lodges) and t.status <> 'resolved' and t.deadline_at < least(now(), v_to)
    union all
    select t.id::text, t.location || ' — ' || t.description, t.created_at, t.status, 'maintenance.on_hold', t.lodge_id
    from public.maintenance_tickets t where p_metric = 'maintenance.on_hold' and t.lodge_id = any (p_lodges) and t.status = 'on_hold'
    union all
    select t.id::text, t.location || ' — ' || t.description, t.created_at, t.status, 'maintenance.in_progress', t.lodge_id
    from public.maintenance_tickets t where p_metric = 'maintenance.in_progress' and t.lodge_id = any (p_lodges) and t.status = 'in_progress'
    -- No Shows
    union all
    select n.id::text, r.first_name || ' ' || r.last_name, n.confirmed_at, n.operational_day::text, 'no_shows.total', n.lodge_id
    from public.no_shows n join public.residents r on r.id = n.resident_id
    where p_metric = 'no_shows.total' and n.lodge_id = any (p_lodges) and n.status = 'confirmed' and n.operational_day >= v_d1 and n.operational_day < v_d2
    union all
    select n.id::text, r.first_name || ' ' || r.last_name, n.undone_at, n.undo_reason, 'no_shows.undone', n.lodge_id
    from public.no_shows n join public.residents r on r.id = n.resident_id
    where p_metric = 'no_shows.undone' and n.lodge_id = any (p_lodges) and n.status = 'undone' and n.operational_day >= v_d1 and n.operational_day < v_d2
    -- Warnings
    union all
    select w.id::text, r.first_name || ' ' || r.last_name, w.issued_at, w.note, 'warnings.' || w.type, w.lodge_id
    from public.warnings w join public.residents r on r.id = w.resident_id
    where p_metric = 'warnings.' || w.type and w.lodge_id = any (p_lodges) and w.issued_at >= v_from and w.issued_at < v_to
    -- Temperatura
    union all
    select f.id::text, f.temperature::text || ' °C', f.recorded_at, f.note, 'temperature.alerts', f.lodge_id
    from public.fridge_readings f where p_metric = 'temperature.alerts' and f.lodge_id = any (p_lodges) and f.out_of_range and f.recorded_at >= v_from and f.recorded_at < v_to
    -- Dinner e lavanderia
    union all
    select m.id::text, r.first_name || ' ' || r.last_name, m.marked_at, ds.operational_day::text, 'dinner.served', ds.lodge_id
    from public.dinner_marks m join public.dinner_services ds on ds.id = m.service_id join public.residents r on r.id = m.resident_id
    where p_metric = 'dinner.served' and ds.lodge_id = any (p_lodges) and m.served and ds.operational_day >= v_d1 and ds.operational_day < v_d2
    union all
    select u.id::text, coalesce(r.first_name || ' ' || r.last_name, '—'), u.started_at, null, 'laundry.uses', u.lodge_id
    from public.laundry_uses u left join public.residents r on r.id = u.resident_id
    where p_metric = 'laundry.uses' and u.lodge_id = any (p_lodges) and u.started_at >= v_from and u.started_at < v_to
    -- Lançamentos fora do turno no Handover
    union all
    select e.id::text, e.body, e.occurred_at, e.late_reason, 'late_entries.total', e.lodge_id
    from public.handover_entries e where p_metric = 'late_entries.total' and e.lodge_id = any (p_lodges) and e.late_reason is not null and e.occurred_at >= v_from and e.occurred_at < v_to
  ) x
  order by x.at nulls last;
end
$function$;

CREATE OR REPLACE FUNCTION public.report_monthly(p_lodge uuid, p_month date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
    if not public.can_see_lodge(p_lodge) then raise exception 'not_authorised' using errcode = '42501'; end if;
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  perform public.check_month(p_month);
  return public.report_period(array[p_lodge], date_trunc('month', p_month)::date, (date_trunc('month', p_month) + interval '1 month')::date);
end
$function$;

CREATE OR REPLACE FUNCTION public.report_period(p_lodges uuid[], p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_d1 date := p_from;
  v_d2 date := p_to;
  v_from timestamptz;
  v_to timestamptz;
  v_until timestamptz;
  v_beds integer;
  v_has_dinner boolean;
  v_has_laundry boolean;
  n integer;
  r jsonb := '{}'::jsonb;
  cnt text;
begin
    if exists (select 1 from unnest(coalesce(p_lodges, '{}')) l(id) where not public.can_see_lodge(l.id)) then raise exception 'not_authorised' using errcode = '42501'; end if;
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  perform public.check_period(p_lodges, p_from, p_to);
  v_from := public.operational_day_start(v_d1);
  v_to := public.operational_day_start(v_d2);
  v_until := least(v_to, now());
  select count(*) into v_beds from public.beds b join public.rooms rm on rm.id = b.room_id where rm.lodge_id = any (p_lodges) and b.active and rm.active;
  select bool_or(has_dinner), bool_or(has_laundry) into v_has_dinner, v_has_laundry from public.lodges where id = any (p_lodges);

  -- Contagem pelo mesmo critério da lista de origem (report_details).
  r := jsonb_build_object(
    -- Ordem dos blocos definida pela gestão em 20/11 (JSON não guarda ordem de chaves).
    'order', jsonb_build_array('occupancy', 'maintenance', 'no_shows', 'warnings', 'dinner', 'laundry', 'hours',
                               'rounds_checks', 'temperature', 'movements', 'late_entries', 'coverage'),
    'occupancy', jsonb_build_object(
      'beds_total', v_beds,
      'occupied', (select count(*) from public.stays_present_at_any(p_lodges, v_until - interval '1 second')),
      'protected_by_absence', (select count(*) from public.stays_present_at_any(p_lodges, v_until - interval '1 second') s
                               where (public.active_absence(s.id, v_until - interval '1 second')).id is not null),
      'average_occupancy', coalesce((
        select round(avg((select count(*) from public.stays_present_at_any(p_lodges, public.slot_instant(d::date, '23:00')))), 1)
        from generate_series(v_d1, v_d2 - 1, interval '1 day') d
        where public.slot_instant(d::date, '23:00') <= now()), 0),
      'admissions', (select count(*) from public.report_details_period(p_lodges, p_from, p_to, 'occupancy.admissions')),
      'outs', (select count(*) from public.report_details_period(p_lodges, p_from, p_to, 'occupancy.outs')),
      'transfers_in', (select count(*) from public.report_details_period(p_lodges, p_from, p_to, 'occupancy.transfers_in')),
      'transfers_out', (select count(*) from public.report_details_period(p_lodges, p_from, p_to, 'occupancy.transfers_out'))
    ),
    'maintenance', jsonb_build_object(
      'opened', (select count(*) from public.report_details_period(p_lodges, p_from, p_to, 'maintenance.opened')),
      'resolved', (select count(*) from public.report_details_period(p_lodges, p_from, p_to, 'maintenance.resolved')),
      'overdue', (select count(*) from public.report_details_period(p_lodges, p_from, p_to, 'maintenance.overdue')),
      'on_hold', (select count(*) from public.report_details_period(p_lodges, p_from, p_to, 'maintenance.on_hold')),
      'in_progress', (select count(*) from public.report_details_period(p_lodges, p_from, p_to, 'maintenance.in_progress')),
      'reopened', (select count(*) from public.maintenance_events e join public.maintenance_tickets t on t.id = e.ticket_id
                   where t.lodge_id = any (p_lodges) and e.kind = 'status' and e.to_value = 'reopened' and e.at >= v_from and e.at < v_to),
      'average_hours_to_resolve', coalesce((select round(avg(extract(epoch from t.resolved_at - t.created_at) / 3600)::numeric, 1)
                   from public.maintenance_tickets t where t.lodge_id = any (p_lodges) and t.resolved_at >= v_from and t.resolved_at < v_to), 0),
      'by_priority', coalesce((select jsonb_object_agg(priority, c) from (
                   select t.priority, count(*) c from public.maintenance_tickets t
                   where t.lodge_id = any (p_lodges) and t.created_at >= v_from and t.created_at < v_to group by 1) x), '{}'::jsonb),
      'by_location', coalesce((select jsonb_agg(jsonb_build_object('location', location, 'count', c)) from (
                   select t.location, count(*) c from public.maintenance_tickets t
                   where t.lodge_id = any (p_lodges) and t.created_at >= v_from and t.created_at < v_to group by 1 order by 2 desc limit 5) x), '[]'::jsonb)
    ),
    'no_shows', jsonb_build_object(
      'total', (select count(*) from public.report_details_period(p_lodges, p_from, p_to, 'no_shows.total')),
      'residents_1', (select count(*) from (select resident_id from public.no_shows where lodge_id = any (p_lodges) and status = 'confirmed' and operational_day >= v_d1 and operational_day < v_d2 group by 1 having count(*) = 1) x),
      'residents_2', (select count(*) from (select resident_id from public.no_shows where lodge_id = any (p_lodges) and status = 'confirmed' and operational_day >= v_d1 and operational_day < v_d2 group by 1 having count(*) = 2) x),
      'residents_3_plus', (select count(*) from (select resident_id from public.no_shows where lodge_id = any (p_lodges) and status = 'confirmed' and operational_day >= v_d1 and operational_day < v_d2 group by 1 having count(*) >= 3) x),
      'beds_cancelled', (select count(*) from public.stays s where s.lodge_id = any (p_lodges) and s.end_reason = 'out' and s.ended_at >= v_from and s.ended_at < v_to
                         and exists (select 1 from public.no_shows n where n.stay_id = s.id and n.status = 'confirmed')),
      'undone', (select count(*) from public.report_details_period(p_lodges, p_from, p_to, 'no_shows.undone'))
    ),
    'warnings', jsonb_build_object(
      'verbal', (select count(*) from public.report_details_period(p_lodges, p_from, p_to, 'warnings.verbal')),
      'written', (select count(*) from public.report_details_period(p_lodges, p_from, p_to, 'warnings.written')),
      'final_written', (select count(*) from public.report_details_period(p_lodges, p_from, p_to, 'warnings.final_written'))
    ),
    'dinner', case when v_has_dinner then jsonb_build_object(
      'served', (select count(*) from public.report_details_period(p_lodges, p_from, p_to, 'dinner.served')),
      'services', (select count(*) from public.dinner_services where lodge_id = any (p_lodges) and operational_day >= v_d1 and operational_day < v_d2)
    ) end,
    'laundry', case when v_has_laundry then jsonb_build_object(
      'uses', (select count(*) from public.report_details_period(p_lodges, p_from, p_to, 'laundry.uses'))
    ) end,
    'hours', jsonb_build_object(
      -- Beta: horas do Roster (previsto = publicado; trabalhado = como aconteceu, até agora).
      'planned_minutes', coalesce((select sum(public.overlap_minutes(rs.planned_starts_at, rs.planned_ends_at, v_from, v_to)) from public.rota_shifts rs
                                   where rs.planned_starts_at is not null and (rs.lodge_id = any (p_lodges) or (rs.lodge_id is null and cardinality(p_lodges) > 1))), 0),
      'effective_minutes', coalesce((select sum(public.overlap_minutes(rs.starts_at, rs.ends_at, v_from, v_until)) from public.rota_shifts rs
                                     where rs.status = 'published' and v_until > v_from and (rs.lodge_id = any (p_lodges) or (rs.lodge_id is null and cardinality(p_lodges) > 1))), 0)
                           + coalesce((select sum(public.overlap_minutes(w.starts_at, w.ends_at, v_from, v_to)) from public.work_intervals w
                                       where w.lodge_id = any (p_lodges)), 0)
    ),
    'rounds_checks', jsonb_build_object(
      'checks_launched', (select count(*) from public.room_check_runs where lodge_id = any (p_lodges) and status = 'launched' and operational_day >= v_d1 and operational_day < v_d2),
      'checks_pending', (select coalesce(sum(cardinality(public.pending_slots(l.id, d::date, now()))), 0)
                         from generate_series(v_d1, v_d2 - 1, interval '1 day') d cross join unnest(p_lodges) l(id) where public.operational_day_start(d::date) <= now()),
      'rounds_recorded', (select count(*) from public.handover_entries where lodge_id = any (p_lodges) and kind = 'round' and operational_day >= v_d1 and operational_day < v_d2)
    ),
    'temperature', jsonb_build_object('alerts', (select count(*) from public.report_details_period(p_lodges, p_from, p_to, 'temperature.alerts'))),
    'movements', jsonb_build_object(
      'admissions', (select count(*) from public.report_details_period(p_lodges, p_from, p_to, 'occupancy.admissions')),
      'outs', (select count(*) from public.report_details_period(p_lodges, p_from, p_to, 'occupancy.outs')),
      'transfers', (select count(*) from public.report_details_period(p_lodges, p_from, p_to, 'occupancy.transfers_in'))
                   + (select count(*) from public.report_details_period(p_lodges, p_from, p_to, 'occupancy.transfers_out'))
    ),
    'late_entries', jsonb_build_object(
      'total', (select count(*) from public.report_details_period(p_lodges, p_from, p_to, 'late_entries.total')),
      'by_reason', coalesce((select jsonb_object_agg(late_reason, c) from (
                   select e.late_reason, count(*) c from public.handover_entries e
                   where e.lodge_id = any (p_lodges) and e.late_reason is not null and e.occurred_at >= v_from and e.occurred_at < v_to group by 1) x), '{}'::jsonb)
    ),
    'coverage', jsonb_build_object(
      'shifts_below_minimum', (select count(*) from public.coverage_gaps(v_from, v_until) g where g.lodge_id = any (p_lodges) or g.lodge_id is null)
    )
  );
  return r;
end
$function$;

CREATE OR REPLACE FUNCTION public.residents_without_evidence(p_lodge uuid, p_day date, p_at timestamp with time zone)
 RETURNS TABLE(stay_id uuid, resident_id uuid, first_name text, last_name text, room_kind room_kind, room_code text, bed_number integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
begin
    if not public.can_see_lodge(p_lodge) then raise exception 'not_authorised' using errcode = '42501'; end if;
  return query select st.id, st.resident_id, res.first_name, res.last_name, rm.kind, rm.code, b.number
  from public.stays st
  join public.residents res on res.id = st.resident_id
  join public.beds b on b.id = st.bed_id
  join public.rooms rm on rm.id = b.room_id
  where st.lodge_id = p_lodge
    and st.admitted_at < p_at and (st.ended_at is null or st.ended_at >= p_at)
    and not exists (select 1 from public.resident_evidence(st.resident_id, p_day))
    and not exists (
      select 1 from public.absences a
      where a.resident_id = st.resident_id
        and a.starts_at < least(p_at, public.operational_day_end(p_day))
        and public.absence_effective_end(a) > public.operational_day_start(p_day))
    and not exists (
      select 1 from public.no_shows n
      where n.resident_id = st.resident_id and n.operational_day = p_day and n.status = 'confirmed')
  order by rm.sort_order, rm.code, b.number;
end
$function$;

CREATE OR REPLACE FUNCTION public.room_check_done(p_lodge uuid, p_day date, p_slot text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
begin
    if not public.can_see_lodge(p_lodge) then raise exception 'not_authorised' using errcode = '42501'; end if;
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
$function$;

CREATE OR REPLACE FUNCTION public.save_rota_shift(p_id uuid, p_staff uuid, p_lodge uuid, p_function text, p_start timestamp with time zone, p_end timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role public.staff_role;
  v_id uuid;
begin
    if not public.can_see_lodge(p_lodge) then raise exception 'not_authorised' using errcode = '42501'; end if;
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  if p_end is null or p_start is null or p_end <= p_start then raise exception 'invalid_period' using errcode = '22023'; end if;
  select role into v_role from public.staff where id = p_staff and active;
  if v_role is null then raise exception 'staff_not_found' using errcode = 'P0002'; end if;
  if (p_function = 'cleaner') <> (v_role = 'cleaner') or (p_function = 'office' and v_role <> 'porter')
     or (p_function = 'float' and v_role not in ('porter', 'manager')) then
    raise exception 'role_not_allowed' using errcode = '22023';
  end if;
  if exists (select 1 from public.rota_shifts r where r.staff_id = p_staff and r.status <> 'cancelled'
             and r.id is distinct from p_id and tstzrange(r.starts_at, r.ends_at) && tstzrange(p_start, p_end)) then
    raise exception 'staff_overlap' using errcode = '23P01';
  end if;
  -- Só um Float ativo por vez.
  if p_function = 'float' and exists (select 1 from public.rota_shifts r where r.function = 'float' and r.status <> 'cancelled'
             and r.id is distinct from p_id and tstzrange(r.starts_at, r.ends_at) && tstzrange(p_start, p_end)) then
    raise exception 'float_overlap' using errcode = '23P01';
  end if;
  if p_id is null then
    insert into public.rota_shifts (staff_id, lodge_id, function, starts_at, ends_at, created_by)
    values (p_staff, case when p_function = 'float' then null else p_lodge end, p_function, p_start, p_end, public.current_staff_id())
    returning id into v_id;
  else
    update public.rota_shifts
       set staff_id = p_staff, lodge_id = case when p_function = 'float' then null else p_lodge end, function = p_function,
           starts_at = p_start, ends_at = p_end
     where id = p_id and status <> 'cancelled'
    returning id into v_id;
    if v_id is null then raise exception 'shift_not_found' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end
$function$;

CREATE OR REPLACE FUNCTION public.search_handover(p_lodge uuid, p_from date, p_to date, p_q text DEFAULT NULL::text, p_kinds text[] DEFAULT NULL::text[], p_tags uuid[] DEFAULT NULL::uuid[], p_staff uuid DEFAULT NULL::uuid, p_resident uuid DEFAULT NULL::uuid, p_function text DEFAULT NULL::text, p_include_voided boolean DEFAULT false, p_limit integer DEFAULT 100)
 RETURNS TABLE(id uuid, lodge_id uuid, kind text, body text, occurred_at timestamp with time zone, operational_day date, round_slot text, author_id uuid, filled_by uuid, late_reason text, status text, void_reason text, version integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_q text := nullif(trim(coalesce(p_q, '')), '');
begin
    if not public.can_see_lodge(p_lodge) then raise exception 'not_authorised' using errcode = '42501'; end if;
  if not public.is_active_staff() then raise exception 'not_authorised' using errcode = '42501'; end if;
  if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to) or p_to < p_from then raise exception 'invalid_range' using errcode = '22023'; end if;
  if p_to - p_from > 92 then raise exception 'range_too_large' using errcode = '22023'; end if;
  return query
  select e.id, e.lodge_id, e.kind, e.body, e.occurred_at, e.operational_day, e.round_slot, e.author_id, e.filled_by, e.late_reason, e.status, e.void_reason, e.version
  from public.handover_entries e
  where e.lodge_id = p_lodge
    and e.occurred_at >= public.operational_day_start(p_from)
    and e.occurred_at < public.operational_day_start(p_to + 1)
    and (p_include_voided or e.status = 'active')
    and (v_q is null or e.body ilike '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\')
    and (p_kinds is null or cardinality(p_kinds) = 0 or e.kind = any (p_kinds))
    and (p_tags is null or cardinality(p_tags) = 0 or exists (select 1 from public.handover_entry_tags t where t.entry_id = e.id and t.tag_id = any (p_tags)))
    and (p_staff is null or e.filled_by = p_staff or e.author_id = p_staff
         or exists (select 1 from public.handover_entry_staff c where c.entry_id = e.id and c.staff_id = p_staff))
    and (p_resident is null or exists (select 1 from public.handover_mentions m where m.entry_id = e.id and m.resident_id = p_resident))
    and (p_function is null or exists (select 1 from public.handover_shifts s where s.id = e.shift_id and s.function = p_function))
  order by e.occurred_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 100);
end
$function$;

CREATE OR REPLACE FUNCTION public.seen_for_day(p_lodge uuid, p_day date)
 RETURNS TABLE(resident_id uuid, stay_id uuid, first_name text, last_name text, room_kind room_kind, room_code text, bed_number integer, seen_day boolean, seen_night boolean, day_sources text[], night_sources text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
begin
    if not public.can_see_lodge(p_lodge) then raise exception 'not_authorised' using errcode = '42501'; end if;
  return query select st.resident_id, st.id, res.first_name, res.last_name, rm.kind, rm.code, b.number,
         exists (select 1 from public.resident_evidence(st.resident_id, p_day) e where e.shift = 'day'),
         exists (select 1 from public.resident_evidence(st.resident_id, p_day) e where e.shift = 'night'),
         array(select distinct e.source from public.resident_evidence(st.resident_id, p_day) e where e.shift = 'day' order by 1),
         array(select distinct e.source from public.resident_evidence(st.resident_id, p_day) e where e.shift = 'night' order by 1)
  from public.stays st
  join public.residents res on res.id = st.resident_id
  join public.beds b on b.id = st.bed_id
  join public.rooms rm on rm.id = b.room_id
  where public.is_active_staff()
    and st.lodge_id = p_lodge
    and st.admitted_at < public.operational_day_end(p_day)
    and (st.ended_at is null or st.ended_at > public.operational_day_start(p_day))
  order by rm.sort_order, rm.code, b.number;
end
$function$;

CREATE OR REPLACE FUNCTION public.shift_tasks(p_lodge uuid, p_day date, p_shift text)
 RETURNS TABLE(kind text, task_id uuid, title jsonb, suggested_time text, staff_id uuid, due_at timestamp with time zone, sort_order integer, signatures jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
begin
    if not public.can_see_lodge(p_lodge) then raise exception 'not_authorised' using errcode = '42501'; end if;
  return query select 'template', t.id, t.title, t.suggested_time, null::uuid, null::timestamptz, t.sort_order,
         coalesce((select jsonb_agg(jsonb_build_object('staff_id', s.staff_id, 'duty_function', s.duty_function, 'signed_at', s.signed_at) order by s.signed_at)
                   from public.task_signatures s
                   where s.template_id = t.id and s.lodge_id = p_lodge and s.operational_day = p_day and s.shift = p_shift), '[]'::jsonb)
  from public.task_templates t
  where public.is_active_staff() and t.lodge_id = p_lodge and t.shift = p_shift and t.active
    and (t.weekdays is null or public.iso_weekday(p_day) = any (t.weekdays))
    and t.created_at <= public.shift_end_of(p_day, p_shift)
  union all
  select 'extra', x.id, jsonb_build_object('pt-PT', x.title, 'en-IE', x.title, 'pl-PL', x.title), null, x.staff_id, x.due_at, 1000,
         coalesce((select jsonb_agg(jsonb_build_object('staff_id', s.staff_id, 'duty_function', s.duty_function, 'signed_at', s.signed_at) order by s.signed_at)
                   from public.task_signatures s where s.extra_id = x.id), '[]'::jsonb)
  from public.task_extras x
  where public.is_active_staff() and x.lodge_id = p_lodge and x.operational_day = p_day and x.shift = p_shift
  order by 7, 4 nulls last;
end
$function$;

CREATE OR REPLACE FUNCTION public.sign_task(p_kind text, p_task uuid, p_lodge uuid, p_day date, p_shift text, p_signed_by uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_me uuid := public.current_staff_id();
  v_post public.duty_posts := public.my_open_post();
  v_signer uuid;
begin
    if not public.can_see_lodge(p_lodge) then raise exception 'not_authorised' using errcode = '42501'; end if;
  if v_me is null or not public.can_write_lodge(p_lodge) then raise exception 'not_authorised' using errcode = '42501'; end if;
  if public.shift_start_of(p_day, p_shift) > now() + interval '5 minutes' then
    raise exception 'shift_not_started' using errcode = '22023';
  end if;
  if not exists (select 1 from public.shift_tasks(p_lodge, p_day, p_shift) t where t.kind = p_kind and t.task_id = p_task) then
    raise exception 'task_not_in_shift' using errcode = '22023';
  end if;
  v_signer := coalesce(p_signed_by,
    case when public.current_staff_role() = 'station'
         then (select s.staff_id from public.handover_shifts s where s.lodge_id = p_lodge and s.closed_at is null limit 1)
         else v_me end);
  if v_signer is null or not exists (
       select 1 from public.staff where id = v_signer and active and role in ('porter', 'manager', 'owner', 'developer')) then
    raise exception 'invalid_filled_by' using errcode = '22023';
  end if;
  insert into public.task_signatures (lodge_id, operational_day, shift, template_id, extra_id, staff_id, duty_function)
  values (p_lodge, p_day, p_shift,
          case when p_kind = 'template' then p_task end, case when p_kind = 'extra' then p_task end,
          v_signer, coalesce(v_post.function::text, case when public.current_staff_role() = 'station' then 'office' else public.current_staff_role()::text end))
  on conflict do nothing;
end
$function$;

CREATE OR REPLACE FUNCTION public.stays_present_at(p_lodge uuid, p_at timestamp with time zone)
 RETURNS SETOF stays
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
begin
    if not public.can_see_lodge(p_lodge) then raise exception 'not_authorised' using errcode = '42501'; end if;
  return query select * from public.stays
  where lodge_id = p_lodge and admitted_at <= p_at and (ended_at is null or ended_at > p_at);
end
$function$;

CREATE OR REPLACE FUNCTION public.stays_present_at_any(p_lodges uuid[], p_at timestamp with time zone)
 RETURNS SETOF stays
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
begin
    if exists (select 1 from unnest(coalesce(p_lodges, '{}')) l(id) where not public.can_see_lodge(l.id)) then raise exception 'not_authorised' using errcode = '42501'; end if;
  return query select * from public.stays
  where lodge_id = any (p_lodges) and admitted_at <= p_at and (ended_at is null or ended_at > p_at);
end
$function$;

CREATE OR REPLACE FUNCTION public.home_dashboard()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_today date := public.operational_day(now());
begin
  if not public.is_active_staff() then raise exception 'not_authorised' using errcode = '42501'; end if;
  return jsonb_build_object(
    'lodges', (select jsonb_agg(jsonb_build_object(
        'lodge_id', l.id,
        'beds_total', (select count(*) from public.beds b join public.rooms r on r.id = b.room_id where r.lodge_id = l.id and b.active and r.active),
        'out_of_use', (select count(*) from public.beds b join public.rooms r on r.id = b.room_id where r.lodge_id = l.id and b.active and r.active and b.status <> 'in_use'),
        'occupied', (select count(*) from public.stays_present_at(l.id, now())),
        'out_pending', (select count(*) from public.stays s where s.lodge_id = l.id and s.status = 'out_pending'),
        'seen_today', (select count(*) from public.stays_present_at(l.id, now()) s
                       where exists (select 1 from public.resident_evidence(s.resident_id, v_today))),
        'checks_done', (select count(*) from public.room_check_runs where lodge_id = l.id and operational_day = v_today and status = 'launched'),
        'checks_total', cardinality(public.check_slots(l.id, v_today)),
        'rounds_done', (select count(*) from public.handover_entries where lodge_id = l.id and kind = 'round' and operational_day = v_today),
        'absences_now', (select count(*) from public.absences a join public.stays s on s.id = a.stay_id where s.lodge_id = l.id and a.ended_at is null and a.starts_at <= now())
      ) order by l.code) from public.lodges l where l.active and public.can_see_lodge(l.id)),
    'series', (select jsonb_agg(jsonb_build_object(
        'day', d::date,
        'admissions', (select count(*) from public.stays s where public.can_see_lodge(s.lodge_id) and s.transfer_from_stay_id is null and s.admitted_at >= public.operational_day_start(d::date) and s.admitted_at < public.operational_day_end(d::date)),
        'outs', (select count(*) from public.stays s where public.can_see_lodge(s.lodge_id) and s.end_reason = 'out' and s.ended_at >= public.operational_day_start(d::date) and s.ended_at < public.operational_day_end(d::date)),
        'no_shows', (select count(*) from public.no_shows n where public.can_see_lodge(n.lodge_id) and n.status = 'confirmed' and n.operational_day = d::date),
        'maintenance', (select count(*) from public.maintenance_tickets t where public.can_see_lodge(t.lodge_id) and t.created_at >= public.operational_day_start(d::date) and t.created_at < public.operational_day_end(d::date)),
        'occupied', (select count(*) from public.stays s where public.can_see_lodge(s.lodge_id) and s.admitted_at <= least(public.slot_instant(d::date, '23:00'), now()) and (s.ended_at is null or s.ended_at > least(public.slot_instant(d::date, '23:00'), now())))
      ) order by d) from generate_series(v_today - 13, v_today, interval '1 day') d),
    'maintenance_open', (select jsonb_build_object(
        'urgent', count(*) filter (where priority = 'urgent'), 'normal', count(*) filter (where priority = 'normal'), 'low', count(*) filter (where priority = 'low'),
        'overdue', count(*) filter (where deadline_at < now()))
      from public.maintenance_tickets where status <> 'resolved' and public.can_see_lodge(lodge_id))
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.my_notifications(p_limit integer)
 RETURNS TABLE(id bigint, kind text, lodge_id uuid, resident_id uuid, payload jsonb, created_at timestamp with time zone, read boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select n.id, n.kind, n.lodge_id, n.resident_id, n.payload, n.created_at,
         exists (select 1 from public.notification_reads r where r.notification_id = n.id and r.staff_id = public.current_staff_id())
  from public.notifications n
  where public.is_active_staff() and (n.audience = 'lodge' or public.is_management())
    and (n.lodge_id is null or public.can_see_lodge(n.lodge_id))
  order by n.created_at desc, n.id desc
  limit greatest(1, least(coalesce(p_limit, 50), 200))
$function$;

CREATE OR REPLACE FUNCTION public.unread_notifications_count()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select count(*)::int from public.notifications n
  where public.is_active_staff() and (n.audience = 'lodge' or public.is_management())
    and (n.lodge_id is null or public.can_see_lodge(n.lodge_id))
    and n.created_at > now() - interval '30 days'
    and not exists (select 1 from public.notification_reads r where r.notification_id = n.id and r.staff_id = public.current_staff_id())
$function$;

notify pgrst, 'reload schema';
