-- Phase 4: Financial Intelligence
-- [8] Monthly category budgets with pace marker

create table if not exists public.category_budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category text not null,
  monthly_limit numeric not null check (monthly_limit > 0),
  currency text not null default 'BRL' check (currency in ('BRL', 'USD', 'EUR')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category)
);

create index if not exists idx_category_budgets_user_id
  on public.category_budgets(user_id);

alter table public.category_budgets enable row level security;

drop policy if exists "category_budgets_own" on public.category_budgets;
create policy "category_budgets_own"
  on public.category_budgets
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
