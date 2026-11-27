-- Browser push: each device that turns notifications on stores its
-- subscription; the notify function sends what is due every 5 minutes and
-- logs each notification key, so none is sent twice.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device text,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
create policy push_subscriptions_owner on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.notification_log (
  user_id uuid not null references auth.users on delete cascade,
  key text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.notification_log enable row level security;
create policy notification_log_owner on public.notification_log for select to authenticated using (user_id = auth.uid());

alter table public.user_settings
  add column notify_prefs jsonb not null default '{"reminders": true, "tasks": true, "digest": true, "autopilot": true}';

-- Calls the notify function when some device is subscribed. Same setup as
-- dispatch_ai_runs (pg_net, Vault 'project_url' and 'automation_secret').
create or replace function public.dispatch_notifications()
returns boolean language plpgsql security definer set search_path = public as $$
declare base text; secret text;
begin
  if not exists (select 1 from push_subscriptions) then return false; end if;
  if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null or to_regclass('vault.decrypted_secrets') is null then
    return false;
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into base using 'project_url';
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into secret using 'automation_secret';
  if base is null or secret is null then return false; end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 60000)'
    using base || '/functions/v1/notify', '{"scan": true}'::jsonb,
          jsonb_build_object('Content-Type', 'application/json', 'x-automation-secret', secret);
  return true;
end $$;

do $$
declare r text;
begin
  foreach r in array array['public', 'anon', 'authenticated'] loop
    if r = 'public' or exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke execute on function public.dispatch_notifications() from %s', r);
    end if;
  end loop;
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('painel-automations', '*/5 * * * *',
      'select public.run_due_automations(); select public.dispatch_ai_runs(); select public.dispatch_notifications();');
  end if;
end $$;
