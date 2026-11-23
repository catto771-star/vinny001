-- Subscriptions are private, the log is read-only for the owner, and the
-- dispatcher is closed to the app.
\set ON_ERROR_STOP on
grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a7', 'a7@test'),
  ('00000000-0000-0000-0000-0000000000b7', 'b7@test') on conflict do nothing;
insert into public.notification_log (user_id, key) values ('00000000-0000-0000-0000-0000000000a7', 'd:2026-11-18');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a7';
insert into public.push_subscriptions (endpoint, p256dh, auth, device) values ('https://push.example/a', 'k', 's', 'Android');
insert into public.user_settings (user_id) values ('00000000-0000-0000-0000-0000000000a7');
do $$
begin
  if (select notify_prefs ->> 'digest' from public.user_settings) <> 'true' then raise exception 'default prefs'; end if;
  if (select count(*) from public.notification_log) <> 1 then raise exception 'owner reads own log'; end if;
end $$;
do $$
begin
  insert into public.notification_log (user_id, key) values ('00000000-0000-0000-0000-0000000000a7', 'forged');
  raise exception 'the app wrote to the notification log';
exception when insufficient_privilege then null;
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b7';
do $$
begin
  if exists (select 1 from public.push_subscriptions) or exists (select 1 from public.notification_log) then raise exception 'push data leaked'; end if;
  if has_function_privilege('authenticated', 'public.dispatch_notifications()', 'execute') then raise exception 'dispatcher open to the app'; end if;
end $$;
reset role;
do $$ begin if public.dispatch_notifications() then raise exception 'dispatched without pg_net and Vault'; end if; end $$;
