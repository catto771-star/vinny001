-- Google Agenda. The connection (tokens) lives in google_accounts: the app can
-- read only its status columns, never the tokens. Appointments carry the
-- Google id (external_id) and when they were last synced; deleting a synced
-- appointment here records it, so the sync deletes the Google copy too.
alter table public.events
  add column synced_at timestamptz,
  add constraint events_user_external unique (user_id, external_id);

create table public.google_accounts (
  user_id uuid primary key references auth.users on delete cascade,
  email text,
  refresh_token text not null,
  access_token text,
  access_expires_at timestamptz,
  calendar_id text not null default 'primary',
  connected_at timestamptz not null default now(),
  last_sync_at timestamptz,
  last_error text,
  last_result jsonb
);
alter table public.google_accounts enable row level security;
create policy google_accounts_owner_reads on public.google_accounts for select to authenticated using (user_id = auth.uid());

create table public.gcal_deletions (
  user_id uuid not null references auth.users on delete cascade,
  google_event_id text not null,
  deleted_at timestamptz not null default now(),
  primary key (user_id, google_event_id)
);
alter table public.gcal_deletions enable row level security;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on public.google_accounts from %s', r);
      execute format('revoke all on public.gcal_deletions from %s', r);
    end if;
  end loop;
end $$;
grant select (user_id, email, calendar_id, connected_at, last_sync_at, last_error, last_result) on public.google_accounts to authenticated;

create or replace function public.gcal_record_deletion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from google_accounts where user_id = old.user_id) then
    insert into gcal_deletions (user_id, google_event_id) values (old.user_id, old.external_id) on conflict do nothing;
  end if;
  return old;
end $$;
create trigger events_gcal_deleted after delete on public.events
  for each row when (old.external_id is not null) execute function public.gcal_record_deletion();

-- Calls the gcal function when someone is connected; same setup as the other dispatchers.
create or replace function public.dispatch_gcal()
returns boolean language plpgsql security definer set search_path = public as $$
declare base text; secret text;
begin
  if not exists (select 1 from google_accounts) then return false; end if;
  if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null or to_regclass('vault.decrypted_secrets') is null then
    return false;
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into base using 'project_url';
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into secret using 'automation_secret';
  if base is null or secret is null then return false; end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 120000)'
    using base || '/functions/v1/gcal', '{"scan": true}'::jsonb,
          jsonb_build_object('Content-Type', 'application/json', 'x-automation-secret', secret);
  return true;
end $$;

do $$
declare r text;
begin
  foreach r in array array['public', 'anon', 'authenticated'] loop
    if r = 'public' or exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke execute on function public.dispatch_gcal() from %s', r);
      execute format('revoke execute on function public.gcal_record_deletion() from %s', r);
    end if;
  end loop;
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('painel-automations', '*/5 * * * *',
      'select public.run_due_automations(); select public.dispatch_ai_runs(); select public.dispatch_notifications(); select public.dispatch_gcal();');
  end if;
end $$;
