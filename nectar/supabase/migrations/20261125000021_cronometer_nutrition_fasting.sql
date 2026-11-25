-- Cronometer-inspired Health & Nutrition upgrade:
-- 1) Metabolic profile, hydration settings, net carbs & weight goal forecast on user_settings
-- 2) Micronutrients JSONB, household measures & supplement flag on foods and food_logs
-- 3) Day completion & diary notes on diet_day_overrides
-- 4) Favorite foods, water logs, custom recipes, custom meals, repeat items,
--    intermittent fasting sessions & macro scheduler templates.

-- ---------------------------------------------------------------------------
-- 1. Metabolic, hydration & weight-goal settings
-- ---------------------------------------------------------------------------
alter table public.user_settings
  add column if not exists birth_date date,
  add column if not exists activity_level text not null default 'lightly_active'
    check (activity_level in ('sedentary', 'lightly_active', 'moderately_active', 'very_active')),
  add column if not exists custom_bmr numeric check (custom_bmr is null or custom_bmr > 0),
  add column if not exists include_tef boolean not null default true,
  add column if not exists net_carbs_mode boolean not null default false,
  add column if not exists water_goal_ml int not null default 2500 check (water_goal_ml > 0),
  add column if not exists water_cup_ml int not null default 250 check (water_cup_ml > 0),
  add column if not exists target_weight_kg numeric check (target_weight_kg is null or (target_weight_kg between 25 and 400)),
  add column if not exists weekly_rate_kg numeric check (weekly_rate_kg is null or (weekly_rate_kg between -2.5 and 2.5));

-- ---------------------------------------------------------------------------
-- 2. Foods & Food Logs: micronutrients, household measures, timestamps, supplements
-- ---------------------------------------------------------------------------
alter table public.foods
  add column if not exists nutrients jsonb not null default '{}'::jsonb,
  add column if not exists measures jsonb not null default '[]'::jsonb,
  add column if not exists is_supplement boolean not null default false;

alter table public.food_logs
  add column if not exists nutrients jsonb not null default '{}'::jsonb,
  add column if not exists measure_label text,
  add column if not exists measure_qty numeric check (measure_qty is null or measure_qty > 0),
  add column if not exists logged_time text,
  add column if not exists is_supplement boolean not null default false,
  add column if not exists group_id uuid,
  add column if not exists group_name text;

-- ---------------------------------------------------------------------------
-- 3. Diary day completion & notes
-- ---------------------------------------------------------------------------
alter table public.diet_day_overrides
  add column if not exists completed boolean not null default false,
  add column if not exists notes text;

-- ---------------------------------------------------------------------------
-- 4. Favorite foods
-- ---------------------------------------------------------------------------
create table if not exists public.favorite_foods (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  food_id uuid not null references public.foods(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, food_id)
);

-- ---------------------------------------------------------------------------
-- 5. Dedicated hydration logs
-- ---------------------------------------------------------------------------
create table if not exists public.water_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null default current_date,
  ml int not null check (ml > 0 and ml <= 10000),
  logged_time text,
  created_at timestamptz not null default now()
);
create index if not exists water_logs_user_date_idx on public.water_logs (user_id, date);

-- ---------------------------------------------------------------------------
-- 6. Custom Recipes (serving-based or cooked-weight-based) & Custom Meals
-- ---------------------------------------------------------------------------
create table if not exists public.custom_recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  servings numeric not null default 1 check (servings > 0),
  cooked_weight_g numeric check (cooked_weight_g is null or cooked_weight_g > 0),
  notes text,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists custom_recipes_user_idx on public.custom_recipes (user_id, created_at desc);

create table if not exists public.custom_meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  default_meal text not null default 'Almoço',
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists custom_meals_user_idx on public.custom_meals (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 7. Repeat Items (scheduled recurring diary items by weekday)
-- ---------------------------------------------------------------------------
create table if not exists public.repeat_food_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  meal text not null,
  weekdays int[] not null default '{0,1,2,3,4,5,6}',
  food_id uuid references public.foods(id) on delete set null,
  food_name text not null,
  quantity_g numeric not null check (quantity_g > 0),
  measure_label text,
  measure_qty numeric,
  kcal numeric not null default 0,
  protein_g numeric not null default 0,
  carbs_g numeric not null default 0,
  fat_g numeric not null default 0,
  fiber_g numeric,
  nutrients jsonb not null default '{}'::jsonb,
  is_supplement boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists repeat_food_items_user_idx on public.repeat_food_items (user_id);

-- ---------------------------------------------------------------------------
-- 8. Intermittent Fasting Sessions
-- ---------------------------------------------------------------------------
create table if not exists public.fasting_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  protocol text not null default '16:8',
  target_hours numeric not null check (target_hours > 0 and target_hours <= 168),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists fasting_sessions_user_started_idx on public.fasting_sessions (user_id, started_at desc);

-- ---------------------------------------------------------------------------
-- 9. Named Macro Scheduler Templates
-- ---------------------------------------------------------------------------
create table if not exists public.macro_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  kcal int not null check (kcal > 0),
  protein_g int not null check (protein_g >= 0),
  carbs_g int not null check (carbs_g >= 0),
  fat_g int not null check (fat_g >= 0),
  weekdays int[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists macro_templates_user_idx on public.macro_templates (user_id);

-- ---------------------------------------------------------------------------
-- 10. Row Level Security Policies
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'favorite_foods',
    'water_logs',
    'custom_recipes',
    'custom_meals',
    'repeat_food_items',
    'fasting_sessions',
    'macro_templates'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_owner', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t || '_owner', t
    );
  end loop;
end $$;
