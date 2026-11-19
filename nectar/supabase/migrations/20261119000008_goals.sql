-- Goals measure a value from a start toward a target. A custom goal adds up its
-- entries ('sum', e.g. km run) or takes the latest one ('last', e.g. weight);
-- a financial goal can follow an account's balance instead.
alter table public.goals
  add column description text,
  add column unit text not null default '',
  add column start_value numeric not null default 0,
  add column measure text not null default 'sum' check (measure in ('sum', 'last')),
  add column linked_bank_id uuid references public.banks on delete set null;

create table public.goal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  goal_id uuid not null references public.goals on delete cascade,
  date date not null default current_date,
  value numeric not null,
  note text,
  created_at timestamptz not null default now()
);
create index goal_entries_goal on public.goal_entries (goal_id, date);

alter table public.goal_entries enable row level security;
create policy goal_entries_owner on public.goal_entries for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.goals g where g.id = goal_id and g.user_id = auth.uid()));
