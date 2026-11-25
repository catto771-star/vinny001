-- Hevy-inspired workout capabilities, routine folders, supersets, pinned exercise notes,
-- multi-modality calorie burn overrides, and extended rep ranges (up to 30 reps).

-- 1. Built-in 'Falha' (Failure) set type to complement Working set, Aquecimento, and Drop set
insert into public.set_types (user_id, name, drives_progression, counts_for_volume, sort_order)
select null, 'Falha', true, true, 7
where not exists (
  select 1 from public.set_types where user_id is null and lower(name) = 'falha'
);

-- 2. Extend exercise_settings: allow rep ranges up to 50 (Hevy 1RM covers 1..30) and add pinned_note
alter table public.exercise_settings
  drop constraint if exists exercise_settings_rep_min_check,
  drop constraint if exists exercise_settings_rep_max_check;

alter table public.exercise_settings
  add constraint exercise_settings_rep_min_check check (rep_min between 1 and 50),
  add constraint exercise_settings_rep_max_check check (rep_max between 1 and 50),
  add column if not exists pinned_note text;

-- 3. Routine folders (Hevy /routines -> folders)
create table if not exists public.workout_routine_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists workout_routine_folders_user_idx
  on public.workout_routine_folders (user_id, sort_order);

alter table public.workout_routine_folders enable row level security;

drop policy if exists workout_routine_folders_owner on public.workout_routine_folders;
create policy workout_routine_folders_owner on public.workout_routine_folders
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 4. Link plan sessions (routines) to folders and support supersets in plan exercises
alter table public.workout_plan_sessions
  add column if not exists folder_id uuid references public.workout_routine_folders on delete set null;

alter table public.workout_plan_exercises
  add column if not exists superset_group text;

-- 5. Extend workouts for multi-modality calorie burn and live start timestamp
alter table public.workouts
  add column if not exists session_type text not null default 'musculacao'
    check (session_type in ('musculacao', 'calistenia', 'funcional', 'mobilidade', 'esporte', 'outro')),
  add column if not exists kcal numeric check (kcal >= 0),
  add column if not exists started_at timestamptz;

-- 6. Extend workout_sets for live completion checkbox, supersets, distance, and duration
alter table public.workout_sets
  add column if not exists completed boolean not null default true,
  add column if not exists superset_group text,
  add column if not exists distance_m numeric check (distance_m >= 0),
  add column if not exists duration_s int check (duration_s >= 0);
