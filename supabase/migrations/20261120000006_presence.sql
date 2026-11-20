-- DS Lodge — Fase 1: Presença (spec v1.1, s.5)
-- Room Check (12h, 18h, 22h), Seen Day/Night, ausência comunicada, No Show e contador mensal.
--
-- Princípios (s.9): os fatos são guardados uma vez (marcas do check, avistamentos manuais,
-- entradas no Lodge) e o Seen e o No Show são calculados a partir deles. Corrigir um fato
-- recalcula o resultado. Nada é apagado sem rastro (auditoria).

create type public.check_result as enum ('seen', 'not_seen', 'absent');
create type public.check_status as enum ('pending', 'launched');
create type public.no_show_status as enum ('confirmed', 'undone');

-- ---------------------------------------------------------------------------
-- Turnos e horários dos checks
-- ---------------------------------------------------------------------------
-- Turno Day 07h–19h; Night 19h–07h (glossário).
create or replace function public.shift_of(ts timestamptz)
returns text
language sql immutable parallel safe
as $$
  select case when extract(hour from ts at time zone 'Europe/Dublin') >= 7
               and extract(hour from ts at time zone 'Europe/Dublin') < 19 then 'day' else 'night' end
$$;

-- Check das 12h/18h → Seen Day; das 22h → Seen Night (s.5).
create or replace function public.slot_shift(p_slot text)
returns text
language sql immutable parallel safe
as $$
  select case when p_slot >= '07:00' and p_slot < '19:00' then 'day' else 'night' end
$$;

-- Instante do horário do check no dia operacional (horários antes das 07h caem no dia seguinte).
create or replace function public.slot_instant(p_day date, p_slot text)
returns timestamptz
language sql immutable parallel safe
as $$
  select ((case when p_slot < '07:00' then p_day + 1 else p_day end) + p_slot::time) at time zone 'Europe/Dublin'
$$;

-- Horários dos checks válidos naquele dia (parâmetro vigente no início do dia — B22).
create or replace function public.check_slots(p_lodge uuid, p_day date)
returns text[]
language sql stable
security definer
set search_path = public
as $$
  select coalesce(array(
    select s from jsonb_array_elements_text(public.param_value('presence.check_times', p_lodge, public.operational_day_start(p_day))) s
    order by (s < '07:00'), s
  ), '{}')
$$;

-- Estadias presentes num Lodge num instante.
create or replace function public.stays_present_at(p_lodge uuid, p_at timestamptz)
returns setof public.stays
language sql stable
security definer
set search_path = public
as $$
  select * from public.stays
  where lodge_id = p_lodge and admitted_at <= p_at and (ended_at is null or ended_at > p_at)
$$;

create or replace function public.correction_window()
returns interval
language sql stable
security definer
set search_path = public
as $$
  select make_interval(hours => coalesce((public.param_value('records.correction_window_hours') #>> '{}')::int, 72))
$$;

-- ---------------------------------------------------------------------------
-- Room Check
-- ---------------------------------------------------------------------------
create table public.room_check_runs (
  id uuid primary key default gen_random_uuid(),
  lodge_id uuid not null references public.lodges(id),
  operational_day date not null,
  slot text not null check (slot ~ '^([01]\d|2[0-3]):[0-5]\d$'),
  checked_at timestamptz not null,               -- horário real do check (visível a todos)
  performed_by uuid not null references public.staff(id), -- quem fez a ronda
  performed_reported_by_entrant boolean generated always as (performed_by is distinct from entered_by) stored,
  entered_by uuid not null references public.staff(id),   -- quem digitou (automático; nunca muda)
  entered_at timestamptz not null default now(),         -- horário da digitação (só gestão)
  status public.check_status not null default 'pending',
  launched_at timestamptz,
  launched_by uuid references public.staff(id),
  sheet_number text not null,
  version integer not null default 1,
  unique (lodge_id, operational_day, slot)
);

create table public.room_check_marks (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.room_check_runs(id),
  stay_id uuid not null references public.stays(id),
  resident_id uuid not null references public.residents(id),
  result public.check_result not null,
  marked_by uuid not null references public.staff(id),
  marked_at timestamptz not null default now(),          -- horário da digitação (só gestão)
  version integer not null default 1,
  unique (run_id, stay_id)
);

create index room_check_marks_resident_idx on public.room_check_marks(resident_id);
create index room_check_runs_day_idx on public.room_check_runs(operational_day, lodge_id);

-- Seen manual ("vi este residente"), com hora, local e autor.
create table public.sightings (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.residents(id),
  lodge_id uuid not null references public.lodges(id),
  seen_at timestamptz not null,
  place text,
  recorded_by uuid not null references public.staff(id),
  recorded_at timestamptz not null default now()
);

create index sightings_resident_idx on public.sightings(resident_id, seen_at);

-- Ausência comunicada: protege a cama e impede No Show no período.
create table public.absences (
  id uuid primary key default gen_random_uuid(),
  stay_id uuid not null references public.stays(id),
  resident_id uuid not null references public.residents(id),
  starts_at timestamptz not null,
  expected_return_at timestamptz not null,
  ended_at timestamptz,
  ended_by uuid references public.staff(id),
  notes text,
  created_by uuid not null references public.staff(id),
  created_at timestamptz not null default now(),
  version integer not null default 1,
  check (expected_return_at > starts_at),
  check (ended_at is null or ended_at >= starts_at)
);

create index absences_stay_idx on public.absences(stay_id);

-- Fim efetivo da proteção: o retorno real, ou o retorno previsto (não prorroga sozinho).
create or replace function public.absence_effective_end(a public.absences)
returns timestamptz
language sql immutable
as $$
  select least(coalesce(a.ended_at, 'infinity'::timestamptz), a.expected_return_at)
$$;

create or replace function public.active_absence(p_stay uuid, p_at timestamptz)
returns public.absences
language sql stable
security definer
set search_path = public
as $$
  select a.* from public.absences a
  where a.stay_id = p_stay and a.starts_at <= p_at and p_at < public.absence_effective_end(a)
  order by a.starts_at desc
  limit 1
$$;

create table public.no_shows (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.residents(id),
  stay_id uuid not null references public.stays(id),
  lodge_id uuid not null references public.lodges(id),
  operational_day date not null,
  status public.no_show_status not null default 'confirmed',
  confirmed_by uuid not null references public.staff(id),
  confirmed_at timestamptz not null default now(),
  undone_by uuid references public.staff(id),
  undone_at timestamptz,
  undo_reason text,
  version integer not null default 1
);

create unique index no_shows_one_per_day on public.no_shows(resident_id, operational_day) where status = 'confirmed';

-- Avisos para a gestão (ex.: 3º No Show do mês).
create table public.notifications (
  id bigint generated always as identity primary key,
  kind text not null,
  audience text not null default 'management' check (audience in ('management', 'lodge')),
  lodge_id uuid references public.lodges(id),
  resident_id uuid references public.residents(id),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.notification_reads (
  notification_id bigint not null references public.notifications(id),
  staff_id uuid not null references public.staff(id),
  read_at timestamptz not null default now(),
  primary key (notification_id, staff_id)
);

create trigger runs_bump_version before update on public.room_check_runs for each row execute function public.bump_version();
create trigger marks_bump_version before update on public.room_check_marks for each row execute function public.bump_version();
create trigger absences_bump_version before update on public.absences for each row execute function public.bump_version();
create trigger no_shows_bump_version before update on public.no_shows for each row execute function public.bump_version();

create trigger audit_room_check_runs after insert or update or delete on public.room_check_runs for each row execute function public.audit_row();
create trigger audit_room_check_marks after insert or update or delete on public.room_check_marks for each row execute function public.audit_row();
create trigger audit_sightings after insert or update or delete on public.sightings for each row execute function public.audit_row();
create trigger audit_absences after insert or update or delete on public.absences for each row execute function public.audit_row();
create trigger audit_no_shows after insert or update or delete on public.no_shows for each row execute function public.audit_row();

-- ---------------------------------------------------------------------------
-- Operações do Room Check
-- ---------------------------------------------------------------------------
create or replace function public.open_room_check(p_lodge uuid, p_day date, p_slot text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_staff_id();
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
  v_at := public.slot_instant(p_day, p_slot);
  if v_at > now() + interval '60 minutes' then
    raise exception 'check_in_future' using errcode = '22023';
  end if;

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

-- Hora real do check e quem fez a ronda (escolhido na equipe; "informado por quem digitou").
create or replace function public.set_room_check_details(p_run uuid, p_checked_at timestamptz, p_performed_by uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.room_check_runs;
  v_me uuid := public.current_staff_id();
begin
  select * into v_run from public.room_check_runs where id = p_run for update;
  if not found then raise exception 'run_not_found' using errcode = 'P0002'; end if;
  if v_me is null or not public.can_write_lodge(v_run.lodge_id) then
    raise exception 'not_authorised' using errcode = '42501';
  end if;
  if not public.is_management() then
    if v_run.entered_by <> v_me then raise exception 'not_author' using errcode = '42501'; end if;
    if v_run.entered_at < now() - public.correction_window() then
      raise exception 'correction_window_closed' using errcode = '42501';
    end if;
  end if;
  if p_checked_at is not null and (
       p_checked_at < public.operational_day_start(v_run.operational_day)
    or p_checked_at >= public.operational_day_end(v_run.operational_day)
    or p_checked_at > now() + interval '5 minutes') then
    raise exception 'invalid_check_time' using errcode = '22023';
  end if;
  if p_performed_by is not null and not exists (
    select 1 from public.staff where id = p_performed_by and active and role in ('porter', 'manager', 'owner', 'developer')) then
    raise exception 'invalid_performer' using errcode = '22023';
  end if;
  update public.room_check_runs
     set checked_at = coalesce(p_checked_at, checked_at),
         performed_by = coalesce(p_performed_by, performed_by)
   where id = p_run;
end
$$;

-- A Folha do dia: todas as camas do Lodge, com o residente presente no horário do check.
create or replace function public.room_check_sheet(p_run uuid)
returns table (
  room_id uuid, room_kind public.room_kind, room_code text, room_sort integer,
  bed_id uuid, bed_number integer, bed_status public.bed_status,
  stay_id uuid, resident_id uuid, first_name text, last_name text, date_of_birth date,
  absence_id uuid, result public.check_result, marked_by uuid
)
language plpgsql stable
security definer
set search_path = public
as $$
declare
  v_run public.room_check_runs;
begin
  if not public.is_active_staff() then raise exception 'not_authorised' using errcode = '42501'; end if;
  select * into v_run from public.room_check_runs where id = p_run;
  if not found then raise exception 'run_not_found' using errcode = 'P0002'; end if;

  return query
  select r.id, r.kind, r.code, r.sort_order,
         b.id, b.number, b.status,
         s.id, res.id, res.first_name, res.last_name, res.date_of_birth,
         (public.active_absence(s.id, v_run.checked_at)).id,
         m.result, m.marked_by
  from public.beds b
  join public.rooms r on r.id = b.room_id
  left join public.stays_present_at(v_run.lodge_id, v_run.checked_at) s on s.bed_id = b.id
  left join public.residents res on res.id = s.resident_id
  left join public.room_check_marks m on m.run_id = v_run.id and m.stay_id = s.id
  where r.lodge_id = v_run.lodge_id and b.active and r.active
  order by r.sort_order, r.code, b.number;
end
$$;

create or replace function public.mark_resident(p_run uuid, p_stay uuid, p_result public.check_result)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.room_check_runs;
  v_me uuid := public.current_staff_id();
  v_stay public.stays;
  v_absence public.absences;
  v_mark public.room_check_marks;
begin
  select * into v_run from public.room_check_runs where id = p_run;
  if not found then raise exception 'run_not_found' using errcode = 'P0002'; end if;
  if v_me is null or not public.can_write_lodge(v_run.lodge_id) then
    raise exception 'not_authorised' using errcode = '42501';
  end if;
  select * into v_stay from public.stays_present_at(v_run.lodge_id, v_run.checked_at) s where s.id = p_stay;
  if not found then raise exception 'stay_not_in_check' using errcode = '22023'; end if;

  v_absence := public.active_absence(p_stay, v_run.checked_at);
  if p_result = 'absent' and v_absence.id is null then
    raise exception 'no_active_absence' using errcode = '22023';
  end if;

  select * into v_mark from public.room_check_marks where run_id = p_run and stay_id = p_stay for update;
  if found then
    if not public.is_management() then
      if v_mark.marked_by <> v_me then raise exception 'not_author' using errcode = '42501'; end if;
      if v_mark.marked_at < now() - public.correction_window() then
        raise exception 'correction_window_closed' using errcode = '42501';
      end if;
    end if;
    if v_mark.result is distinct from p_result then
      update public.room_check_marks set result = p_result where id = v_mark.id;
    end if;
  else
    insert into public.room_check_marks (run_id, stay_id, resident_id, result, marked_by)
    values (p_run, p_stay, v_stay.resident_id, p_result, v_me)
    returning * into v_mark;
  end if;

  return jsonb_build_object(
    'mark_id', v_mark.id,
    'absence_active', p_result = 'seen' and v_absence.id is not null,
    'absence_id', v_absence.id
  );
end
$$;

-- Tirar a marca (só enquanto o check está por lançar) desfaz o Seen (B57).
create or replace function public.clear_mark(p_run uuid, p_stay uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.room_check_runs;
  v_mark public.room_check_marks;
begin
  select * into v_run from public.room_check_runs where id = p_run;
  if not found then raise exception 'run_not_found' using errcode = 'P0002'; end if;
  if not public.can_write_lodge(v_run.lodge_id) then raise exception 'not_authorised' using errcode = '42501'; end if;
  if v_run.status = 'launched' then raise exception 'run_launched' using errcode = '22023'; end if;
  select * into v_mark from public.room_check_marks where run_id = p_run and stay_id = p_stay;
  if not found then return; end if;
  if not public.is_management() and v_mark.marked_by <> public.current_staff_id() then
    raise exception 'not_author' using errcode = '42501';
  end if;
  delete from public.room_check_marks where id = v_mark.id;
end
$$;

-- Lançar: só com todos os residentes marcados; lançar de novo avisa e não duplica (B25, B28).
create or replace function public.launch_room_check(p_run uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.room_check_runs;
  v_missing integer;
begin
  select * into v_run from public.room_check_runs where id = p_run for update;
  if not found then raise exception 'run_not_found' using errcode = 'P0002'; end if;
  if not public.can_write_lodge(v_run.lodge_id) then raise exception 'not_authorised' using errcode = '42501'; end if;
  if v_run.status = 'launched' then
    return jsonb_build_object('status', 'already_launched', 'launched_at_day', v_run.operational_day);
  end if;
  select count(*) into v_missing
  from public.stays_present_at(v_run.lodge_id, v_run.checked_at) s
  where not exists (select 1 from public.room_check_marks m where m.run_id = p_run and m.stay_id = s.id);
  if v_missing > 0 then
    raise exception 'unmarked_residents' using errcode = '22023', detail = v_missing::text;
  end if;
  update public.room_check_runs
     set status = 'launched', launched_at = now(), launched_by = public.current_staff_id()
   where id = p_run;
  return jsonb_build_object('status', 'launched');
end
$$;

-- Horários de digitação: só Manager, Owner e Developer (s.4).
create or replace function public.room_check_typing_times(p_run uuid)
returns table (kind text, ref uuid, staff_id uuid, at timestamptz)
language plpgsql stable
security definer
set search_path = public
as $$
begin
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  return query
    select 'entered'::text, r.id, r.entered_by, r.entered_at from public.room_check_runs r where r.id = p_run
    union all
    select 'launched', r.id, r.launched_by, r.launched_at from public.room_check_runs r where r.id = p_run and r.launched_at is not null
    union all
    select 'mark', m.stay_id, m.marked_by, m.marked_at from public.room_check_marks m where m.run_id = p_run;
end
$$;

-- ---------------------------------------------------------------------------
-- Ausências
-- ---------------------------------------------------------------------------
create or replace function public.register_absence(p_stay uuid, p_starts_at timestamptz, p_expected_return_at timestamptz, p_notes text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stay public.stays;
  v_id uuid;
begin
  select * into v_stay from public.stays where id = p_stay;
  if not found or v_stay.status = 'ended' then raise exception 'stay_not_open' using errcode = '22023'; end if;
  if not public.can_write_lodge(v_stay.lodge_id) then raise exception 'not_authorised' using errcode = '42501'; end if;
  if p_starts_at is null or p_expected_return_at is null or p_expected_return_at <= p_starts_at then
    raise exception 'invalid_absence_period' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.absences a
    where a.stay_id = p_stay and a.ended_at is null
      and tstzrange(a.starts_at, a.expected_return_at) && tstzrange(p_starts_at, p_expected_return_at)
  ) then
    raise exception 'absence_overlaps' using errcode = '23P01';
  end if;
  insert into public.absences (stay_id, resident_id, starts_at, expected_return_at, notes, created_by)
  values (p_stay, v_stay.resident_id, p_starts_at, p_expected_return_at, nullif(trim(p_notes), ''), public.current_staff_id())
  returning id into v_id;
  return v_id;
end
$$;

-- Retorno (inclusive antecipado, B05), com autor.
create or replace function public.end_absence(p_absence uuid, p_returned_at timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_abs public.absences;
  v_lodge uuid;
  v_at timestamptz := coalesce(p_returned_at, now());
begin
  select * into v_abs from public.absences where id = p_absence for update;
  if not found then raise exception 'absence_not_found' using errcode = 'P0002'; end if;
  select lodge_id into v_lodge from public.stays where id = v_abs.stay_id;
  if not public.can_write_lodge(v_lodge) then raise exception 'not_authorised' using errcode = '42501'; end if;
  if v_abs.ended_at is not null then raise exception 'absence_already_ended' using errcode = '22023'; end if;
  if v_at < v_abs.starts_at or v_at > now() + interval '5 minutes' then
    raise exception 'invalid_return_time' using errcode = '22023';
  end if;
  update public.absences set ended_at = v_at, ended_by = public.current_staff_id() where id = p_absence;
end
$$;

-- Retorno previsto vencido: pendência (não prorroga sozinho).
create or replace function public.overdue_absences(p_lodge uuid)
returns table (absence_id uuid, stay_id uuid, resident_id uuid, first_name text, last_name text, starts_at timestamptz, expected_return_at timestamptz)
language sql stable
security definer
set search_path = public
as $$
  select a.id, a.stay_id, a.resident_id, r.first_name, r.last_name, a.starts_at, a.expected_return_at
  from public.absences a
  join public.stays s on s.id = a.stay_id
  join public.residents r on r.id = a.resident_id
  where public.is_active_staff() and s.lodge_id = p_lodge and s.status <> 'ended'
    and a.ended_at is null and a.expected_return_at < now()
  order by a.expected_return_at
$$;

-- ---------------------------------------------------------------------------
-- Seen
-- ---------------------------------------------------------------------------
create or replace function public.record_sighting(p_resident uuid, p_lodge uuid, p_seen_at timestamptz, p_place text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_at timestamptz := coalesce(p_seen_at, now());
  v_stay public.stays;
  v_absence public.absences;
  v_id uuid;
begin
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
$$;

-- Evidências de presença de um residente num dia operacional (qualquer Lodge).
-- Fontes: check positivo, Seen manual, entrada no Lodge (check-in). Dinner entra na Fase 2.
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
$$;

create or replace function public.seen_for_day(p_lodge uuid, p_day date)
returns table (
  resident_id uuid, stay_id uuid, first_name text, last_name text,
  room_kind public.room_kind, room_code text, bed_number integer,
  seen_day boolean, seen_night boolean, day_sources text[], night_sources text[]
)
language sql stable
security definer
set search_path = public
as $$
  select st.resident_id, st.id, res.first_name, res.last_name, rm.kind, rm.code, b.number,
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
  order by rm.sort_order, rm.code, b.number
$$;

-- ---------------------------------------------------------------------------
-- No Show
-- ---------------------------------------------------------------------------
-- Checks do dia ainda por lançar (todos, ou só os que já venceram até p_until).
create or replace function public.pending_slots(p_lodge uuid, p_day date, p_until timestamptz default 'infinity')
returns text[]
language sql stable
security definer
set search_path = public
as $$
  select coalesce(array(
    select s from unnest(public.check_slots(p_lodge, p_day)) s
    where public.slot_instant(p_day, s) <= p_until
      and not exists (
        select 1 from public.room_check_runs r
        where r.lodge_id = p_lodge and r.operational_day = p_day and r.slot = s and r.status = 'launched')
    order by (s < '07:00'), s
  ), '{}')
$$;

-- Início da "cadeia" de estadias (transferências não zeram; readmissão zera — B36).
create or replace function public.stay_chain_start(p_stay uuid)
returns timestamptz
language sql stable
security definer
set search_path = public
as $$
  with recursive chain as (
    select id, transfer_from_stay_id, admitted_at from public.stays where id = p_stay
    union all
    select s.id, s.transfer_from_stay_id, s.admitted_at
    from public.stays s join chain c on s.id = c.transfer_from_stay_id
  )
  select min(admitted_at) from chain
$$;

-- No Shows confirmados no mês do calendário de p_day, desde a admissão atual.
create or replace function public.no_show_month_count(p_resident uuid, p_stay uuid, p_day date)
returns integer
language sql stable
security definer
set search_path = public
as $$
  select count(*)::int from public.no_shows n
  where n.resident_id = p_resident and n.status = 'confirmed'
    and date_trunc('month', n.operational_day) = date_trunc('month', p_day)
    and n.operational_day >= public.operational_day(public.stay_chain_start(p_stay))
$$;

-- Residentes presentes no Lodge em p_at sem evidência no dia e sem ausência no período.
create or replace function public.residents_without_evidence(p_lodge uuid, p_day date, p_at timestamptz)
returns table (stay_id uuid, resident_id uuid, first_name text, last_name text, room_kind public.room_kind, room_code text, bed_number integer)
language sql stable
security definer
set search_path = public
as $$
  select st.id, st.resident_id, res.first_name, res.last_name, rm.kind, rm.code, b.number
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
  order by rm.sort_order, rm.code, b.number
$$;

-- Lista das 06h30 (B06, B27): candidatos do dia que termina, se a lista está completa, contador do mês.
create or replace function public.no_show_review(p_lodge uuid, p_day date)
returns jsonb
language plpgsql stable
security definer
set search_path = public
as $$
declare
  v_end timestamptz := public.operational_day_end(p_day);
begin
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
$$;

create or replace function public.confirm_no_shows(p_lodge uuid, p_day date, p_stays uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_staff_id();
  v_stay uuid;
  v_cand record;
  v_id uuid;
  v_count integer;
  v_limit integer := coalesce((public.param_value('presence.no_show_monthly_alert') #>> '{}')::int, 3);
  v_out jsonb := '[]'::jsonb;
begin
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
$$;

-- Desfazer No Show: só Manager/Owner, com motivo; o histórico fica (B10).
create or replace function public.undo_no_show(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required' using errcode = '22023'; end if;
  update public.no_shows
     set status = 'undone', undone_by = public.current_staff_id(), undone_at = now(), undo_reason = trim(p_reason)
   where id = p_id and status = 'confirmed';
  if not found then raise exception 'no_show_not_confirmed' using errcode = '22023'; end if;
end
$$;

-- Aviso das 18h30 (e consulta a qualquer hora): quem ainda não tem evidência hoje. Não registra nada.
create or replace function public.presence_alert(p_lodge uuid)
returns jsonb
language plpgsql stable
security definer
set search_path = public
as $$
declare
  v_day date := public.operational_day(now());
begin
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
$$;

-- ---------------------------------------------------------------------------
-- Acesso
-- ---------------------------------------------------------------------------
alter table public.room_check_runs enable row level security;
alter table public.room_check_marks enable row level security;
alter table public.sightings enable row level security;
alter table public.absences enable row level security;
alter table public.no_shows enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_reads enable row level security;

revoke all on public.room_check_runs, public.room_check_marks, public.sightings, public.absences,
  public.no_shows, public.notifications, public.notification_reads from anon, authenticated;

-- Horários de digitação (entered_at, launched_at, marked_at, recorded_at) ficam fora:
-- só a gestão os vê, por room_check_typing_times e pela auditoria.
grant select (id, lodge_id, operational_day, slot, checked_at, performed_by, performed_reported_by_entrant,
              entered_by, status, launched_by, sheet_number, version) on public.room_check_runs to authenticated;
grant select (id, run_id, stay_id, resident_id, result, marked_by, version) on public.room_check_marks to authenticated;
grant select (id, resident_id, lodge_id, seen_at, place, recorded_by) on public.sightings to authenticated;
grant select on public.absences, public.no_shows to authenticated;
grant select on public.notifications to authenticated;
grant select, insert on public.notification_reads to authenticated;

create policy runs_read on public.room_check_runs for select to authenticated using (public.is_active_staff());
create policy marks_read on public.room_check_marks for select to authenticated using (public.is_active_staff());
create policy sightings_read on public.sightings for select to authenticated using (public.is_active_staff());
create policy absences_read on public.absences for select to authenticated using (public.is_active_staff());
create policy no_shows_read on public.no_shows for select to authenticated using (public.is_active_staff());
create policy notifications_read on public.notifications for select to authenticated
  using (public.is_active_staff() and (audience = 'lodge' or public.is_management()));
create policy notification_reads_own on public.notification_reads for select to authenticated
  using (staff_id = public.current_staff_id());
create policy notification_reads_insert on public.notification_reads for insert to authenticated
  with check (staff_id = public.current_staff_id());

revoke all on function
  public.shift_of(timestamptz), public.slot_shift(text), public.slot_instant(date, text),
  public.check_slots(uuid, date), public.stays_present_at(uuid, timestamptz), public.correction_window(),
  public.absence_effective_end(public.absences), public.active_absence(uuid, timestamptz),
  public.open_room_check(uuid, date, text), public.set_room_check_details(uuid, timestamptz, uuid),
  public.room_check_sheet(uuid), public.mark_resident(uuid, uuid, public.check_result),
  public.clear_mark(uuid, uuid), public.launch_room_check(uuid), public.room_check_typing_times(uuid),
  public.register_absence(uuid, timestamptz, timestamptz, text), public.end_absence(uuid, timestamptz),
  public.overdue_absences(uuid), public.record_sighting(uuid, uuid, timestamptz, text),
  public.resident_evidence(uuid, date), public.seen_for_day(uuid, date),
  public.pending_slots(uuid, date, timestamptz), public.stay_chain_start(uuid),
  public.no_show_month_count(uuid, uuid, date), public.residents_without_evidence(uuid, date, timestamptz),
  public.no_show_review(uuid, date), public.confirm_no_shows(uuid, date, uuid[]),
  public.undo_no_show(uuid, text), public.presence_alert(uuid)
from public, anon;

grant execute on function
  public.shift_of(timestamptz), public.slot_shift(text), public.slot_instant(date, text),
  public.check_slots(uuid, date),
  public.open_room_check(uuid, date, text), public.set_room_check_details(uuid, timestamptz, uuid),
  public.room_check_sheet(uuid), public.mark_resident(uuid, uuid, public.check_result),
  public.clear_mark(uuid, uuid), public.launch_room_check(uuid), public.room_check_typing_times(uuid),
  public.register_absence(uuid, timestamptz, timestamptz, text), public.end_absence(uuid, timestamptz),
  public.overdue_absences(uuid), public.record_sighting(uuid, uuid, timestamptz, text),
  public.seen_for_day(uuid, date), public.pending_slots(uuid, date, timestamptz),
  public.no_show_review(uuid, date), public.confirm_no_shows(uuid, date, uuid[]),
  public.undo_no_show(uuid, text), public.presence_alert(uuid)
to authenticated;
