-- Built-in catalog rows are readable by every user and changeable by none;
-- training and diet rows stay private to their owner.
\set ON_ERROR_STOP on
grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a@test'),
  ('00000000-0000-0000-0000-0000000000b1', 'b@test')
on conflict do nothing;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';

-- The food tables are loaded and searchable without accents.
do $$
declare n int;
begin
  select count(*) into n from public.foods where source = 'TACO' and user_id is null;
  if n < 500 then raise exception 'expected the TACO table, found % foods', n; end if;
  select count(*) into n from public.foods where source = 'CoFID' and user_id is null;
  if n <> 2854 then raise exception 'expected all 2854 CoFID foods, found %', n; end if;
  select count(*) into n from public.foods where search_name like '%feijao%carioca%cozido%';
  if n < 1 then raise exception 'accent-free search did not find feijão carioca cozido'; end if;
end $$;

do $$
declare n int; ex uuid; st uuid; w uuid;
begin
  select count(*) into n from public.exercises where user_id is null;
  if n < 60 then raise exception 'expected the built-in exercise catalog, found %', n; end if;
  select count(*) into n from public.set_types where user_id is null and drives_progression;
  if n <> 1 then raise exception 'exactly one built-in set type should drive progression, found %', n; end if;

  update public.exercises set name = 'changed' where user_id is null;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'a user changed % built-in exercises', n; end if;

  insert into public.set_types (name) values ('Cluster set');
  select id into ex from public.exercises where name = 'Supino reto com barra';
  select id into st from public.set_types where name = 'Working set' and user_id is null;
  insert into public.workouts (title) values ('Peito A') returning id into w;
  insert into public.workout_sets (workout_id, exercise_id, set_type_id, load_kg, reps, effort)
    values (w, ex, st, 80, 10, 8);
  insert into public.foods (source, name, kcal) values ('custom', 'Marmita da mãe', 150);
  insert into public.food_logs (meal, food_name, quantity_g, kcal) values ('almoço', 'Marmita da mãe', 300, 450);
end $$;

-- The rep range cannot exceed 15.
do $$
declare ex uuid;
begin
  select id into ex from public.exercises where name = 'Supino reto com barra';
  insert into public.exercise_settings (exercise_id, rep_min, rep_max) values (ex, 8, 16);
  raise exception 'a rep range above 15 was accepted';
exception when check_violation then
  null;
end $$;

set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$
declare n int;
begin
  select count(*) into n from public.workout_sets;
  if n <> 0 then raise exception 'B sees % sets of A', n; end if;
  select count(*) into n from public.set_types where name = 'Cluster set';
  if n <> 0 then raise exception 'B sees the custom set type of A'; end if;
  select count(*) into n from public.foods where source = 'custom';
  if n <> 0 then raise exception 'B sees the custom food of A'; end if;
  select count(*) into n from public.food_logs;
  if n <> 0 then raise exception 'B sees the food log of A'; end if;
  select count(*) into n from public.exercises where user_id is null;
  if n < 60 then raise exception 'B cannot read the built-in exercises'; end if;
end $$;

-- Meal photos: a user writes only inside their own folder.
do $$
begin
  insert into storage.objects (bucket_id, name) values ('meal-photos', '00000000-0000-0000-0000-0000000000a1/x.jpg');
  raise exception 'B wrote into the folder of A';
exception when insufficient_privilege then
  null;
end $$;
insert into storage.objects (bucket_id, name) values ('meal-photos', '00000000-0000-0000-0000-0000000000b1/prato.jpg');

reset role;
