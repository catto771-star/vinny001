-- Tokens never reach the app; deleting a synced appointment is recorded.
\set ON_ERROR_STOP on
grant usage on schema public to authenticated;
-- Earlier test files grant every table to authenticated; put back what the migration leaves.
revoke all on public.google_accounts, public.gcal_deletions from authenticated;
grant select (user_id, email, calendar_id, connected_at, last_sync_at, last_error, last_result) on public.google_accounts to authenticated;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000d9', 'd9@test') on conflict do nothing;
insert into public.google_accounts (user_id, email, refresh_token, access_token) values ('00000000-0000-0000-0000-0000000000d9', 'eu@gmail.com', 'segredo-rt', 'segredo-at');
grant all on public.events to authenticated;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d9';
do $$
begin
  if (select email from public.google_accounts) <> 'eu@gmail.com' then raise exception 'status should be readable'; end if;
end $$;
do $$
begin
  perform refresh_token from public.google_accounts;
  raise exception 'the refresh token was readable';
exception when insufficient_privilege then null;
end $$;
do $$
begin
  update public.google_accounts set email = 'x';
  raise exception 'the app changed the connection';
exception when insufficient_privilege then null;
end $$;
insert into public.events (title, start_at, external_id, source) values ('Do Google', now(), 'g-1', 'google'), ('Local', now(), null, 'manual'), ('Local 2', now(), null, 'manual');
do $$
begin
  insert into public.events (title, start_at, external_id) values ('Duplicado', now(), 'g-1');
  raise exception 'two copies of one Google event';
exception when unique_violation then null;
end $$;
delete from public.events where external_id = 'g-1';
delete from public.events where title = 'Local';
reset role;
do $$
begin
  if (select array_agg(google_event_id) from gcal_deletions) <> array['g-1'] then raise exception 'deletion not recorded: %', (select array_agg(google_event_id) from gcal_deletions); end if;
  if public.dispatch_gcal() then raise exception 'dispatched without pg_net and Vault'; end if;
  if has_function_privilege('authenticated', 'public.dispatch_gcal()', 'execute') then raise exception 'dispatcher open to the app'; end if;
end $$;
