-- AI runs: the new 'running' status, and dispatch is closed to the app and
-- does nothing without pg_net and Vault.
\set ON_ERROR_STOP on
grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f1', 'f1@test') on conflict do nothing;
insert into public.automations (id, user_id, title, prompt, action, time_of_day)
  values ('00000000-0000-0000-0000-00000000f0f1', '00000000-0000-0000-0000-0000000000f1', 'Semana', 'Planeje minha semana', 'ai', '08:00');
do $$
begin
  if public.dispatch_ai_runs() then raise exception 'dispatched with nothing waiting'; end if;
  perform public.run_automation('00000000-0000-0000-0000-00000000f0f1', '2026-11-18 13:00+00');
  if (select status from automation_runs where automation_id = '00000000-0000-0000-0000-00000000f0f1') <> 'waiting_ai' then raise exception 'ai run should wait'; end if;
  -- Locally there is no pg_net nor Vault: nothing is sent.
  if public.dispatch_ai_runs() then raise exception 'dispatched without pg_net and Vault'; end if;
  update automation_runs set status = 'running' where automation_id = '00000000-0000-0000-0000-00000000f0f1';
  if has_function_privilege('authenticated', 'public.dispatch_ai_runs()', 'execute') then raise exception 'dispatch open to the app'; end if;
end $$;
do $$
begin
  update automation_runs set status = 'thinking';
  raise exception 'an unknown status was accepted';
exception when check_violation then null;
end $$;
