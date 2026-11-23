-- Automations run on a schedule inside the database: create a task, create a
-- reminder, write a summary of the day, or (once the assistant exists) ask the
-- AI. Each run is logged. The schedule check and the runner live here so a
-- cron job can call them with no server and no keys.
alter table public.automations
  add column action text not null default 'ai' check (action in ('ai', 'task', 'reminder', 'briefing')),
  add column payload jsonb not null default '{}';
alter table public.automations alter column prompt set default '';

create table public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  automation_id uuid not null references public.automations on delete cascade,
  ran_at timestamptz not null default now(),
  status text not null check (status in ('ok', 'waiting_ai', 'error')),
  output text not null default ''
);
create index automation_runs_automation on public.automation_runs (automation_id, ran_at desc);
alter table public.automation_runs enable row level security;
create policy automation_runs_owner on public.automation_runs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Due when today (in the user's time zone) is one of its weekdays (none = every
-- day), its time has come, and it has not run yet today. A late cron still
-- catches it later the same day.
create or replace function public.automation_is_due(p_weekdays int[], p_time time, p_last timestamptz, p_tz text, p_now timestamptz)
returns boolean language sql immutable as $$
  select (coalesce(cardinality(p_weekdays), 0) = 0 or extract(dow from (p_now at time zone p_tz))::int = any (p_weekdays))
     and (p_now at time zone p_tz)::time >= p_time
     and (p_last is null or (p_last at time zone p_tz)::date < (p_now at time zone p_tz)::date)
$$;

create or replace function public.brl_text(p numeric) returns text language sql immutable as $$
  select 'R$ ' || translate(to_char(p, 'FM999,999,990.00'), ',.', '.,')
$$;

-- The summary of a day: tasks due and late, reminders, habits, bills ahead.
create or replace function public.daily_briefing(p_user uuid, p_day date, p_tz text)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  t_today int; t_late int; titles text; rem text; n_habits int; bills text;
  lines text[] := '{}';
begin
  select count(*) filter (where (due_date at time zone p_tz)::date = p_day),
         count(*) filter (where (due_date at time zone p_tz)::date < p_day)
    into t_today, t_late
    from tasks where user_id = p_user and not completed and not is_archived and due_date is not null;
  lines := lines || format('Tarefas: %s para hoje%s.', t_today,
    case when t_late > 0 then format(', %s atrasada%s', t_late, case when t_late > 1 then 's' else '' end) else '' end);
  select string_agg('• ' || title, E'\n' order by rank, due_date) into titles from (
    select title, due_date, case priority when 'high' then 0 when 'medium' then 1 else 2 end as rank
      from tasks where user_id = p_user and not completed and not is_archived and due_date is not null
       and (due_date at time zone p_tz)::date <= p_day
     order by 3, due_date limit 5) t;
  if titles is not null then lines := lines || titles; end if;
  select string_agg(to_char(datetime at time zone p_tz, 'HH24:MI') || ' ' || title, ', ' order by datetime) into rem
    from reminders where user_id = p_user and not completed and (datetime at time zone p_tz)::date = p_day;
  if rem is not null then lines := lines || ('Lembretes: ' || rem || '.'); end if;
  select count(*) into n_habits from habits
   where user_id = p_user and not is_archived and frequency = 'days'
     and (coalesce(cardinality(schedule_days), 0) = 0 or extract(dow from p_day)::int = any (schedule_days));
  lines := lines || format('Hábitos do dia: %s.', n_habits);
  select string_agg(description || ' (' || brl_text(amount) || ', ' || to_char(date, 'DD/MM') || ')', ', ' order by date) into bills
    from transactions where user_id = p_user and is_pending and type = 'expense' and date between p_day and p_day + 3;
  if bills is not null then lines := lines || ('Contas até ' || to_char(p_day + 3, 'DD/MM') || ': ' || bills || '.'); end if;
  return 'Resumo de ' || to_char(p_day, 'DD/MM') || E'\n' || array_to_string(lines, E'\n');
end $$;

-- Runs one automation as its owner, logs the run and marks the day as done.
create or replace function public.run_automation(p_id uuid, p_now timestamptz default now())
returns text language plpgsql security definer set search_path = public as $$
declare
  a automations; tz text; today date; out text; st text := 'ok';
begin
  select * into a from automations where id = p_id;
  if not found then return null; end if;
  select coalesce((select timezone from user_settings where user_id = a.user_id), 'America/Sao_Paulo') into tz;
  today := (p_now at time zone tz)::date;
  begin
    if a.action = 'task' then
      insert into tasks (user_id, title, priority, due_date, due_all_day)
      values (a.user_id, coalesce(nullif(a.prompt, ''), a.title), coalesce(a.payload ->> 'priority', 'medium'),
              (today + time '23:59') at time zone tz, true);
      out := 'Tarefa criada: ' || coalesce(nullif(a.prompt, ''), a.title);
    elsif a.action = 'reminder' then
      insert into reminders (user_id, title, datetime)
      values (a.user_id, coalesce(nullif(a.prompt, ''), a.title), (today + a.time_of_day) at time zone tz);
      out := 'Lembrete criado: ' || coalesce(nullif(a.prompt, ''), a.title);
    elsif a.action = 'briefing' then
      out := daily_briefing(a.user_id, today, tz);
      insert into chat_messages (user_id, content, is_user, metadata)
      values (a.user_id, out, false, jsonb_build_object('automation_id', a.id, 'kind', 'briefing'));
    else
      st := 'waiting_ai';
      out := 'Aguardando o assistente de IA.';
    end if;
  exception when others then
    st := 'error';
    out := sqlerrm;
  end;
  insert into automation_runs (user_id, automation_id, ran_at, status, output) values (a.user_id, a.id, p_now, st, out);
  update automations set last_run_at = p_now where id = a.id;
  return out;
end $$;

-- What the cron job calls: every active automation that is due, for everyone.
create or replace function public.run_due_automations(p_now timestamptz default now())
returns int language plpgsql security definer set search_path = public as $$
declare a record; n int := 0;
begin
  for a in
    select au.id from automations au
      left join user_settings s on s.user_id = au.user_id
     where au.is_active
       and automation_is_due(au.weekdays, au.time_of_day, au.last_run_at, coalesce(s.timezone, 'America/Sao_Paulo'), p_now)
     order by au.time_of_day, au.created_at
  loop
    perform run_automation(a.id, p_now);
    n := n + 1;
  end loop;
  return n;
end $$;

-- "Run now" from the app: only the owner's own automations.
create or replace function public.run_automation_now(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from automations where id = p_id and user_id = auth.uid()) then
    raise exception 'automation not found' using errcode = '42501';
  end if;
  return run_automation(p_id, now());
end $$;

-- Only run_automation_now is for the app; the rest run as the database owner.
do $$
declare r text;
begin
  foreach r in array array['public', 'anon', 'authenticated'] loop
    if r = 'public' or exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke execute on function public.daily_briefing(uuid, date, text) from %s', r);
      execute format('revoke execute on function public.run_automation(uuid, timestamptz) from %s', r);
      execute format('revoke execute on function public.run_due_automations(timestamptz) from %s', r);
    end if;
  end loop;
end $$;
grant execute on function public.run_automation_now(uuid) to authenticated;
