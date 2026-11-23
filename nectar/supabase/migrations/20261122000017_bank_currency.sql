-- An account can hold its money in a currency other than reais.
-- initial_balance is then in that currency; existing accounts stay in reais.
alter table public.banks
  add column currency text not null default 'BRL' check (currency in ('BRL', 'USD', 'EUR'));
