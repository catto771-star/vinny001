-- DS Lodge — Fase 1 (2ª parte): Handover (Livro Ata) e rondas, Daily Tasks, Manutenção,
-- Warnings/FW e pendências (spec v1.1, s.6, s.7, s.11).

-- ---------------------------------------------------------------------------
-- Turnos
-- ---------------------------------------------------------------------------
-- Fim do turno (Day 07h–19h, Night 19h–07h) que contém o instante.
create or replace function public.shift_end(ts timestamptz)
returns timestamptz
language sql immutable parallel safe
as $$
  select case
    when extract(hour from ts at time zone 'Europe/Dublin') >= 7 and extract(hour from ts at time zone 'Europe/Dublin') < 19
      then ((ts at time zone 'Europe/Dublin')::date + time '19:00') at time zone 'Europe/Dublin'
    when extract(hour from ts at time zone 'Europe/Dublin') >= 19
      then (((ts at time zone 'Europe/Dublin')::date + 1) + time '07:00') at time zone 'Europe/Dublin'
    else ((ts at time zone 'Europe/Dublin')::date + time '07:00') at time zone 'Europe/Dublin'
  end
$$;

create or replace function public.shift_start_of(p_day date, p_shift text)
returns timestamptz
language sql immutable parallel safe
as $$
  select (p_day + case when p_shift = 'day' then time '07:00' else time '19:00' end) at time zone 'Europe/Dublin'
$$;

create or replace function public.shift_end_of(p_day date, p_shift text)
returns timestamptz
language sql immutable parallel safe
as $$
  select case when p_shift = 'day' then (p_day + time '19:00') at time zone 'Europe/Dublin'
              else ((p_day + 1) + time '07:00') at time zone 'Europe/Dublin' end
$$;

insert into public.parameters (key, value, valid_from) values
  ('handover.late_reasons', '["other_occurrence", "system_failure", "forgot", "info_received_later"]', '2026-01-01T00:00:00Z');

-- ---------------------------------------------------------------------------
-- Handover
-- ---------------------------------------------------------------------------
create table public.handover_entries (
  id uuid primary key default gen_random_uuid(),
  lodge_id uuid not null references public.lodges(id),
  kind text not null default 'note' check (kind in ('note', 'round', 'maintenance', 'warning')),
  body text not null check (length(trim(body)) > 0),
  occurred_at timestamptz not null,           -- hora do fato (informada)
  operational_day date not null,
  round_slot text,
  author_id uuid not null references public.staff(id),
  created_at timestamptz not null default now(), -- horário da digitação (só gestão)
  late_reason text,
  status text not null default 'active' check (status in ('active', 'voided')),
  void_reason text,
  voided_by uuid references public.staff(id),
  voided_at timestamptz,
  version integer not null default 1,
  check ((kind = 'round') = (round_slot is not null))
);

create unique index handover_one_round_per_slot on public.handover_entries(lodge_id, operational_day, round_slot) where kind = 'round';
create index handover_entries_feed_idx on public.handover_entries(lodge_id, occurred_at desc);

create table public.handover_mentions (
  id bigint generated always as identity primary key,
  entry_id uuid not null references public.handover_entries(id),
  resident_id uuid references public.residents(id),
  staff_id uuid references public.staff(id),
  check ((resident_id is null) <> (staff_id is null))
);

create index handover_mentions_resident_idx on public.handover_mentions(resident_id);
create index handover_mentions_entry_idx on public.handover_mentions(entry_id);

create table public.quick_phrases (
  id uuid primary key default gen_random_uuid(),
  text jsonb not null,               -- {"pt-PT": "...", "en-IE": "...", "pl-PL": "..."}
  sort_order integer not null default 0,
  active boolean not null default true
);

insert into public.quick_phrases (text, sort_order) values
  ('{"pt-PT": "Tudo tranquilo no turno.", "en-IE": "Quiet shift, nothing to report.", "pl-PL": "Spokojna zmiana, bez zdarzeń."}', 1),
  ('{"pt-PT": "Residente chegou depois do horário.", "en-IE": "Resident came back after hours.", "pl-PL": "Mieszkaniec wrócił po godzinach."}', 2),
  ('{"pt-PT": "Entrega recebida e conferida.", "en-IE": "Delivery received and checked.", "pl-PL": "Dostawa odebrana i sprawdzona."}', 3),
  ('{"pt-PT": "Visita de serviço externo (PASS/DCC).", "en-IE": "Visit from external service (PASS/DCC).", "pl-PL": "Wizyta służby zewnętrznej (PASS/DCC)."}', 4),
  ('{"pt-PT": "Ambulância chamada.", "en-IE": "Ambulance called.", "pl-PL": "Wezwano karetkę."}', 5),
  ('{"pt-PT": "Garda chamada.", "en-IE": "Gardaí called.", "pl-PL": "Wezwano Gardaí."}', 6);

create trigger handover_bump_version before update on public.handover_entries for each row execute function public.bump_version();
create trigger audit_handover_entries after insert or update or delete on public.handover_entries for each row execute function public.audit_row();

-- Inserção interna (usada pelas anotações, rondas, manutenção e warnings).
create or replace function public.insert_handover_entry(
  p_lodge uuid, p_kind text, p_body text, p_occurred_at timestamptz, p_mentions jsonb,
  p_late_reason text default null, p_round_day date default null, p_round_slot text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_m jsonb;
begin
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
$$;

-- Anotação. Lançada depois do fim do turno do fato exige motivo da lista para Office/Float (B38, B39).
create or replace function public.add_handover_note(p_lodge uuid, p_body text, p_occurred_at timestamptz, p_mentions jsonb, p_late_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_at timestamptz := coalesce(p_occurred_at, now());
  v_reasons jsonb := public.param_value('handover.late_reasons');
begin
  if public.current_staff_id() is null or not public.can_write_lodge(p_lodge) then
    raise exception 'not_authorised' using errcode = '42501';
  end if;
  if coalesce(trim(p_body), '') = '' then raise exception 'body_required' using errcode = '22023'; end if;
  if v_at > now() + interval '5 minutes' then raise exception 'invalid_time' using errcode = '22023'; end if;
  if now() > public.shift_end(v_at) and not public.is_management() then
    if p_late_reason is null or not (v_reasons ? p_late_reason) then
      raise exception 'late_reason_required' using errcode = '22023';
    end if;
  end if;
  return public.insert_handover_entry(p_lodge, 'note', p_body, v_at, p_mentions,
    case when now() > public.shift_end(v_at) then p_late_reason end);
end
$$;

create or replace function public.check_entry_correction(p_entry public.handover_entries)
returns void
language plpgsql stable
security definer
set search_path = public
as $$
begin
  if public.is_management() then return; end if;
  if not public.can_write_lodge(p_entry.lodge_id) then raise exception 'not_authorised' using errcode = '42501'; end if;
  if p_entry.author_id <> public.current_staff_id() then raise exception 'not_author' using errcode = '42501'; end if;
  if p_entry.created_at < now() - public.correction_window() then
    raise exception 'correction_window_closed' using errcode = '42501';
  end if;
end
$$;

create or replace function public.correct_handover_note(p_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_e public.handover_entries;
begin
  select * into v_e from public.handover_entries where id = p_id for update;
  if not found then raise exception 'entry_not_found' using errcode = 'P0002'; end if;
  perform public.check_entry_correction(v_e);
  if v_e.kind = 'round' then raise exception 'round_not_editable' using errcode = '22023'; end if;
  if coalesce(trim(p_body), '') = '' then raise exception 'body_required' using errcode = '22023'; end if;
  update public.handover_entries set body = trim(p_body) where id = p_id;
end
$$;

create or replace function public.void_handover_note(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_e public.handover_entries;
begin
  select * into v_e from public.handover_entries where id = p_id for update;
  if not found then raise exception 'entry_not_found' using errcode = 'P0002'; end if;
  perform public.check_entry_correction(v_e);
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required' using errcode = '22023'; end if;
  update public.handover_entries
     set status = 'voided', void_reason = trim(p_reason), voided_by = public.current_staff_id(), voided_at = now()
   where id = p_id;
end
$$;

create or replace function public.handover_typing_times(p_ids uuid[])
returns table (id uuid, author_id uuid, at timestamptz)
language plpgsql stable
security definer
set search_path = public
as $$
begin
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  return query select e.id, e.author_id, e.created_at from public.handover_entries e where e.id = any (p_ids);
end
$$;

-- ---------------------------------------------------------------------------
-- Rondas de 2 em 2 horas (um clique → "Room Check Done")
-- ---------------------------------------------------------------------------
create or replace function public.round_slots()
returns text[]
language sql stable
security definer
set search_path = public
as $$
  select coalesce(array(select jsonb_array_elements_text(public.param_value('rounds.hours'))), '{}')
$$;

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
  if public.slot_instant(p_day, p_slot) > now() + interval '15 minutes' then
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

-- Rondas do dia já vencidas (com 30 min de folga) sem linha no Handover.
create or replace function public.pending_rounds(p_lodge uuid)
returns text[]
language sql stable
security definer
set search_path = public
as $$
  select coalesce(array(
    select s from unnest(public.round_slots()) s
    where public.is_active_staff()
      and public.slot_instant(public.operational_day(now()), s) + interval '30 minutes' <= now()
      and not exists (
        select 1 from public.handover_entries e
        where e.lodge_id = p_lodge and e.kind = 'round'
          and e.operational_day = public.operational_day(now()) and e.round_slot = s)
    order by (s < '07:00'), s
  ), '{}')
$$;

-- O lançamento do Room Check das 12h/18h/22h conclui a ronda do mesmo horário (mesma linha).
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
  if v_run.slot = any (public.round_slots()) and not exists (
    select 1 from public.handover_entries e
    where e.lodge_id = v_run.lodge_id and e.kind = 'round' and e.operational_day = v_run.operational_day and e.round_slot = v_run.slot
  ) then
    perform public.insert_handover_entry(v_run.lodge_id, 'round', 'Room Check Done', v_run.checked_at, '[]'::jsonb,
                                         null, v_run.operational_day, v_run.slot);
  end if;
  return jsonb_build_object('status', 'launched');
end
$$;

-- ---------------------------------------------------------------------------
-- Daily Tasks
-- ---------------------------------------------------------------------------
create table public.task_templates (
  id uuid primary key default gen_random_uuid(),
  lodge_id uuid not null references public.lodges(id),
  shift text not null check (shift in ('day', 'night')),
  weekdays integer[],                 -- ISO 1 (segunda) … 7 (domingo); nulo = todos os dias
  title jsonb not null,               -- {"pt-PT", "en-IE", "pl-PL"}
  sort_order integer not null default 0,
  suggested_time text,                -- só referência
  active boolean not null default true,
  created_by uuid references public.staff(id),
  created_at timestamptz not null default now(),
  version integer not null default 1
);

create table public.task_extras (
  id uuid primary key default gen_random_uuid(),
  lodge_id uuid not null references public.lodges(id),
  operational_day date not null,
  shift text not null check (shift in ('day', 'night')),
  staff_id uuid references public.staff(id),   -- tarefa para uma pessoa; nulo = para o turno
  title text not null check (length(trim(title)) > 0),
  due_at timestamptz,
  reassigned_from uuid references public.staff(id),
  created_by uuid not null references public.staff(id),
  created_at timestamptz not null default now(),
  version integer not null default 1
);

create table public.task_signatures (
  id uuid primary key default gen_random_uuid(),
  lodge_id uuid not null references public.lodges(id),
  operational_day date not null,
  shift text not null check (shift in ('day', 'night')),
  template_id uuid references public.task_templates(id),
  extra_id uuid references public.task_extras(id),
  staff_id uuid not null references public.staff(id),
  duty_function text not null,
  signed_at timestamptz not null default now(),
  check ((template_id is null) <> (extra_id is null))
);

create unique index task_signatures_once on public.task_signatures(coalesce(template_id, extra_id), lodge_id, operational_day, shift, staff_id);

create trigger task_templates_bump_version before update on public.task_templates for each row execute function public.bump_version();
create trigger task_extras_bump_version before update on public.task_extras for each row execute function public.bump_version();
create trigger audit_task_templates after insert or update or delete on public.task_templates for each row execute function public.audit_row();
create trigger audit_task_extras after insert or update or delete on public.task_extras for each row execute function public.audit_row();
create trigger audit_task_signatures after insert or update or delete on public.task_signatures for each row execute function public.audit_row();

create or replace function public.iso_weekday(p_day date)
returns integer
language sql immutable parallel safe
as $$ select extract(isodow from p_day)::int $$;

-- Tarefas de um turno: modelos que valem naquele dia + extras do turno.
create or replace function public.shift_tasks(p_lodge uuid, p_day date, p_shift text)
returns table (
  kind text, task_id uuid, title jsonb, suggested_time text, staff_id uuid, due_at timestamptz, sort_order integer,
  signatures jsonb
)
language sql stable
security definer
set search_path = public
as $$
  select 'template', t.id, t.title, t.suggested_time, null::uuid, null::timestamptz, t.sort_order,
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
  order by 7, 4 nulls last
$$;

-- Tarefas sem assinatura dos turnos já iniciados (últimos 7 dias): não desaparecem; atrasadas quando o turno acaba.
create or replace function public.pending_tasks(p_lodge uuid)
returns table (
  kind text, task_id uuid, title jsonb, operational_day date, shift text, staff_id uuid, due_at timestamptz,
  overdue boolean, overdue_since timestamptz
)
language sql stable
security definer
set search_path = public
as $$
  with shifts as (
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
  order by 4, 5, t.sort_order
$$;

create or replace function public.sign_task(p_kind text, p_task uuid, p_lodge uuid, p_day date, p_shift text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_staff_id();
  v_post public.duty_posts := public.my_open_post();
begin
  if v_me is null or not public.can_write_lodge(p_lodge) then raise exception 'not_authorised' using errcode = '42501'; end if;
  if public.shift_start_of(p_day, p_shift) > now() + interval '5 minutes' then
    raise exception 'shift_not_started' using errcode = '22023';
  end if;
  if not exists (select 1 from public.shift_tasks(p_lodge, p_day, p_shift) t where t.kind = p_kind and t.task_id = p_task) then
    raise exception 'task_not_in_shift' using errcode = '22023';
  end if;
  insert into public.task_signatures (lodge_id, operational_day, shift, template_id, extra_id, staff_id, duty_function)
  values (p_lodge, p_day, p_shift,
          case when p_kind = 'template' then p_task end, case when p_kind = 'extra' then p_task end,
          v_me, coalesce(v_post.function::text, public.current_staff_role()::text))
  on conflict do nothing;
end
$$;

create or replace function public.create_task_template(p_lodge uuid, p_shift text, p_weekdays integer[], p_title jsonb, p_sort integer, p_suggested_time text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  insert into public.task_templates (lodge_id, shift, weekdays, title, sort_order, suggested_time, created_by)
  values (p_lodge, p_shift, p_weekdays, p_title, coalesce(p_sort, 0), p_suggested_time, public.current_staff_id())
  returning id into v_id;
  return v_id;
end
$$;

create or replace function public.create_extra_task(p_lodge uuid, p_day date, p_shift text, p_staff uuid, p_title text, p_due_at timestamptz)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  insert into public.task_extras (lodge_id, operational_day, shift, staff_id, title, due_at, created_by)
  values (p_lodge, p_day, p_shift, p_staff, trim(p_title), p_due_at, public.current_staff_id())
  returning id into v_id;
  return v_id;
end
$$;

-- B15: pessoa fora do turno → o Manager passa a tarefa para o turno.
create or replace function public.reassign_extra_task(p_extra uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  update public.task_extras set reassigned_from = staff_id, staff_id = null where id = p_extra and staff_id is not null;
end
$$;

-- Pop-up ao entrar: tarefas para mim + pendentes do meu Lodge.
create or replace function public.my_task_alerts()
returns table (kind text, task_id uuid, title jsonb, lodge_id uuid, operational_day date, shift text, staff_id uuid, due_at timestamptz, overdue boolean)
language sql stable
security definer
set search_path = public
as $$
  select 'extra', x.id, jsonb_build_object('pt-PT', x.title, 'en-IE', x.title, 'pl-PL', x.title), x.lodge_id, x.operational_day, x.shift, x.staff_id, x.due_at,
         coalesce(x.due_at, public.shift_end_of(x.operational_day, x.shift)) < now()
  from public.task_extras x
  where x.staff_id = public.current_staff_id()
    and not exists (select 1 from public.task_signatures s where s.extra_id = x.id)
  union all
  select p.kind, p.task_id, p.title, (public.my_open_post()).lodge_id, p.operational_day, p.shift, p.staff_id, p.due_at, p.overdue
  from public.pending_tasks((public.my_open_post()).lodge_id) p
  where (public.my_open_post()).lodge_id is not null and (p.staff_id is null)
$$;

-- ---------------------------------------------------------------------------
-- Manutenção
-- ---------------------------------------------------------------------------
create table public.maintenance_tickets (
  id uuid primary key default gen_random_uuid(),
  lodge_id uuid not null references public.lodges(id),
  location text not null check (length(trim(location)) > 0),
  description text not null check (length(trim(description)) > 0),
  priority text not null check (priority in ('urgent', 'normal', 'low')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'on_hold', 'resolved', 'reopened')),
  deadline_at timestamptz not null,
  request_key uuid not null unique,
  handover_entry_id uuid references public.handover_entries(id),
  created_by uuid not null references public.staff(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.staff(id),
  version integer not null default 1
);

create table public.maintenance_events (
  id bigint generated always as identity primary key,
  ticket_id uuid not null references public.maintenance_tickets(id),
  kind text not null check (kind in ('created', 'status', 'deadline', 'note')),
  from_value text,
  to_value text,
  note text,
  staff_id uuid references public.staff(id),
  at timestamptz not null default now()
);

create table public.maintenance_reminder_snoozes (
  ticket_id uuid not null references public.maintenance_tickets(id),
  staff_id uuid not null references public.staff(id),
  snoozed_at timestamptz not null default now(),
  primary key (ticket_id, staff_id)
);

create trigger maintenance_bump_version before update on public.maintenance_tickets for each row execute function public.bump_version();
create trigger audit_maintenance_tickets after insert or update or delete on public.maintenance_tickets for each row execute function public.audit_row();

-- "Criar manutenção" gera numa só operação a anotação, o chamado e o aviso ao Manager (s.7, B32).
create or replace function public.create_maintenance(p_lodge uuid, p_location text, p_description text, p_priority text, p_request_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.maintenance_tickets;
  v_entry uuid;
  v_id uuid;
  v_hours integer;
begin
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
$$;

-- Resolver: Office do próprio Lodge ou gestão (Float sozinho não). Demais status e prazo: gestão.
create or replace function public.maintenance_set_status(p_ticket uuid, p_status text, p_deadline timestamptz, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t public.maintenance_tickets;
  v_post public.duty_posts := public.my_open_post();
  v_me uuid := public.current_staff_id();
  v_mgmt boolean := public.is_management();
begin
  select * into v_t from public.maintenance_tickets where id = p_ticket for update;
  if not found then raise exception 'ticket_not_found' using errcode = 'P0002'; end if;
  if p_status is not null and p_status not in ('open', 'in_progress', 'on_hold', 'resolved', 'reopened') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  if not v_mgmt then
    if not (v_post.function = 'office' and v_post.lodge_id = v_t.lodge_id) then
      raise exception 'not_authorised' using errcode = '42501';
    end if;
    if p_deadline is not null or (p_status is not null and p_status <> 'resolved') then
      raise exception 'not_authorised' using errcode = '42501';
    end if;
  end if;

  if p_status is not null and p_status <> v_t.status then
    update public.maintenance_tickets
       set status = p_status,
           resolved_at = case when p_status = 'resolved' then now() end,
           resolved_by = case when p_status = 'resolved' then v_me end
     where id = p_ticket;
    insert into public.maintenance_events (ticket_id, kind, from_value, to_value, note, staff_id)
    values (p_ticket, 'status', v_t.status, p_status, nullif(trim(p_note), ''), v_me);
    p_note := null;
  end if;
  if p_deadline is not null and p_deadline is distinct from v_t.deadline_at then
    update public.maintenance_tickets set deadline_at = p_deadline where id = p_ticket;
    insert into public.maintenance_events (ticket_id, kind, from_value, to_value, note, staff_id)
    values (p_ticket, 'deadline', v_t.deadline_at::text, p_deadline::text, nullif(trim(p_note), ''), v_me);
    p_note := null;
  end if;
  if nullif(trim(p_note), '') is not null then
    insert into public.maintenance_events (ticket_id, kind, note, staff_id) values (p_ticket, 'note', trim(p_note), v_me);
  end if;
end
$$;

create or replace function public.maintenance_list(p_lodge uuid)
returns table (
  id uuid, lodge_id uuid, location text, description text, priority text, status text, deadline_at timestamptz,
  created_at timestamptz, created_by uuid, resolved_at timestamptz, overdue boolean, last_event_at timestamptz
)
language sql stable
security definer
set search_path = public
as $$
  select t.id, t.lodge_id, t.location, t.description, t.priority, t.status, t.deadline_at, t.created_at, t.created_by, t.resolved_at,
         t.status <> 'resolved' and t.deadline_at < now(),
         (select max(e.at) from public.maintenance_events e where e.ticket_id = t.id)
  from public.maintenance_tickets t
  where public.is_active_staff() and (p_lodge is null or t.lodge_id = p_lodge)
  order by (t.status = 'resolved'), t.deadline_at
$$;

-- Lembrete ao Manager (B34, B35): prazo vencido sem alteração; volta a cada 24 h até responder.
create or replace function public.maintenance_reminders()
returns table (id uuid, lodge_id uuid, location text, description text, priority text, status text, deadline_at timestamptz)
language sql stable
security definer
set search_path = public
as $$
  select t.id, t.lodge_id, t.location, t.description, t.priority, t.status, t.deadline_at
  from public.maintenance_tickets t
  where public.is_management()
    and t.status <> 'resolved' and t.deadline_at < now()
    and coalesce((select max(e.at) from public.maintenance_events e where e.ticket_id = t.id), t.created_at)
        < greatest(t.deadline_at, now() - interval '24 hours')
    and not exists (
      select 1 from public.maintenance_reminder_snoozes z
      where z.ticket_id = t.id and z.staff_id = public.current_staff_id() and z.snoozed_at > now() - interval '24 hours')
  order by t.deadline_at
$$;

create or replace function public.snooze_maintenance_reminder(p_ticket uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  insert into public.maintenance_reminder_snoozes (ticket_id, staff_id) values (p_ticket, public.current_staff_id())
  on conflict (ticket_id, staff_id) do update set snoozed_at = now();
end
$$;

-- ---------------------------------------------------------------------------
-- Warnings e FW
-- ---------------------------------------------------------------------------
create table public.warnings (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.residents(id),
  stay_id uuid not null references public.stays(id),
  lodge_id uuid not null references public.lodges(id),
  type text not null check (type in ('verbal', 'written', 'final_written')),
  note text,
  handover_entry_id uuid not null references public.handover_entries(id),
  issued_by uuid not null references public.staff(id),
  issued_at timestamptz not null default now(),
  active boolean not null default true,
  deactivated_by uuid references public.staff(id),
  deactivated_at timestamptz,
  deactivation_reason text,
  version integer not null default 1
);

create index warnings_resident_idx on public.warnings(resident_id);
create trigger warnings_bump_version before update on public.warnings for each row execute function public.bump_version();
create trigger audit_warnings after insert or update or delete on public.warnings for each row execute function public.audit_row();

create or replace function public.record_warning(p_stay uuid, p_type text, p_note text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stay public.stays;
  v_entry uuid;
  v_id uuid;
  v_label text := case p_type when 'verbal' then 'Verbal Warning' when 'written' then 'Written Warning' when 'final_written' then 'Final Written Warning (FW)' end;
begin
  select * into v_stay from public.stays where id = p_stay;
  if not found or v_stay.status = 'ended' then raise exception 'stay_not_open' using errcode = '22023'; end if;
  if public.current_staff_id() is null or not public.can_write_lodge(v_stay.lodge_id) then
    raise exception 'not_authorised' using errcode = '42501';
  end if;
  if v_label is null then raise exception 'invalid_warning_type' using errcode = '22023'; end if;
  v_entry := public.insert_handover_entry(v_stay.lodge_id, 'warning',
    v_label || coalesce(': ' || nullif(trim(p_note), ''), ''), now(), jsonb_build_array(jsonb_build_object('resident_id', v_stay.resident_id)));
  insert into public.warnings (resident_id, stay_id, lodge_id, type, note, handover_entry_id, issued_by)
  values (v_stay.resident_id, p_stay, v_stay.lodge_id, p_type, nullif(trim(p_note), ''), v_entry, public.current_staff_id())
  returning id into v_id;
  return v_id;
end
$$;

create or replace function public.deactivate_final_warning(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required' using errcode = '22023'; end if;
  update public.warnings
     set active = false, deactivated_by = public.current_staff_id(), deactivated_at = now(), deactivation_reason = trim(p_reason)
   where id = p_id and type = 'final_written' and active;
  if not found then raise exception 'warning_not_active' using errcode = '22023'; end if;
end
$$;

create or replace function public.has_final_warning(p_resident uuid)
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.warnings w where w.resident_id = p_resident and w.type = 'final_written' and w.active)
$$;

-- Etiqueta FW na Folha do dia (s.5) e no mapa/listas.
drop function public.room_check_sheet(uuid);
create function public.room_check_sheet(p_run uuid)
returns table (
  room_id uuid, room_kind public.room_kind, room_code text, room_sort integer,
  bed_id uuid, bed_number integer, bed_status public.bed_status,
  stay_id uuid, resident_id uuid, first_name text, last_name text, date_of_birth date,
  absence_id uuid, result public.check_result, marked_by uuid, final_warning boolean
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
         m.result, m.marked_by,
         coalesce(public.has_final_warning(res.id), false)
  from public.beds b
  join public.rooms r on r.id = b.room_id
  left join public.stays_present_at(v_run.lodge_id, v_run.checked_at) s on s.bed_id = b.id
  left join public.residents res on res.id = s.resident_id
  left join public.room_check_marks m on m.run_id = v_run.id and m.stay_id = s.id
  where r.lodge_id = v_run.lodge_id and b.active and r.active
  order by r.sort_order, r.code, b.number;
end
$$;

create or replace view public.bed_occupancy
with (security_invoker = true)
as
select
  l.id as lodge_id, l.code as lodge_code, r.id as room_id, r.kind as room_kind, r.code as room_code, r.sort_order as room_sort,
  b.id as bed_id, b.number as bed_number, b.status as bed_status,
  s.id as stay_id, s.status as stay_status, s.admitted_at,
  res.id as resident_id, res.first_name, res.last_name, res.date_of_birth, res.pass_id,
  coalesce(public.has_final_warning(res.id), false) as final_warning
from public.beds b
join public.rooms r on r.id = b.room_id
join public.lodges l on l.id = r.lodge_id
left join public.stays s on s.bed_id = b.id and s.status <> 'ended'
left join public.residents res on res.id = s.resident_id
where b.active and r.active and l.active;

-- ---------------------------------------------------------------------------
-- Pendências por seção (bolinhas vermelhas — somem só quando resolvidas)
-- ---------------------------------------------------------------------------
create or replace function public.pending_counts(p_lodge uuid)
returns jsonb
language sql stable
security definer
set search_path = public
as $$
  select case when not public.is_active_staff() then null else jsonb_build_object(
    'tasks', (select count(*) from public.pending_tasks(p_lodge)),
    'maintenance', (select count(*) from public.maintenance_tickets t where t.lodge_id = p_lodge and t.status <> 'resolved'),
    'absences', (select count(*) from public.overdue_absences(p_lodge)),
    'checks', cardinality(public.pending_slots(p_lodge, public.operational_day(now()), now())),
    'rounds', cardinality(public.pending_rounds(p_lodge)),
    'no_shows', (select count(*) from public.residents_without_evidence(p_lodge, public.operational_day(now()) - 1,
                                                                     public.operational_day_end(public.operational_day(now()) - 1)))
  ) end
$$;

-- ---------------------------------------------------------------------------
-- Acesso
-- ---------------------------------------------------------------------------
alter table public.handover_entries enable row level security;
alter table public.handover_mentions enable row level security;
alter table public.quick_phrases enable row level security;
alter table public.task_templates enable row level security;
alter table public.task_extras enable row level security;
alter table public.task_signatures enable row level security;
alter table public.maintenance_tickets enable row level security;
alter table public.maintenance_events enable row level security;
alter table public.maintenance_reminder_snoozes enable row level security;
alter table public.warnings enable row level security;

revoke all on public.handover_entries, public.handover_mentions, public.quick_phrases, public.task_templates,
  public.task_extras, public.task_signatures, public.maintenance_tickets, public.maintenance_events,
  public.maintenance_reminder_snoozes, public.warnings from anon, authenticated;

grant select (id, lodge_id, kind, body, occurred_at, operational_day, round_slot, author_id, late_reason, status,
              void_reason, voided_by, voided_at, version) on public.handover_entries to authenticated;
grant select on public.handover_mentions, public.quick_phrases, public.task_templates, public.task_extras,
  public.task_signatures, public.maintenance_tickets, public.maintenance_events, public.warnings to authenticated;
grant insert, update on public.quick_phrases to authenticated;
grant update (title, sort_order, suggested_time, active, weekdays, version) on public.task_templates to authenticated;

create policy handover_read on public.handover_entries for select to authenticated using (public.is_active_staff());
create policy mentions_read on public.handover_mentions for select to authenticated using (public.is_active_staff());
create policy phrases_read on public.quick_phrases for select to authenticated using (public.is_active_staff());
create policy phrases_insert on public.quick_phrases for insert to authenticated with check (public.is_management());
create policy phrases_update on public.quick_phrases for update to authenticated using (public.is_management()) with check (public.is_management());
create policy templates_read on public.task_templates for select to authenticated using (public.is_active_staff());
create policy templates_update on public.task_templates for update to authenticated using (public.is_management()) with check (public.is_management());
create policy extras_read on public.task_extras for select to authenticated using (public.is_active_staff());
create policy signatures_read on public.task_signatures for select to authenticated using (public.is_active_staff());
create policy tickets_read on public.maintenance_tickets for select to authenticated using (public.is_active_staff());
create policy events_read on public.maintenance_events for select to authenticated using (public.is_active_staff());
create policy warnings_read on public.warnings for select to authenticated using (public.is_active_staff());

revoke all on function
  public.shift_end(timestamptz), public.shift_start_of(date, text), public.shift_end_of(date, text),
  public.insert_handover_entry(uuid, text, text, timestamptz, jsonb, text, date, text),
  public.add_handover_note(uuid, text, timestamptz, jsonb, text),
  public.check_entry_correction(public.handover_entries), public.correct_handover_note(uuid, text),
  public.void_handover_note(uuid, text), public.handover_typing_times(uuid[]), public.round_slots(),
  public.room_check_done(uuid, date, text), public.pending_rounds(uuid), public.launch_room_check(uuid),
  public.iso_weekday(date), public.shift_tasks(uuid, date, text), public.pending_tasks(uuid),
  public.sign_task(text, uuid, uuid, date, text), public.create_task_template(uuid, text, integer[], jsonb, integer, text),
  public.create_extra_task(uuid, date, text, uuid, text, timestamptz), public.reassign_extra_task(uuid),
  public.my_task_alerts(), public.create_maintenance(uuid, text, text, text, uuid),
  public.maintenance_set_status(uuid, text, timestamptz, text), public.maintenance_list(uuid),
  public.maintenance_reminders(), public.snooze_maintenance_reminder(uuid),
  public.record_warning(uuid, text, text), public.deactivate_final_warning(uuid, text), public.has_final_warning(uuid),
  public.room_check_sheet(uuid), public.pending_counts(uuid)
from public, anon;

grant execute on function
  public.shift_end(timestamptz), public.shift_start_of(date, text), public.shift_end_of(date, text),
  public.add_handover_note(uuid, text, timestamptz, jsonb, text),
  public.correct_handover_note(uuid, text), public.void_handover_note(uuid, text), public.handover_typing_times(uuid[]),
  public.round_slots(), public.room_check_done(uuid, date, text), public.pending_rounds(uuid), public.launch_room_check(uuid),
  public.shift_tasks(uuid, date, text), public.pending_tasks(uuid), public.sign_task(text, uuid, uuid, date, text),
  public.create_task_template(uuid, text, integer[], jsonb, integer, text),
  public.create_extra_task(uuid, date, text, uuid, text, timestamptz), public.reassign_extra_task(uuid),
  public.my_task_alerts(), public.create_maintenance(uuid, text, text, text, uuid),
  public.maintenance_set_status(uuid, text, timestamptz, text), public.maintenance_list(uuid),
  public.maintenance_reminders(), public.snooze_maintenance_reminder(uuid),
  public.record_warning(uuid, text, text), public.deactivate_final_warning(uuid, text), public.has_final_warning(uuid),
  public.room_check_sheet(uuid), public.pending_counts(uuid)
to authenticated;
