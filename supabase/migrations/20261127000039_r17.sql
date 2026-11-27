-- Revisão 17 — isolamento entre casas (perfil/evidência), conta da recepção (station) e parâmetros que eram ignorados.

-- ---------- 1. Quem pode ver um residente ----------
-- Mesma regra da política house_scope de residents: sem estadia ainda, ou com estadia numa casa visível.
create or replace function public.can_see_resident(p_resident uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is null
      or (public.is_active_staff() and (
            not exists (select 1 from public.stays s where s.resident_id = p_resident)
            or exists (select 1 from public.stays s where s.resident_id = p_resident and public.can_see_lodge(s.lodge_id))))
$$;
grant execute on function public.can_see_resident(uuid) to authenticated;

-- Perfil do residente: recusa residente de outra casa para a conta de casa.
do $$
declare d text; r oid;
begin
  select p.oid into r from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'open_resident_profile';
  d := pg_get_functiondef(r);
  if position('can_see_resident' in d) = 0 then
    d := replace(d, E'  v_profile jsonb;\nbegin\n', E'  v_profile jsonb;\nbegin\n  if not public.can_see_resident(p_resident) then\n    raise exception ''not_authorised'' using errcode = ''42501'';\n  end if;\n');
    if position('can_see_resident' in d) = 0 then raise exception 'r17: patch de open_resident_profile não aplicado'; end if;
    execute d;
  end if;
end $$;

-- Evidência de presença: vazia para residente de outra casa.
create or replace function public.resident_evidence(p_resident uuid, p_day date)
returns table (source text, shift text, lodge_id uuid, occurred_at timestamptz)
language sql stable security definer set search_path = public as $$
  select 'check', public.slot_shift(r.slot), r.lodge_id, r.checked_at
  from public.room_check_marks m join public.room_check_runs r on r.id = m.run_id
  where public.can_see_resident(p_resident) and m.resident_id = p_resident and m.result = 'seen' and r.operational_day = p_day
  union all
  select 'manual', public.shift_of(s.seen_at), s.lodge_id, s.seen_at
  from public.sightings s
  where public.can_see_resident(p_resident) and s.resident_id = p_resident and public.operational_day(s.seen_at) = p_day
  union all
  select 'check-in', public.shift_of(st.admitted_at), st.lodge_id, st.admitted_at
  from public.stays st
  where public.can_see_resident(p_resident) and st.resident_id = p_resident and public.operational_day(st.admitted_at) = p_day
  union all
  select 'dinner', 'night', ds.lodge_id, dm.marked_at
  from public.dinner_marks dm join public.dinner_services ds on ds.id = dm.service_id
  where public.can_see_resident(p_resident) and dm.resident_id = p_resident and dm.served and ds.operational_day = p_day
$$;

-- ---------- 2. Conta da recepção (station) ----------
-- Manutenção: sem posto aberto a conta de casa passava a guarda (NULL). Agora só encerra chamado da própria casa.
do $$
declare d text; r oid;
begin
  select p.oid into r from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'maintenance_set_status';
  d := pg_get_functiondef(r);
  d := replace(d, 'if not (v_post.function = ''office'' and v_post.lodge_id = v_t.lodge_id) then',
    'if not (coalesce(v_post.function = ''office'' and v_post.lodge_id = v_t.lodge_id, false) or (public.current_staff_role() = ''station'' and v_t.lodge_id is not distinct from public.house_scope())) then');
  if position('house_scope' in d) = 0 then raise exception 'r17: patch de maintenance_set_status não aplicado'; end if;
  execute d;
end $$;

-- Cadastro de residente: a conta de casa edita residente da própria casa (sem precisar de posto).
drop policy if exists residents_update on public.residents;
create policy residents_update on public.residents for update to authenticated
  using (public.is_management() or public.has_open_post()
         or (public.current_staff_role() = 'station' and exists (select 1 from public.stays s where s.resident_id = residents.id and s.lodge_id = public.house_scope())))
  with check (public.is_management() or public.has_open_post()
         or (public.current_staff_role() = 'station' and exists (select 1 from public.stays s where s.resident_id = residents.id and s.lodge_id = public.house_scope())));

-- ---------- 3. Parâmetros que eram ignorados ----------
-- Turnos: shift.day_start / shift.night_start (padrão 07:00 e 19:00).
create or replace function public.shift_start_param(p_key text, p_default text)
returns time language sql stable security definer set search_path = public as $$
  select coalesce(nullif(public.param_value(p_key) #>> '{}', '')::time, p_default::time)
$$;

create or replace function public.shift_of(ts timestamptz)
returns text language sql stable parallel safe set search_path = public as $$
  select case when (ts at time zone 'Europe/Dublin')::time >= public.shift_start_param('shift.day_start', '07:00')
               and (ts at time zone 'Europe/Dublin')::time <  public.shift_start_param('shift.night_start', '19:00') then 'day' else 'night' end
$$;

create or replace function public.slot_shift(p_slot text)
returns text language sql stable parallel safe set search_path = public as $$
  select case when p_slot::time >= public.shift_start_param('shift.day_start', '07:00')
               and p_slot::time <  public.shift_start_param('shift.night_start', '19:00') then 'day' else 'night' end
$$;

-- Lembrete de manutenção: cadência vem de maintenance.reminder_hours (padrão 24).
create or replace function public.maintenance_reminders()
returns table (id uuid, lodge_id uuid, location text, description text, priority text, status text, deadline_at timestamptz)
language sql stable security definer set search_path = public as $$
  with p as (select make_interval(hours => coalesce((public.param_value('maintenance.reminder_hours') #>> '{}')::integer, 24)) as h)
  select t.id, t.lodge_id, t.location, t.description, t.priority, t.status, t.deadline_at
  from public.maintenance_tickets t, p
  where public.is_management()
    and t.status <> 'resolved' and t.deadline_at < now()
    and coalesce((select max(e.at) from public.maintenance_events e where e.ticket_id = t.id), t.created_at)
        < greatest(t.deadline_at, now() - p.h)
    and not exists (
      select 1 from public.maintenance_reminder_snoozes z
      where z.ticket_id = t.id and z.staff_id = public.current_staff_id() and z.snoozed_at > now() - p.h)
  order by t.deadline_at
$$;

-- Alerta de validade das entregas: padrão passa a 2 dias (ajustável em Settings).
insert into public.parameters (key, value) values ('delivery.expiry_alert_days', '2');
do $$
declare d text; r oid;
begin
  select p.oid into r from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'record_food_delivery';
  d := pg_get_functiondef(r);
  d := replace(d, '#>> ''{}'')::integer, 3)', '#>> ''{}'')::integer, 2)');
  execute d;
end $$;

grant execute on function public.shift_start_param(text, text) to authenticated;
