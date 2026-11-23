-- Goal entries belong to the goal's owner.
\set ON_ERROR_STOP on
grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'c1@test'),
  ('00000000-0000-0000-0000-0000000000c2', 'c2@test') on conflict do nothing;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
insert into public.goals (id, title, unit, start_value, target_value, measure)
  values ('00000000-0000-0000-0000-00000000c0c1', 'Peso', 'kg', 92, 82, 'last');
insert into public.goal_entries (goal_id, value) values ('00000000-0000-0000-0000-00000000c0c1', 90.5);
do $$
begin
  insert into public.goals (title, measure) values ('Ruim', 'avg');
  raise exception 'an unknown measure was accepted';
exception when check_violation then null;
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c2';
do $$
begin
  if exists (select 1 from public.goal_entries) then raise exception 'entry leaked'; end if;
end $$;
do $$
begin
  insert into public.goal_entries (goal_id, value) values ('00000000-0000-0000-0000-00000000c0c1', 1);
  raise exception 'wrote an entry on a goal of another user';
exception when insufficient_privilege then null;
end $$;
reset role;
