-- Every 5 minutes, run the automations that are due. Skipped where pg_cron is
-- not available (the local test database).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('painel-automations', '*/5 * * * *', 'select public.run_due_automations()');
  end if;
end $$;
