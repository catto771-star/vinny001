-- The schedule, the runner and who may call what.
\set ON_ERROR_STOP on
grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'e1@test'),
  ('00000000-0000-0000-0000-0000000000e2', 'e2@test') on conflict do nothing;

-- 2026-11-18 is a Wednesday (dow 3); 10:00 in São Paulo is 13:00 UTC.
do $$
begin
  if not automation_is_due('{}', '08:00', null, 'America/Sao_Paulo', '2026-11-18 13:00+00') then raise exception 'every day at 8, due at 10'; end if;
  if automation_is_due('{}', '11:00', null, 'America/Sao_Paulo', '2026-11-18 13:00+00') then raise exception 'not yet 11'; end if;
  if automation_is_due('{1,5}', '08:00', null, 'America/Sao_Paulo', '2026-11-18 13:00+00') then raise exception 'not a Monday or Friday'; end if;
  if not automation_is_due('{3}', '08:00', '2026-11-17 12:00+00', 'America/Sao_Paulo', '2026-11-18 13:00+00') then raise exception 'ran yesterday, due today'; end if;
  if automation_is_due('{3}', '08:00', '2026-11-18 11:05+00', 'America/Sao_Paulo', '2026-11-18 13:00+00') then raise exception 'already ran today'; end if;
  -- 23:30 in São Paulo is already the next day in UTC: still the 18th there.
  if automation_is_due('{}', '08:00', '2026-11-18 11:05+00', 'America/Sao_Paulo', '2026-11-19 02:30+00') then raise exception 'time zone day'; end if;
  if brl_text(1234.5) <> 'R$ 1.234,50' then raise exception 'money text: %', brl_text(1234.5); end if;
end $$;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
insert into public.tasks (title, due_date, priority) values ('Pagar IPVA', '2026-11-18 15:00-03', 'high'), ('Atrasada', '2026-11-10 15:00-03', 'low');
insert into public.habits (name) values ('Ler');
insert into public.automations (id, title, prompt, action, time_of_day) values
  ('00000000-0000-0000-0000-00000000e0e1', 'Revisão', 'Revisar finanças', 'task', '08:00'),
  ('00000000-0000-0000-0000-00000000e0e2', 'Bom dia', '', 'briefing', '07:00'),
  ('00000000-0000-0000-0000-00000000e0e3', 'Pergunta', 'Como foi minha semana?', 'ai', '09:00'),
  ('00000000-0000-0000-0000-00000000e0e4', 'Desligada', 'x', 'task', '06:00');
update public.automations set is_active = false where id = '00000000-0000-0000-0000-00000000e0e4';
-- The app cannot call the runner nor read someone's briefing.
do $$
begin
  if has_function_privilege('authenticated', 'public.run_due_automations(timestamptz)', 'execute')
     or has_function_privilege('authenticated', 'public.daily_briefing(uuid, date, text)', 'execute')
     or has_function_privilege('authenticated', 'public.run_automation(uuid, timestamptz)', 'execute') then
    raise exception 'runner open to the app';
  end if;
end $$;
reset role;

do $$
declare n int; brief text;
begin
  n := run_due_automations('2026-11-18 13:00+00');
  if n <> 3 then raise exception 'expected 3 runs, got %', n; end if;
  if run_due_automations('2026-11-18 14:00+00') <> 0 then raise exception 'ran twice on one day'; end if;
  if not exists (select 1 from tasks where title = 'Revisar finanças' and user_id = '00000000-0000-0000-0000-0000000000e1') then raise exception 'task not created'; end if;
  select content into brief from chat_messages where user_id = '00000000-0000-0000-0000-0000000000e1';
  -- The 07:00 summary runs before the 08:00 task automation: earlier times first.
  if brief not like '%Tarefas: 1 para hoje, 1 atrasada.%' or brief not like '%• Pagar IPVA%' or brief not like '%Hábitos do dia: 1.%' then
    raise exception 'briefing: %', brief;
  end if;
  if (select status from automation_runs where automation_id = '00000000-0000-0000-0000-00000000e0e3') <> 'waiting_ai' then raise exception 'ai run status'; end if;
end $$;

-- Run now: the owner yes, someone else no.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e2';
do $$
begin
  perform run_automation_now('00000000-0000-0000-0000-00000000e0e1');
  raise exception 'ran an automation of another user';
exception when insufficient_privilege then null;
end $$;
do $$ begin if exists (select 1 from automation_runs) then raise exception 'runs leaked'; end if; end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
do $$
begin
  if run_automation_now('00000000-0000-0000-0000-00000000e0e1') not like 'Tarefa criada%' then raise exception 'run now'; end if;
end $$;
reset role;
