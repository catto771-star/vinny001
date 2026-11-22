-- Recurring entries can repeat weekly and be agreed in a foreign currency.
-- Existing templates stay monthly, in reais.
alter table public.transaction_recurring_templates
  add column frequency text not null default 'monthly' check (frequency in ('monthly', 'weekly')),
  add column currency text not null default 'BRL' check (currency in ('BRL', 'USD', 'EUR')),
  add column original_amount numeric(14, 2),
  add column fx_rate numeric(14, 6),
  add constraint transaction_recurring_templates_foreign_has_rate
    check (currency = 'BRL' or (original_amount is not null and fx_rate is not null));
