-- Transactions in dollars or euros: amount stays in reais (every total keeps
-- working); currency, original_amount and fx_rate (reais per unit) record
-- what was spent and at which rate. A past day's rates are cached.
alter table public.transactions
  add column currency text not null default 'BRL' check (currency in ('BRL', 'USD', 'EUR')),
  add column original_amount numeric(14, 2),
  add column fx_rate numeric(14, 6) check (fx_rate > 0),
  add constraint transactions_foreign_has_rate check (currency = 'BRL' or (original_amount is not null and fx_rate is not null));

alter table public.user_settings
  add column display_currency text not null default 'BRL' check (display_currency in ('BRL', 'USD', 'EUR'));

create table public.fx_rates (
  date date not null,
  currency text not null check (currency in ('USD', 'EUR')),
  rate numeric(14, 6) not null check (rate > 0),
  source text not null,
  rate_date date not null,
  primary key (date, currency)
);
alter table public.fx_rates enable row level security;
create policy fx_rates_read on public.fx_rates for select to authenticated using (true);
