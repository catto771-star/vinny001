-- Training log, diet diary and the catalogs they draw on.
-- Catalog rows with user_id null are built in: every user can read them and
-- nobody can change them. Rows with a user_id belong to that user only.

-- ---------------------------------------------------------------------------
-- Training
-- ---------------------------------------------------------------------------
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade default auth.uid(),
  name text not null,
  muscle_group text not null check (muscle_group in (
    'peito', 'costas', 'ombros', 'biceps', 'triceps', 'antebraco', 'quadriceps', 'posteriores',
    'gluteos', 'panturrilhas', 'abdomen', 'corpo_inteiro')),
  secondary_muscles text[] not null default '{}',
  equipment text,
  created_at timestamptz not null default now()
);
create unique index exercises_builtin_name on public.exercises (name) where user_id is null;

-- Set types. Only types with drives_progression are used to suggest loads
-- and reps; counts_for_volume decides what enters volume and records.
create table public.set_types (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade default auth.uid(),
  name text not null,
  drives_progression boolean not null default false,
  counts_for_volume boolean not null default true,
  sort_order int not null default 100
);

-- Rep range and load step used by the progression rule, per exercise.
create table public.exercise_settings (
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  exercise_id uuid not null references public.exercises on delete cascade,
  rep_min int not null default 8 check (rep_min between 1 and 15),
  rep_max int not null default 12 check (rep_max between 1 and 15),
  load_increment_kg numeric not null default 2.5 check (load_increment_kg > 0),
  primary key (user_id, exercise_id),
  check (rep_min <= rep_max)
);

create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  date date not null default current_date,
  title text,
  duration_min int check (duration_min > 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index workouts_user_date on public.workouts (user_id, date);

create table public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  workout_id uuid not null references public.workouts on delete cascade,
  exercise_id uuid not null references public.exercises on delete restrict,
  set_type_id uuid not null references public.set_types on delete restrict,
  position int not null default 0,
  load_kg numeric not null default 0 check (load_kg >= 0),
  reps int not null check (reps >= 0),
  rest_s int check (rest_s >= 0),
  -- Effort on the RPE scale (1-10).
  effort numeric check (effort between 1 and 10),
  notes text,
  created_at timestamptz not null default now()
);
create index workout_sets_workout on public.workout_sets (workout_id, position);
create index workout_sets_exercise on public.workout_sets (user_id, exercise_id);

create table public.cardio_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  date date not null default current_date,
  cardio_type text not null,
  distance_km numeric check (distance_km >= 0),
  duration_s int not null check (duration_s > 0),
  -- Calories burned as reported by a watch or machine; estimated when null.
  kcal numeric check (kcal >= 0),
  notes text,
  created_at timestamptz not null default now()
);
create index cardio_user_date on public.cardio_sessions (user_id, date);

-- ---------------------------------------------------------------------------
-- Diet
-- ---------------------------------------------------------------------------
create table public.foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade default auth.uid(),
  -- TACO (Brazil), CoFID (UK and Ireland), OFF (Open Food Facts) or custom.
  source text not null check (source in ('TACO', 'CoFID', 'OFF', 'custom')),
  country text check (country in ('BR', 'UK', 'IE')),
  external_id text,
  name text not null,
  -- Lowercase name without accents, so 'feijao' finds 'Feijão'.
  search_name text not null default '',
  brand text,
  -- Nutrients per 100 g.
  kcal numeric not null check (kcal >= 0),
  protein_g numeric not null default 0 check (protein_g >= 0),
  carbs_g numeric not null default 0 check (carbs_g >= 0),
  fat_g numeric not null default 0 check (fat_g >= 0),
  fiber_g numeric check (fiber_g >= 0),
  default_serving_g numeric not null default 100 check (default_serving_g > 0),
  created_at timestamptz not null default now()
);
create unique index foods_builtin_source on public.foods (source, external_id) where user_id is null;
create unique index foods_user_source on public.foods (user_id, source, external_id) where user_id is not null and external_id is not null;
create extension if not exists pg_trgm;
create index foods_search_name on public.foods using gin (search_name gin_trgm_ops);

-- Targets of a diet plan for each kind of day.
create table public.diet_day_targets (
  plan_id uuid not null references public.diet_plans on delete cascade,
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  day_type text not null check (day_type in ('training', 'rest')),
  kcal int not null check (kcal > 0),
  protein_g int not null check (protein_g >= 0),
  carbs_g int not null check (carbs_g >= 0),
  fat_g int not null check (fat_g >= 0),
  primary key (plan_id, day_type)
);

-- fixed: training days use the training target as entered.
-- dynamic: training days use the rest target plus the calories the day's
-- training burned, with the extra calories going to carbohydrates.
alter table public.diet_plans
  add column training_target_mode text not null default 'fixed'
  check (training_target_mode in ('fixed', 'dynamic'));

create table public.diet_plan_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  meal_id uuid not null references public.diet_plan_meals on delete cascade,
  food_id uuid not null references public.foods on delete restrict,
  quantity_g numeric not null check (quantity_g > 0)
);

-- Manual adjustments for one date: force the day type and/or replace targets.
create table public.diet_day_overrides (
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  date date not null,
  day_type text check (day_type in ('training', 'rest')),
  kcal int check (kcal > 0),
  protein_g int check (protein_g >= 0),
  carbs_g int check (carbs_g >= 0),
  fat_g int check (fat_g >= 0),
  primary key (user_id, date)
);

-- What was eaten. Nutrients are copied at logging time so later edits to a
-- food do not rewrite history.
create table public.food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  date date not null default current_date,
  meal text not null,
  food_id uuid references public.foods on delete set null,
  food_name text not null,
  quantity_g numeric not null check (quantity_g > 0),
  kcal numeric not null check (kcal >= 0),
  protein_g numeric not null default 0,
  carbs_g numeric not null default 0,
  fat_g numeric not null default 0,
  fiber_g numeric,
  created_at timestamptz not null default now()
);
create index food_logs_user_date on public.food_logs (user_id, date);

create table public.meal_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  date date not null default current_date,
  meal text not null,
  -- Path inside the meal-photos bucket: '<user_id>/<file>'.
  storage_path text not null,
  notes text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Triggers and access rules
-- ---------------------------------------------------------------------------
create trigger workouts_touch before update on public.workouts
  for each row execute function public.touch_updated_at();

do $$
declare
  t text;
begin
  -- Catalogs: built-in rows readable by everyone, own rows fully managed.
  foreach t in array array['exercises', 'set_types', 'foods'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (user_id is null or user_id = auth.uid())', t || '_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = auth.uid())', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (user_id = auth.uid())', t || '_delete', t);
  end loop;

  foreach t in array array[
    'exercise_settings', 'workouts', 'workout_sets', 'cardio_sessions', 'diet_day_targets',
    'diet_plan_items', 'diet_day_overrides', 'food_logs', 'meal_photos'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t || '_owner', t);
  end loop;
end $$;

-- Meal photos live in a private bucket, one folder per user.
insert into storage.buckets (id, name, public) values ('meal-photos', 'meal-photos', false)
on conflict (id) do nothing;

create policy meal_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy meal_photos_write on storage.objects for insert to authenticated
  with check (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy meal_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Built-in set types and exercises
-- ---------------------------------------------------------------------------
insert into public.set_types (user_id, name, drives_progression, counts_for_volume, sort_order) values
  (null, 'Working set', true, true, 1),
  (null, 'Feeder set', false, false, 2),
  (null, 'Aquecimento', false, false, 3),
  (null, 'Top set', false, true, 4),
  (null, 'Back-off set', false, true, 5),
  (null, 'Drop set', false, true, 6);

insert into public.exercises (user_id, name, muscle_group, secondary_muscles, equipment) values
  (null, 'Supino reto com barra', 'peito', '{triceps,ombros}', 'barra'),
  (null, 'Supino reto com halteres', 'peito', '{triceps,ombros}', 'halteres'),
  (null, 'Supino inclinado com barra', 'peito', '{ombros,triceps}', 'barra'),
  (null, 'Supino inclinado com halteres', 'peito', '{ombros,triceps}', 'halteres'),
  (null, 'Supino declinado', 'peito', '{triceps}', 'barra'),
  (null, 'Supino na máquina', 'peito', '{triceps,ombros}', 'máquina'),
  (null, 'Crucifixo com halteres', 'peito', '{}', 'halteres'),
  (null, 'Crucifixo no cabo (crossover)', 'peito', '{}', 'cabo'),
  (null, 'Peck deck', 'peito', '{}', 'máquina'),
  (null, 'Flexão de braço', 'peito', '{triceps,ombros}', 'peso corporal'),
  (null, 'Paralelas (mergulho)', 'peito', '{triceps,ombros}', 'peso corporal'),
  (null, 'Barra fixa', 'costas', '{biceps}', 'peso corporal'),
  (null, 'Puxada frontal', 'costas', '{biceps}', 'cabo'),
  (null, 'Puxada com triângulo', 'costas', '{biceps}', 'cabo'),
  (null, 'Remada curvada com barra', 'costas', '{biceps,posteriores}', 'barra'),
  (null, 'Remada unilateral com halter', 'costas', '{biceps}', 'halteres'),
  (null, 'Remada baixa no cabo', 'costas', '{biceps}', 'cabo'),
  (null, 'Remada cavalinho', 'costas', '{biceps}', 'barra'),
  (null, 'Remada na máquina', 'costas', '{biceps}', 'máquina'),
  (null, 'Pulldown com braços estendidos', 'costas', '{}', 'cabo'),
  (null, 'Levantamento terra', 'costas', '{posteriores,gluteos,quadriceps}', 'barra'),
  (null, 'Desenvolvimento com barra', 'ombros', '{triceps}', 'barra'),
  (null, 'Desenvolvimento com halteres', 'ombros', '{triceps}', 'halteres'),
  (null, 'Desenvolvimento na máquina', 'ombros', '{triceps}', 'máquina'),
  (null, 'Elevação lateral com halteres', 'ombros', '{}', 'halteres'),
  (null, 'Elevação lateral no cabo', 'ombros', '{}', 'cabo'),
  (null, 'Elevação frontal', 'ombros', '{}', 'halteres'),
  (null, 'Crucifixo invertido', 'ombros', '{costas}', 'halteres'),
  (null, 'Face pull', 'ombros', '{costas}', 'cabo'),
  (null, 'Encolhimento', 'costas', '{}', 'halteres'),
  (null, 'Rosca direta com barra', 'biceps', '{antebraco}', 'barra'),
  (null, 'Rosca alternada com halteres', 'biceps', '{antebraco}', 'halteres'),
  (null, 'Rosca martelo', 'biceps', '{antebraco}', 'halteres'),
  (null, 'Rosca Scott', 'biceps', '{}', 'barra'),
  (null, 'Rosca no cabo', 'biceps', '{}', 'cabo'),
  (null, 'Rosca concentrada', 'biceps', '{}', 'halteres'),
  (null, 'Tríceps pulley', 'triceps', '{}', 'cabo'),
  (null, 'Tríceps corda', 'triceps', '{}', 'cabo'),
  (null, 'Tríceps testa', 'triceps', '{}', 'barra'),
  (null, 'Tríceps francês', 'triceps', '{}', 'halteres'),
  (null, 'Supino fechado', 'triceps', '{peito}', 'barra'),
  (null, 'Mergulho no banco', 'triceps', '{}', 'peso corporal'),
  (null, 'Rosca de punho', 'antebraco', '{}', 'barra'),
  (null, 'Agachamento livre', 'quadriceps', '{gluteos,posteriores}', 'barra'),
  (null, 'Agachamento frontal', 'quadriceps', '{gluteos}', 'barra'),
  (null, 'Agachamento hack', 'quadriceps', '{gluteos}', 'máquina'),
  (null, 'Agachamento búlgaro', 'quadriceps', '{gluteos}', 'halteres'),
  (null, 'Agachamento goblet', 'quadriceps', '{gluteos}', 'halteres'),
  (null, 'Leg press 45°', 'quadriceps', '{gluteos}', 'máquina'),
  (null, 'Cadeira extensora', 'quadriceps', '{}', 'máquina'),
  (null, 'Afundo (avanço)', 'quadriceps', '{gluteos}', 'halteres'),
  (null, 'Passada', 'quadriceps', '{gluteos}', 'halteres'),
  (null, 'Stiff', 'posteriores', '{gluteos,costas}', 'barra'),
  (null, 'Levantamento terra romeno', 'posteriores', '{gluteos}', 'barra'),
  (null, 'Mesa flexora', 'posteriores', '{}', 'máquina'),
  (null, 'Cadeira flexora', 'posteriores', '{}', 'máquina'),
  (null, 'Good morning', 'posteriores', '{gluteos,costas}', 'barra'),
  (null, 'Elevação pélvica (hip thrust)', 'gluteos', '{posteriores}', 'barra'),
  (null, 'Glúteo na polia', 'gluteos', '{}', 'cabo'),
  (null, 'Cadeira abdutora', 'gluteos', '{}', 'máquina'),
  (null, 'Panturrilha em pé', 'panturrilhas', '{}', 'máquina'),
  (null, 'Panturrilha sentado', 'panturrilhas', '{}', 'máquina'),
  (null, 'Panturrilha no leg press', 'panturrilhas', '{}', 'máquina'),
  (null, 'Abdominal supra', 'abdomen', '{}', 'peso corporal'),
  (null, 'Abdominal na polia', 'abdomen', '{}', 'cabo'),
  (null, 'Elevação de pernas', 'abdomen', '{}', 'peso corporal'),
  (null, 'Prancha', 'abdomen', '{}', 'peso corporal'),
  (null, 'Abdominal infra', 'abdomen', '{}', 'peso corporal'),
  (null, 'Kettlebell swing', 'corpo_inteiro', '{gluteos,posteriores}', 'kettlebell'),
  (null, 'Clean (arremesso)', 'corpo_inteiro', '{}', 'barra');
