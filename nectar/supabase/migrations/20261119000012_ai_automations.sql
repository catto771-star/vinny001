-- AI requests of the autopilot. run_automation leaves them as 'waiting_ai';
-- dispatch_ai_runs asks the assistant function to answer them, sending the
-- project URL and a shared secret kept in Supabase Vault ('project_url',
-- 'automation_secret'). The function claims each run ('running') before
-- answering, so two calls never answer the same one.
alter table public.automation_runs drop constraint automation_runs_status_check;
alter table public.automation_runs add constraint automation_runs_status_check
  check (status in ('ok', 'waiting_ai', 'running', 'error'));

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
end $$;

-- True when it asked the function; false when nothing waits or the setup
-- (pg_net, Vault and its two secrets) is missing, as in the local test database.
create or replace function public.dispatch_ai_runs()
returns boolean language plpgsql security definer set search_path = public as $$
declare base text; secret text;
begin
  if not exists (select 1 from automation_runs where status = 'waiting_ai') then return false; end if;
  if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null or to_regclass('vault.decrypted_secrets') is null then
    return false;
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into base using 'project_url';
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into secret using 'automation_secret';
  if base is null or secret is null then return false; end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 150000)'
    using base || '/functions/v1/assistant', '{"process_runs": true}'::jsonb,
          jsonb_build_object('Content-Type', 'application/json', 'x-automation-secret', secret);
  return true;
end $$;

do $$
declare r text;
begin
  foreach r in array array['public', 'anon', 'authenticated'] loop
    if r = 'public' or exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke execute on function public.dispatch_ai_runs() from %s', r);
    end if;
  end loop;
end $$;

-- The same 5-minute job now also hands waiting AI requests to the assistant.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('painel-automations', '*/5 * * * *', 'select public.run_due_automations(); select public.dispatch_ai_runs();');
  end if;
end $$;
