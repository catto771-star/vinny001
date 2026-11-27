-- Checks that each user sees and changes only their own rows.
-- Run against a database where the migrations were applied (see README).
\set ON_ERROR_STOP on
grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test')
on conflict do nothing;

set role authenticated;

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into public.tasks (title) values ('task of A');
insert into public.habits (name) values ('habit of A');
insert into public.banks (name, initial_balance) values ('bank of A', 100);

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
insert into public.tasks (title) values ('task of B');

do $$
declare n int;
begin
  select count(*) into n from public.tasks;
  if n <> 1 then raise exception 'B sees % tasks, expected 1', n; end if;
  select count(*) into n from public.habits;
  if n <> 0 then raise exception 'B sees % habits of A', n; end if;
  update public.banks set initial_balance = 0;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'B changed % banks of A', n; end if;
end $$;

-- B may not write a row that names A as its owner.
do $$
begin
  insert into public.tasks (user_id, title) values ('00000000-0000-0000-0000-00000000000a', 'forged');
  raise exception 'forged insert was accepted';
exception when insufficient_privilege then
  null;
end $$;

-- A habit cannot be completed twice on the same day.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$
declare h uuid;
begin
  select id into h from public.habits limit 1;
  insert into public.habit_completions (habit_id, completed_date) values (h, current_date);
  begin
    insert into public.habit_completions (habit_id, completed_date) values (h, current_date);
    raise exception 'duplicate completion was accepted';
  exception when unique_violation then
    null;
  end;
end $$;

reset role;
select 'rls tests passed';
