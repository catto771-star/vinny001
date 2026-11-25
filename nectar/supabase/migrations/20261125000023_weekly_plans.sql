-- Weekly planning & planned-vs-actual confrontation storage.
-- Stores each user's premeditated weekly targets (workouts, diet, budget, habits, tasks)
-- plus their chosen weekly planning day (0 = Sunday .. 6 = Saturday).

create table if not exists public.weekly_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  week_start date not null,
  plan jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);

create index if not exists weekly_plans_user_week_idx
  on public.weekly_plans (user_id, week_start desc);

alter table public.weekly_plans enable row level security;

drop policy if exists weekly_plans_owner on public.weekly_plans;
create policy weekly_plans_owner on public.weekly_plans
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

alter table public.user_settings
  add column if not exists planning_weekday int not null default 0
    check (planning_weekday between 0 and 6);
