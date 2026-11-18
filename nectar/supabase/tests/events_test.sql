-- Events are private and cannot end before they start.
\set ON_ERROR_STOP on
grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a3', 'a@test'),
  ('00000000-0000-0000-0000-0000000000b3', 'b@test')
on conflict do nothing;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
insert into public.events (title, start_at, end_at) values ('Dentista', '2026-11-20 14:00-03', '2026-11-20 15:00-03');
do $$
begin
  insert into public.events (title, start_at, end_at) values ('Errado', '2026-11-20 15:00-03', '2026-11-20 14:00-03');
  raise exception 'an event ending before it starts was accepted';
exception when check_violation then null;
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b3';
do $$
declare n int;
begin
  select count(*) into n from public.events;
  if n <> 0 then raise exception 'B sees events of A'; end if;
end $$;
reset role;
