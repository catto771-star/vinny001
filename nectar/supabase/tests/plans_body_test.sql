-- Workout plans, weekday targets and body assessments stay private,
-- and body photos live only in the owner's folder.
\set ON_ERROR_STOP on
grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a2', 'a@test'),
  ('00000000-0000-0000-0000-0000000000b2', 'b@test')
on conflict do nothing;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
do $$
declare p uuid; s uuid; ex uuid; dp uuid; a uuid;
begin
  insert into public.workout_plans (name) values ('Hipertrofia ABC') returning id into p;
  insert into public.workout_plan_sessions (plan_id, label, weekdays) values (p, 'Treino A', '{1,4}') returning id into s;
  select id into ex from public.exercises where name = 'Supino reto com barra';
  insert into public.workout_plan_exercises (session_id, exercise_id, sets, reps, load_kg, rest_s) values (s, ex, 4, '8-12', 80, 90);
  insert into public.workouts (title, plan_session_id) values ('Treino A', s);
  insert into public.diet_plans (name, is_active) values ('Plano', true) returning id into dp;
  insert into public.diet_weekday_targets (plan_id, weekday, kcal, protein_g, carbs_g, fat_g) values (dp, 6, 2600, 180, 300, 80);
  insert into public.body_assessments (notes) values ('primeira') returning id into a;
  insert into public.body_measurements (assessment_id, metric, value) values (a, 'waist_cm', 98.5);
  insert into public.body_photos (assessment_id, pose, storage_path) values (a, 'front', '00000000-0000-0000-0000-0000000000a2/f.jpg');
end $$;

-- A weekday outside 0-6 is refused.
do $$
declare dp uuid;
begin
  select id into dp from public.diet_plans limit 1;
  insert into public.diet_weekday_targets (plan_id, weekday, kcal, protein_g, carbs_g, fat_g) values (dp, 7, 2000, 1, 1, 1);
  raise exception 'weekday 7 was accepted';
exception when check_violation then null;
end $$;

set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$
declare n int;
begin
  select count(*) into n from public.workout_plan_exercises; if n <> 0 then raise exception 'B sees plan exercises of A'; end if;
  select count(*) into n from public.diet_weekday_targets; if n <> 0 then raise exception 'B sees weekday targets of A'; end if;
  select count(*) into n from public.body_assessments; if n <> 0 then raise exception 'B sees assessments of A'; end if;
  select count(*) into n from public.body_photos; if n <> 0 then raise exception 'B sees body photos of A'; end if;
end $$;
do $$
begin
  insert into storage.objects (bucket_id, name) values ('body-photos', '00000000-0000-0000-0000-0000000000a2/x.jpg');
  raise exception 'B wrote a body photo into the folder of A';
exception when insufficient_privilege then null;
end $$;
reset role;

-- Deleting an assessment removes its measurements and photos.
do $$
declare n int;
begin
  delete from public.body_assessments;
  select count(*) into n from public.body_measurements where assessment_id is not null;
  if n <> 0 then raise exception 'assessment measurements were left behind'; end if;
  select count(*) into n from public.body_photos;
  if n <> 0 then raise exception 'assessment photos were left behind'; end if;
end $$;
