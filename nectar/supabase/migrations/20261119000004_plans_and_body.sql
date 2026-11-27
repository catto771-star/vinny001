-- Workout plans built from the exercise catalog, weekday diet targets and
-- body assessments with measurements and photos.

-- ---------------------------------------------------------------------------
-- Workout plan ("ficha"): each exercise points to the catalog
-- ---------------------------------------------------------------------------
alter table public.workout_plan_exercises
  add column exercise_id uuid references public.exercises on delete restrict,
  add column rest_s int check (rest_s >= 0),
  add column notes text,
  alter column name drop not null;

-- A logged workout remembers which plan session it followed.
alter table public.workouts
  add column plan_session_id uuid references public.workout_plan_sessions on delete set null;

-- ---------------------------------------------------------------------------
-- Diet targets per weekday (0 = Sunday ... 6 = Saturday)
-- ---------------------------------------------------------------------------
create table public.diet_weekday_targets (
  plan_id uuid not null references public.diet_plans on delete cascade,
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  weekday int not null check (weekday between 0 and 6),
  kcal int not null check (kcal > 0),
  protein_g int not null check (protein_g >= 0),
  carbs_g int not null check (carbs_g >= 0),
  fat_g int not null check (fat_g >= 0),
  primary key (plan_id, weekday)
);

-- ---------------------------------------------------------------------------
-- Body assessments
-- ---------------------------------------------------------------------------
alter table public.user_settings
  add column height_cm numeric check (height_cm between 100 and 250),
  add column sex text check (sex in ('M', 'F'));

create table public.body_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  date date not null default current_date,
  notes text,
  created_at timestamptz not null default now()
);
create index body_assessments_user_date on public.body_assessments (user_id, date);

-- Measurements taken in an assessment are body_measurements rows that point to it,
-- so the weight trend keeps reading weight_kg from one place.
alter table public.body_measurements
  add column assessment_id uuid references public.body_assessments on delete cascade;

create table public.body_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  assessment_id uuid not null references public.body_assessments on delete cascade,
  pose text not null check (pose in ('front', 'side', 'back')),
  -- Path inside the body-photos bucket: '<user_id>/<file>'.
  storage_path text not null,
  created_at timestamptz not null default now(),
  unique (assessment_id, pose)
);

do $$
declare
  t text;
begin
  foreach t in array array['diet_weekday_targets', 'body_assessments', 'body_photos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t || '_owner', t);
  end loop;
end $$;

insert into storage.buckets (id, name, public) values ('body-photos', 'body-photos', false)
on conflict (id) do nothing;

create policy body_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'body-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy body_photos_write on storage.objects for insert to authenticated
  with check (bucket_id = 'body-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy body_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'body-photos' and (storage.foldername(name))[1] = auth.uid()::text);
