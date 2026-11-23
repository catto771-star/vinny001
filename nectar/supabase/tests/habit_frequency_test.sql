-- A weekly habit must say how many times a week.
\set ON_ERROR_STOP on
grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a4', 'a@test') on conflict do nothing;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a4';
insert into public.habits (name, frequency, times_per_week) values ('Academia', 'weekly', 3);
insert into public.habits (name) values ('Ler');
do $$
begin
  insert into public.habits (name, frequency) values ('Sem contagem', 'weekly');
  raise exception 'a weekly habit without times_per_week was accepted';
exception when check_violation then null;
end $$;
do $$
begin
  insert into public.habits (name, frequency, times_per_week) values ('Demais', 'weekly', 8);
  raise exception 'eight times a week was accepted';
exception when check_violation then null;
end $$;
reset role;
