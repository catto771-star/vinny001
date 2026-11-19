-- A foreign transaction needs its original amount and rate; the rate cache is read-only for the app.
\set ON_ERROR_STOP on
grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c9', 'c9@test') on conflict do nothing;
insert into public.fx_rates (date, currency, rate, source, rate_date) values ('2026-11-13', 'USD', 5.34, 'BCE', '2026-11-13');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c9';
insert into public.transactions (description, type, amount, currency, original_amount, fx_rate) values ('Hotel', 'expense', 108.25, 'USD', 20, 5.4123);
insert into public.transactions (description, type, amount) values ('Mercado', 'expense', 50);
do $$
begin
  if (select currency from public.transactions where description = 'Mercado') <> 'BRL' then raise exception 'default currency'; end if;
  if (select count(*) from public.fx_rates) <> 1 then raise exception 'the app should read the rate cache'; end if;
end $$;
do $$
begin
  insert into public.transactions (description, type, amount, currency) values ('Sem câmbio', 'expense', 10, 'EUR');
  raise exception 'a foreign transaction without rate was accepted';
exception when check_violation then null;
end $$;
do $$
begin
  insert into public.transactions (description, type, amount, currency, original_amount, fx_rate) values ('Iene', 'expense', 10, 'JPY', 100, 0.03);
  raise exception 'an unknown currency was accepted';
exception when check_violation then null;
end $$;
do $$
begin
  insert into public.fx_rates (date, currency, rate, source, rate_date) values ('2026-11-14', 'USD', 9, 'x', '2026-11-14');
  raise exception 'the app wrote to the rate cache';
exception when insufficient_privilege then null;
end $$;
reset role;
