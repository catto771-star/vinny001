-- Fictitious data for the manual's screenshots: "Rafa", 34, cutting from
-- 100 kg with an Upper/Lower plan, personal finances, a few projects. Every
-- date is relative to today, so the screens always look current. Run as the
-- database owner with __UID__ replaced by the demo user's id. Nothing here
-- is anyone's real data.
do $seed$
declare
  uid uuid := '__UID__';
  tz text := 'America/Sao_Paulo';
  d0 date := (now() at time zone 'America/Sao_Paulo')::date;
  -- ids we need later
  t_trab uuid; t_casa uuid; t_saude uuid; t_fin uuid;
  h_agua uuid; h_ler uuid; h_dormir uuid; h_academia uuid; h_meditar uuid; h_peso uuid;
  wplan uuid; s_ua uuid; s_la uuid; s_ub uuid; s_lb uuid;
  st_work uuid; st_warm uuid;
  dplan uuid; m_cafe uuid; m_alm uuid; m_lan uuid; m_jan uuid;
  b_nu uuid; b_itau uuid; c_nu uuid; ip_note uuid;
  r_aluguel uuid; r_net uuid; r_acad uuid; r_netflix uuid; r_sal uuid;
  p_home uuid; p_excel uuid; p_lisboa uuid; p_docs uuid;
  ps1 uuid; ps2 uuid; ps3 uuid; ps4 uuid; ex1 uuid; ex2 uuid; ex3 uuid;
  a_saude uuid; a_fin uuid; a_trab uuid; a_livros uuid;
  n_supl uuid; n_creat uuid; n_treino uuid; n_sono uuid; n_regra uuid; n_habitos uuid; n_curso uuid;
  g_peso uuid; g_reserva uuid; g_livros uuid; g_ler uuid; g_home uuid;
  au_resumo uuid; au_fin uuid; au_ia uuid;
  ass1 uuid; ass2 uuid;
  r record; i int; w int; dd date; wid uuid; load numeric; tid uuid; rt_creatina uuid;
begin
  -- ------------------------------------------------------------------ settings
  insert into user_settings (user_id, display_name, timezone, height_cm, sex, habits_digest_time, reminders_advance_minutes, tasks_advance_minutes)
  values (uid, 'Rafa', tz, 180, 'M', '07:30', '{15}', '{30}')
  on conflict (user_id) do update set display_name = 'Rafa', height_cm = 180, sex = 'M';

  -- ------------------------------------------------------------------ tasks
  insert into task_tags (user_id, name, color) values (uid, 'Trabalho', '#0ea5e9') returning id into t_trab;
  insert into task_tags (user_id, name, color) values (uid, 'Casa', '#22c55e') returning id into t_casa;
  insert into task_tags (user_id, name, color) values (uid, 'Saúde', '#ea580c') returning id into t_saude;
  insert into task_tags (user_id, name, color) values (uid, 'Finanças', '#a855f7') returning id into t_fin;

  insert into tasks (user_id, title, description, priority, due_date, due_all_day, tags, completed, status, completed_at) values
    (uid, 'Enviar proposta para o cliente', 'Versão final com o cronograma revisado', 'high', (d0 + time '15:00') at time zone tz, false, '{Trabalho}', false, 'pending', null),
    (uid, 'Comprar whey e creatina', null, 'low', (d0 + time '23:59') at time zone tz, true, '{Saúde}', false, 'pending', null),
    (uid, 'Responder e-mails da semana', null, 'medium', (d0 + time '11:00') at time zone tz, false, '{Trabalho}', true, 'completed', now() - interval '2 hours'),
    (uid, 'Revisar contrato do aluguel', 'Reajuste pelo IGP-M vence este mês', 'medium', (d0 - 2 + time '23:59') at time zone tz, true, '{Casa}', false, 'pending', null),
    (uid, 'Pagar IPVA (cota única)', null, 'high', (d0 + 3 + time '23:59') at time zone tz, true, '{Finanças}', false, 'pending', null),
    (uid, 'Agendar check-up anual', 'Hemograma, perfil lipídico e vitamina D', 'medium', (d0 + 5 + time '23:59') at time zone tz, true, '{Saúde}', false, 'pending', null),
    (uid, 'Preparar apresentação trimestral', null, 'high', (d0 + 7 + time '10:00') at time zone tz, false, '{Trabalho}', false, 'in_progress', null),
    (uid, 'Trocar filtro do ar-condicionado', null, 'low', (d0 + 9 + time '23:59') at time zone tz, true, '{Casa}', false, 'pending', null),
    (uid, 'Declarar imposto de renda: separar informes', null, 'medium', null, false, '{Finanças}', false, 'pending', null),
    (uid, 'Pesquisar seguro do carro', null, 'low', null, false, '{Finanças}', false, 'pending', null),
    (uid, 'Renovar a CNH', null, 'medium', (d0 - 5 + time '23:59') at time zone tz, true, '{}', true, 'completed', (d0 - 5 + time '16:20') at time zone tz),
    (uid, 'Organizar notas fiscais do mês', null, 'medium', (d0 - 1 + time '23:59') at time zone tz, true, '{Finanças}', true, 'completed', (d0 - 1 + time '20:10') at time zone tz),
    (uid, 'Levar o carro na revisão', null, 'medium', (d0 - 8 + time '09:00') at time zone tz, false, '{Casa}', true, 'completed', (d0 - 8 + time '12:00') at time zone tz),
    (uid, 'Atualizar o currículo', null, 'low', (d0 - 12 + time '23:59') at time zone tz, true, '{Trabalho}', true, 'completed', (d0 - 11 + time '21:00') at time zone tz);
  insert into task_recurring_templates (user_id, title, priority, tags, recurrence_days, time_of_day, start_date)
    values (uid, 'Revisar orçamento da semana', 'medium', '{Finanças}', '{0}', '19:00', d0 - 30);

  -- ------------------------------------------------------------------ habits
  insert into habits (user_id, name, habit_type, unit, target_value, schedule_time, color, sort_order, created_at) values
    (uid, 'Beber 3 L de água', 'quantity', 'L', 3, '08:00', '#0ea5e9', 0, now() - interval '50 days') returning id into h_agua;
  insert into habits (user_id, name, habit_type, unit, target_value, schedule_time, color, sort_order, created_at) values
    (uid, 'Meditar 10 min', 'duration', 'min', 10, '07:00', '#a855f7', 1, now() - interval '50 days') returning id into h_meditar;
  update habits set schedule_days = '{1,2,3,4,5}' where id = h_meditar;
  insert into habits (user_id, name, habit_type, unit, target_value, schedule_time, color, sort_order, created_at) values
    (uid, 'Ler 20 páginas', 'boolean', 'vezes', 1, '21:30', '#22c55e', 2, now() - interval '50 days') returning id into h_ler;
  insert into habits (user_id, name, habit_type, unit, target_value, schedule_time, color, sort_order, created_at) values
    (uid, 'Dormir antes das 23h', 'boolean', 'vezes', 1, '22:45', '#64748b', 3, now() - interval '50 days') returning id into h_dormir;
  insert into habits (user_id, name, habit_type, unit, target_value, color, sort_order, frequency, times_per_week, created_at) values
    (uid, 'Academia', 'boolean', 'vezes', 1, '#ea580c', 4, 'weekly', 4, now() - interval '50 days') returning id into h_academia;
  insert into habits (user_id, name, description, habit_type, unit, target_value, schedule_days, schedule_time, color, sort_order, created_at) values
    (uid, 'Peso em jejum', 'Toda segunda, ao acordar', 'measurable', 'kg', null, '{1}', '06:45', '#eab308', 5, now() - interval '50 days') returning id into h_peso;

  for i in 1..42 loop
    dd := d0 - i;
    -- About eight in ten days done, on a fixed pattern so the screens look the same every time.
    if (i * 7 + 3) % 10 < 8 then insert into habit_completions (user_id, habit_id, completed_date, value) values (uid, h_agua, dd, 3 + ((i % 3) * 0.25)); end if;
    if (i * 3) % 10 < 7 and extract(dow from dd) between 1 and 5 then insert into habit_completions (user_id, habit_id, completed_date, value) values (uid, h_meditar, dd, 10); end if;
    if (i * 11) % 10 < 8 then insert into habit_completions (user_id, habit_id, completed_date, value) values (uid, h_ler, dd, 1); end if;
    if (i * 13 + 1) % 10 < 6 then insert into habit_completions (user_id, habit_id, completed_date, value) values (uid, h_dormir, dd, 1); end if;
  end loop;
  -- Today so far: water on the way, meditation done.
  insert into habit_completions (user_id, habit_id, completed_date, value) values (uid, h_agua, d0, 1.5), (uid, h_meditar, d0, 10);

  -- ------------------------------------------------------------------ reminders and events
  insert into reminder_recurring_templates (user_id, title, time_of_day, recurrence_days, start_date) values (uid, 'Tomar creatina', '08:00', '{}', d0 - 40) returning id into rt_creatina;
  insert into reminders (user_id, title, datetime, priority, completed) values
    (uid, 'Ligar para a mãe', (d0 + time '19:00') at time zone tz, 'medium', false),
    (uid, 'Levar marmitas para o trabalho', (d0 + 1 + time '07:15') at time zone tz, 'low', false),
    (uid, 'Separar documentos do IPVA', (d0 + 2 + time '18:30') at time zone tz, 'high', false),
    (uid, 'Devolver livro da biblioteca', (d0 - 1 + time '12:00') at time zone tz, 'low', true);
  -- Today's occurrence of the recurring reminder, already taken: the app then does not create another.
  insert into reminders (user_id, title, datetime, priority, completed, recurring_template_id)
    values (uid, 'Tomar creatina', (d0 + time '08:00') at time zone tz, 'medium', true, rt_creatina);
  insert into events (user_id, title, start_at, end_at, all_day, location, notes) values
    (uid, 'Reunião de planejamento', (d0 + 1 + time '09:30') at time zone tz, (d0 + 1 + time '10:30') at time zone tz, false, 'Escritório, sala 3', 'Levar números do trimestre'),
    (uid, 'Consulta com a nutricionista', (d0 + 2 + time '10:00') at time zone tz, (d0 + 2 + time '11:00') at time zone tz, false, 'Clínica Vida, Pinheiros', 'Levar a avaliação corporal'),
    (uid, 'Aniversário da Ju', (d0 + 6 + time '00:00') at time zone tz, null, true, null, null),
    (uid, 'Corrida de rua 5 km', (d0 + 10 + time '07:00') at time zone tz, (d0 + 10 + time '08:30') at time zone tz, false, 'Parque Ibirapuera', 'Retirar o kit na véspera'),
    (uid, 'Jantar com amigos', (d0 - 2 + time '20:00') at time zone tz, (d0 - 2 + time '22:30') at time zone tz, false, 'Vila Madalena', null);

  -- ------------------------------------------------------------------ training
  select id into st_work from set_types where user_id is null and name = 'Working set';
  select id into st_warm from set_types where user_id is null and name = 'Aquecimento';
  insert into workout_plans (user_id, name, modality, is_active, started_at, habit_id) values (uid, 'Upper/Lower 4x', 'musculacao', true, d0 - 45, h_academia) returning id into wplan;
  insert into workout_plan_sessions (user_id, plan_id, label, modality, weekdays, order_index) values (uid, wplan, 'Upper A', 'musculacao', '{1}', 0) returning id into s_ua;
  insert into workout_plan_sessions (user_id, plan_id, label, modality, weekdays, order_index) values (uid, wplan, 'Lower A', 'musculacao', '{2}', 1) returning id into s_la;
  insert into workout_plan_sessions (user_id, plan_id, label, modality, weekdays, order_index) values (uid, wplan, 'Upper B', 'musculacao', '{4}', 2) returning id into s_ub;
  insert into workout_plan_sessions (user_id, plan_id, label, modality, weekdays, order_index) values (uid, wplan, 'Lower B', 'musculacao', '{5}', 3) returning id into s_lb;

  create temp table demo_plan (session uuid, ex_name text, sets int, reps text, base numeric, step numeric, rest int, ord int) on commit drop;
  insert into demo_plan values
    (s_ua, 'Supino reto com barra', 3, '6-10', 70, 2.5, 150, 0), (s_ua, 'Remada curvada com barra', 3, '8-12', 60, 2.5, 120, 1),
    (s_ua, 'Desenvolvimento com halteres', 3, '8-12', 22, 1, 90, 2), (s_ua, 'Puxada frontal', 3, '8-12', 55, 2.5, 90, 3), (s_ua, 'Rosca direta com barra', 3, '10-15', 30, 1, 60, 4),
    (s_la, 'Agachamento livre', 3, '6-10', 90, 2.5, 180, 0), (s_la, 'Levantamento terra romeno', 3, '8-12', 80, 2.5, 150, 1),
    (s_la, 'Leg press 45°', 3, '10-15', 200, 10, 120, 2), (s_la, 'Cadeira flexora', 3, '10-15', 45, 2.5, 90, 3), (s_la, 'Panturrilha em pé', 3, '12-15', 60, 2.5, 60, 4),
    (s_ub, 'Supino inclinado com halteres', 3, '8-12', 28, 1, 120, 0), (s_ub, 'Remada unilateral com halter', 3, '8-12', 30, 1, 90, 1),
    (s_ub, 'Elevação lateral com halteres', 3, '12-15', 10, 0.5, 60, 2), (s_ub, 'Tríceps corda', 3, '10-15', 25, 1, 60, 3), (s_ub, 'Rosca martelo', 3, '10-15', 14, 0.5, 60, 4),
    (s_lb, 'Levantamento terra', 3, '5-8', 120, 2.5, 180, 0), (s_lb, 'Agachamento búlgaro', 3, '8-12', 16, 1, 120, 1),
    (s_lb, 'Cadeira extensora', 3, '10-15', 50, 2.5, 90, 2), (s_lb, 'Elevação pélvica (hip thrust)', 3, '8-12', 90, 5, 90, 3), (s_lb, 'Abdominal na polia', 3, '12-15', 35, 2.5, 60, 4);
  insert into workout_plan_exercises (user_id, session_id, exercise_id, name, muscle_group, sets, reps, rest_s, order_index)
    select uid, p.session, e.id, e.name, e.muscle_group, p.sets, p.reps, p.rest, p.ord from demo_plan p join exercises e on e.user_id is null and e.name = p.ex_name;
  insert into exercise_settings (user_id, exercise_id, rep_min, rep_max, load_increment_kg)
    select uid, e.id, split_part(p.reps, '-', 1)::int, split_part(p.reps, '-', 2)::int, p.step from demo_plan p join exercises e on e.user_id is null and e.name = p.ex_name;

  -- Six weeks of training on the plan's days, a few skipped, loads going up.
  for i in reverse 42..0 loop
    dd := d0 - i;
    w := (42 - i) / 7;
    for r in select s.id, s.label from workout_plan_sessions s where s.plan_id = wplan and extract(dow from dd)::int = any (s.weekdays) loop
      continue when i > 0 and (i % 11) = 0;
      insert into workouts (user_id, date, title, duration_min, plan_session_id, notes) values (uid, dd, r.label, 62 + (i % 4) * 4, r.id, case when i % 9 = 0 then 'Dormi mal, treino mais pesado que o normal' end) returning id into wid;
      insert into habit_completions (user_id, habit_id, completed_date, value) values (uid, h_academia, dd, 1) on conflict do nothing;
      insert into workout_sets (user_id, workout_id, exercise_id, set_type_id, position, load_kg, reps, rest_s, effort)
        select uid, wid, e.id, st_warm, p.ord * 10, round(((p.base + p.step * w) * 0.5) / p.step) * p.step, 10, 60, 5
        from demo_plan p join exercises e on e.user_id is null and e.name = p.ex_name where p.session = r.id and p.ord < 2;
      insert into workout_sets (user_id, workout_id, exercise_id, set_type_id, position, load_kg, reps, rest_s, effort)
        select uid, wid, e.id, st_work, p.ord * 10 + n, p.base + p.step * w,
          greatest(split_part(p.reps, '-', 1)::int, split_part(p.reps, '-', 2)::int - n - (i % 3)), p.rest, 7.5 + n * 0.5
        from demo_plan p join exercises e on e.user_id is null and e.name = p.ex_name cross join generate_series(1, p.sets) n where p.session = r.id;
    end loop;
    if extract(dow from dd) = 6 then
      insert into cardio_sessions (user_id, date, cardio_type, distance_km, duration_s) values (uid, dd, 'corrida', 5 + (w % 2) * 0.5, (34 - w) * 60 + 20);
    elsif extract(dow from dd) = 3 then
      insert into cardio_sessions (user_id, date, cardio_type, distance_km, duration_s) values (uid, dd, 'caminhada', 3.6, 2700);
    end if;
  end loop;

  -- ------------------------------------------------------------------ diet
  insert into diet_plans (user_id, name, kcal_rest, kcal_training, protein_g, carbs_g, fat_g, is_active, started_at, training_target_mode)
    values (uid, 'Cutting 2.400', 2200, 2500, 180, 230, 70, true, d0 - 45, 'fixed') returning id into dplan;
  insert into diet_day_targets (plan_id, user_id, day_type, kcal, protein_g, carbs_g, fat_g) values
    (dplan, uid, 'training', 2500, 185, 260, 70), (dplan, uid, 'rest', 2200, 180, 200, 70);
  insert into diet_plan_meals (user_id, plan_id, name, time_of_day, order_index) values (uid, dplan, 'Café da manhã', '07:30', 0) returning id into m_cafe;
  insert into diet_plan_meals (user_id, plan_id, name, time_of_day, order_index) values (uid, dplan, 'Almoço', '12:30', 1) returning id into m_alm;
  insert into diet_plan_meals (user_id, plan_id, name, time_of_day, order_index) values (uid, dplan, 'Lanche', '16:30', 2) returning id into m_lan;
  insert into diet_plan_meals (user_id, plan_id, name, time_of_day, order_index) values (uid, dplan, 'Jantar', '20:00', 3) returning id into m_jan;

  create temp table demo_menu (meal text, meal_id uuid, food_like text, grams numeric) on commit drop;
  insert into demo_menu values
    ('Café da manhã', m_cafe, 'Aveia, flocos, crua', 40), ('Café da manhã', m_cafe, 'Banana, prata, crua', 100), ('Café da manhã', m_cafe, 'Ovo, de galinha, inteiro, cozido/10minutos', 100),
    ('Almoço', m_alm, 'Arroz, tipo 1, cozido', 150), ('Almoço', m_alm, 'Feijão, carioca, cozido', 100), ('Almoço', m_alm, 'Frango, peito, sem pele, grelhado', 160),
    ('Almoço', m_alm, 'Alface, crespa, crua', 40), ('Almoço', m_alm, 'Tomate, com semente, cru', 60), ('Almoço', m_alm, 'Azeite, de oliva, extra virgem', 8),
    ('Lanche', m_lan, 'Iogurte, natural, desnatado', 170), ('Lanche', m_lan, 'Maçã, Fuji, com casca, crua', 130), ('Lanche', m_lan, 'Pão, trigo, francês', 50), ('Lanche', m_lan, 'Queijo, minas, frescal', 30),
    ('Jantar', m_jan, 'Batata, doce, cozida', 200), ('Jantar', m_jan, 'Carne, bovina, patinho, sem gordura, grelhado', 150), ('Jantar', m_jan, 'Brócolis, cozido', 100);
  insert into diet_plan_items (user_id, meal_id, food_id, quantity_g)
    select uid, m.meal_id, f.id, m.grams from demo_menu m join foods f on f.user_id is null and f.name = m.food_like;

  for i in 0..20 loop
    dd := d0 - i;
    insert into food_logs (user_id, date, meal, food_id, food_name, quantity_g, kcal, protein_g, carbs_g, fat_g, fiber_g, created_at)
      select uid, dd, m.meal, f.id, f.name, q.g,
        round(f.kcal * q.g / 100, 1), round(coalesce(f.protein_g, 0) * q.g / 100, 1), round(coalesce(f.carbs_g, 0) * q.g / 100, 1),
        round(coalesce(f.fat_g, 0) * q.g / 100, 1), round(coalesce(f.fiber_g, 0) * q.g / 100, 1), (dd + time '12:00') at time zone tz
      from demo_menu m join foods f on f.user_id is null and f.name = m.food_like
      cross join lateral (select round(m.grams * (0.85 + ((i * 7 + length(m.food_like)) % 7) * 0.05) / 5) * 5 as g) q
      -- Today only breakfast and lunch are in; one lunch a week out.
      where not (i = 0 and m.meal in ('Lanche', 'Jantar')) and not (i % 7 = 4 and m.meal = 'Almoço' and m.food_like like 'Feij%');
  end loop;
  insert into food_logs (user_id, date, meal, food_name, quantity_g, kcal, protein_g, carbs_g, fat_g) values
    (uid, d0 - 2, 'Jantar', 'Pizza marguerita (2 fatias)', 260, 640, 26, 78, 24),
    (uid, d0 - 9, 'Lanche', 'Whey protein (1 dose)', 30, 120, 24, 3, 1.5);

  -- ------------------------------------------------------------------ body
  for w in 0..6 loop
    dd := d0 - 42 + w * 7 + ((8 - extract(dow from d0 - 42)::int) % 7);
    continue when dd > d0;
    insert into body_measurements (user_id, measured_at, metric, value, source) values (uid, (dd + time '06:45') at time zone tz, 'weight_kg', 100.4 - w * 0.6 + (w % 2) * 0.2, 'balança');
    insert into habit_completions (user_id, habit_id, completed_date, value) values (uid, h_peso, dd, 100.4 - w * 0.6 + (w % 2) * 0.2) on conflict do nothing;
  end loop;
  insert into body_assessments (user_id, date, notes) values (uid, d0 - 35, 'Início do cutting. Medidas tiradas pela manhã, em jejum.') returning id into ass1;
  insert into body_assessments (user_id, date, notes) values (uid, d0 - 3, 'Cintura e abdômen descendo; força mantida nos básicos.') returning id into ass2;
  insert into body_measurements (user_id, assessment_id, measured_at, metric, value, source)
    select uid, ass1, (d0 - 35 + time '08:00') at time zone tz, k, v, 'avaliação' from (values ('weight_kg', 100.2), ('body_fat_pct', 24.2), ('neck_cm', 40), ('chest_cm', 108), ('waist_cm', 96), ('abdomen_cm', 98.5), ('hip_cm', 104), ('arm_cm', 36), ('arm_left_cm', 35.5), ('thigh_cm', 61), ('thigh_left_cm', 60.5), ('calf_cm', 39)) x(k, v)
    union all
    select uid, ass2, (d0 - 3 + time '08:00') at time zone tz, k, v, 'avaliação' from (values ('weight_kg', 96.9), ('body_fat_pct', 21.8), ('neck_cm', 39.5), ('chest_cm', 106.5), ('waist_cm', 92.5), ('abdomen_cm', 94.5), ('hip_cm', 102), ('arm_cm', 36.5), ('arm_left_cm', 36), ('thigh_cm', 60), ('thigh_left_cm', 59.5), ('calf_cm', 39)) x(k, v);

  -- ------------------------------------------------------------------ finances
  insert into banks (user_id, name, initial_balance, color) values (uid, 'Nubank', 3800, '#8a05be') returning id into b_nu;
  insert into banks (user_id, name, initial_balance, color) values (uid, 'Itaú (reserva)', 18500, '#ec7000') returning id into b_itau;
  insert into cards (user_id, bank_id, name, card_type, credit_limit, closing_day, due_day) values (uid, b_nu, 'Nubank Mastercard', 'credit', 9000, 3, 10) returning id into c_nu;
  insert into transaction_recurring_templates (user_id, description, type, amount, category, payment_method, bank_id, recurrence_days, start_date) values
    (uid, 'Salário', 'income', 9500, 'Salário', 'transferencia', b_nu, '{5}', d0 - 70) returning id into r_sal;
  insert into transaction_recurring_templates (user_id, description, type, amount, category, payment_method, bank_id, recurrence_days, start_date) values
    (uid, 'Aluguel', 'expense', 2300, 'Moradia', 'pix', b_nu, '{5}', d0 - 70) returning id into r_aluguel;
  insert into transaction_recurring_templates (user_id, description, type, amount, category, payment_method, bank_id, recurrence_days, start_date) values
    (uid, 'Internet e celular', 'expense', 159.90, 'Contas', 'debito', b_nu, '{12}', d0 - 70) returning id into r_net;
  insert into transaction_recurring_templates (user_id, description, type, amount, category, payment_method, card_id, recurrence_days, start_date) values
    (uid, 'Academia', 'expense', 129.90, 'Saúde', 'credito', c_nu, '{10}', d0 - 70) returning id into r_acad;
  insert into transaction_recurring_templates (user_id, description, type, amount, category, payment_method, card_id, recurrence_days, start_date) values
    (uid, 'Streaming', 'expense', 55.90, 'Assinaturas', 'credito', c_nu, '{18}', d0 - 70) returning id into r_netflix;

  -- Two months of the fixed entries, paid on their days (those still ahead stay open).
  for w in 0..1 loop
    for r in select t.id, t.description, t.type, t.amount, t.category, t.payment_method, t.bank_id, t.card_id, t.recurrence_days[1] as day from transaction_recurring_templates t where t.user_id = uid loop
      dd := make_date(extract(year from (date_trunc('month', d0) - w * interval '1 month'))::int, extract(month from (date_trunc('month', d0) - w * interval '1 month'))::int, r.day);
      continue when dd > d0;
      insert into transactions (user_id, description, type, amount, date, category, payment_method, bank_id, card_id, recurring_template_id)
        values (uid, r.description, r.type, r.amount, dd, r.category, r.payment_method, r.bank_id, r.card_id, r.id);
    end loop;
  end loop;
  -- Everyday spending over the last eight weeks.
  for i in 1..56 loop
    dd := d0 - i + 1;
    if extract(dow from dd) = 6 then
      insert into transactions (user_id, description, type, amount, date, category, payment_method, bank_id) values (uid, 'Mercado', 'expense', 260 + (i % 5) * 37.4, dd, 'Mercado', 'debito', b_nu);
    end if;
    if i % 4 = 1 then
      insert into transactions (user_id, description, type, amount, date, category, payment_method, card_id) values (uid, case when i % 8 = 1 then 'Restaurante' else 'Almoço no trabalho' end, 'expense', case when i % 8 = 1 then 118.5 else 42 + (i % 3) * 4 end, dd, 'Alimentação', 'credito', c_nu);
    end if;
    if i % 6 = 2 then
      insert into transactions (user_id, description, type, amount, date, category, payment_method, card_id) values (uid, 'Uber', 'expense', 23.9 + (i % 4) * 6.2, dd, 'Transporte', 'credito', c_nu);
    end if;
    if i % 14 = 3 then
      insert into transactions (user_id, description, type, amount, date, category, payment_method, bank_id) values (uid, 'Gasolina', 'expense', 210, dd, 'Transporte', 'debito', b_nu);
    end if;
    if i % 19 = 5 then
      insert into transactions (user_id, description, type, amount, date, category, payment_method, card_id) values (uid, 'Farmácia', 'expense', 64.8, dd, 'Saúde', 'credito', c_nu);
    end if;
  end loop;
  insert into transactions (user_id, description, type, amount, date, category, payment_method, card_id, currency, original_amount, fx_rate) values
    (uid, 'Curso online de Excel', 'expense', 108.25, d0 - 9, 'Educação', 'credito', c_nu, 'USD', 19.99, 5.4152);
  insert into transactions (user_id, description, type, amount, date, category, payment_method, bank_id) values
    (uid, 'Freelance: planilha financeira', 'income', 1200, d0 - 14, 'Freelance', 'pix', b_nu),
    (uid, 'Conta de luz', 'expense', 187.32, d0 + 4, 'Contas', 'boleto', b_nu);
  update transactions set is_pending = true where user_id = uid and description = 'Conta de luz';
  insert into transfers (user_id, from_bank_id, to_bank_id, amount, date, description) values
    (uid, b_nu, b_itau, 1000, (date_trunc('month', d0) - interval '1 month')::date + 6, 'Reserva do mês'),
    (uid, b_nu, b_itau, 1000, date_trunc('month', d0)::date + 6, 'Reserva do mês');
  -- A notebook in 10 installments, started two months ago.
  insert into installment_purchases (user_id, card_id, description, category, total_amount, installments_count, first_installment_date, status)
    values (uid, c_nu, 'Notebook', 'Compras', 4800, 10, (date_trunc('month', d0) - interval '2 months')::date + 14, 'active') returning id into ip_note;
  insert into transactions (user_id, description, type, amount, date, category, payment_method, card_id, installment_purchase_id, installment_number)
    select uid, 'Notebook (' || n || '/10)', 'expense', 480, ((date_trunc('month', d0) - interval '2 months')::date + 14 + (n - 1) * interval '1 month')::date, 'Compras', 'credito', c_nu, ip_note, n
    from generate_series(1, 10) n;
  insert into card_invoice_payments (user_id, card_id, year, month, amount, paid_at, bank_id)
    values (uid, c_nu, extract(year from d0)::int, extract(month from d0)::int,
      (select coalesce(sum(amount), 0) from transactions where user_id = uid and card_id = c_nu and date >= (date_trunc('month', d0) - interval '1 month')::date + 3 - 31 and date < (date_trunc('month', d0) - interval '1 month')::date + 2),
      date_trunc('month', d0)::date + 9, b_nu);

  -- ------------------------------------------------------------------ projects
  insert into projects (user_id, name, description, status, priority, start_date, due_date, color) values
    (uid, 'Reforma do home office', 'Mesa nova, cadeira ergonômica, pintura e iluminação', 'active', 'high', d0 - 20, d0 + 25, '#ea580c') returning id into p_home;
  insert into project_steps (user_id, project_id, title, due_date, completed, completed_at, order_index) values
    (uid, p_home, 'Orçamentos', d0 - 12, true, (d0 - 11 + time '18:00') at time zone tz, 0) returning id into ps1;
  insert into project_steps (user_id, project_id, title, due_date, completed, order_index) values (uid, p_home, 'Comprar mesa e cadeira', d0 + 5, false, 1) returning id into ps2;
  insert into project_steps (user_id, project_id, title, due_date, completed, order_index) values (uid, p_home, 'Pintura', d0 + 15, false, 2) returning id into ps3;
  insert into project_steps (user_id, project_id, title, due_date, completed, order_index) values (uid, p_home, 'Iluminação e cabos', d0 + 22, false, 3) returning id into ps4;
  for r in select * from (values
      ('Pedir 3 orçamentos de pintura', 'high', true, ps1, -14), ('Medir a parede e a janela', 'medium', true, ps1, -16), ('Escolher a cadeira (testar na loja)', 'high', false, ps2, 2),
      ('Comprar a mesa regulável', 'high', false, ps2, 5), ('Escolher a cor da tinta', 'medium', false, ps3, 10), ('Comprar luminária e calha de cabos', 'low', false, ps4, 20)) x(title, prio, done, step, off) loop
    insert into tasks (user_id, title, priority, due_date, due_all_day, completed, status, completed_at, project_step_id, tags)
      values (uid, r.title, r.prio, (d0 + r.off + time '23:59') at time zone tz, true, r.done, case when r.done then 'completed' when r.off = 2 then 'in_progress' else 'pending' end,
        case when r.done then (d0 + r.off + time '19:00') at time zone tz end, r.step, '{Casa}') returning id into tid;
    insert into project_tasks (project_id, task_id) values (p_home, tid);
  end loop;
  insert into projects (user_id, name, description, status, priority, start_date, due_date, color) values
    (uid, 'Curso de Excel avançado', 'Tabelas dinâmicas, Power Query e dashboards', 'active', 'medium', d0 - 30, d0 + 15, '#0ea5e9') returning id into p_excel;
  insert into project_steps (user_id, project_id, title, due_date, completed, completed_at, order_index) values
    (uid, p_excel, 'Módulo 1: fórmulas', d0 - 18, true, (d0 - 19 + time '21:00') at time zone tz, 0),
    (uid, p_excel, 'Módulo 2: tabelas dinâmicas', d0 - 4, false, null, 1),
    (uid, p_excel, 'Projeto final: dashboard de gastos', d0 + 15, false, null, 2);
  for r in select * from (values ('Assistir aulas 1 a 8', true, -20), ('Exercícios do módulo 1', true, -18), ('Assistir aulas 9 a 15', false, -2), ('Montar o dashboard final', false, 12)) x(title, done, off) loop
    insert into tasks (user_id, title, priority, due_date, due_all_day, completed, status, completed_at, tags)
      values (uid, r.title, 'medium', (d0 + r.off + time '23:59') at time zone tz, true, r.done, case when r.done then 'completed' else 'pending' end, case when r.done then (d0 + r.off + time '21:00') at time zone tz end, '{Trabalho}') returning id into tid;
    insert into project_tasks (project_id, task_id) values (p_excel, tid);
  end loop;
  insert into projects (user_id, name, description, status, priority, start_date, due_date, color) values
    (uid, 'Viagem para Lisboa', 'Maio do ano que vem, 10 dias', 'planning', 'low', d0, d0 + 160, '#22c55e') returning id into p_lisboa;
  for r in select * from (values ('Pesquisar passagens', 'medium'), ('Renovar o passaporte', 'high'), ('Montar roteiro por bairros', 'low')) x(title, prio) loop
    insert into tasks (user_id, title, priority, tags) values (uid, r.title, r.prio, '{}') returning id into tid;
    insert into project_tasks (project_id, task_id) values (p_lisboa, tid);
  end loop;
  insert into projects (user_id, name, description, status, priority, start_date, due_date, color) values
    (uid, 'Organizar documentos', 'Digitalizar e arquivar tudo no Drive', 'completed', 'low', d0 - 60, d0 - 25, '#64748b') returning id into p_docs;

  -- ------------------------------------------------------------------ goals
  insert into goals (user_id, title, description, goal_type, unit, start_value, target_value, measure, start_date, target_date) values
    (uid, 'Chegar a 92 kg', 'Cutting com treino de força e dieta de 2.400 kcal', 'custom', 'kg', 100.4, 92, 'last', d0 - 42, d0 + 60) returning id into g_peso;
  insert into goal_entries (user_id, goal_id, date, value)
    select uid, g_peso, (measured_at at time zone tz)::date, value from body_measurements where user_id = uid and metric = 'weight_kg' and assessment_id is null;
  insert into goals (user_id, title, description, goal_type, target_value, start_date, target_date, linked_bank_id) values
    (uid, 'Reserva de emergência', 'Seis meses de custo de vida', 'financial', 30000, d0 - 70, d0 + 300, b_itau) returning id into g_reserva;
  insert into goals (user_id, title, goal_type, unit, target_value, measure, start_date, target_date) values
    (uid, 'Ler 12 livros no ano', 'custom', 'livros', 12, 'sum', make_date(extract(year from d0)::int, 1, 1), make_date(extract(year from d0)::int, 12, 31)) returning id into g_livros;
  insert into goal_entries (user_id, goal_id, date, value, note) values
    (uid, g_livros, d0 - 200, 3, 'Primeiro trimestre'), (uid, g_livros, d0 - 110, 3, null), (uid, g_livros, d0 - 40, 2, null), (uid, g_livros, d0 - 6, 1, 'Hábitos Atômicos');
  insert into goals (user_id, title, goal_type, target_value, start_date, target_date, linked_habit_id) values
    (uid, 'Ler 25 dias no mês', 'habit', 25, date_trunc('month', d0)::date, (date_trunc('month', d0) + interval '1 month - 1 day')::date, h_ler) returning id into g_ler;
  insert into goals (user_id, title, goal_type, target_value, start_date, target_date, linked_project_id) values
    (uid, 'Home office pronto', 'project', 100, d0 - 20, d0 + 25, p_home) returning id into g_home;

  -- ------------------------------------------------------------------ knowledge
  insert into knowledge_areas (user_id, name, emoji, color) values (uid, 'Saúde', '🩺', '#ea580c') returning id into a_saude;
  insert into knowledge_areas (user_id, name, emoji, color) values (uid, 'Finanças', '💰', '#a855f7') returning id into a_fin;
  insert into knowledge_areas (user_id, name, emoji, color) values (uid, 'Trabalho', '💼', '#0ea5e9') returning id into a_trab;
  insert into knowledge_areas (user_id, name, emoji, color) values (uid, 'Livros', '📚', '#22c55e') returning id into a_livros;

  create temp table demo_notes (key text, area uuid, title text, lines text[], tags text[], pinned bool, fav bool, importance int, days_ago int) on commit drop;
  insert into demo_notes values
    ('supl', a_saude, 'Suplementação', array['# O que eu tomo', '- Creatina: 5 g por dia, todo dia (ver [[Creatina]])', '- Whey: 1 dose depois do treino quando a proteína do dia não fecha', '- Vitamina D: só com exame (ver [[Check-up anual]])', '> Suplemento completa a dieta; não substitui comida.'], '{suplementos}', true, true, 4, 2),
    ('creat', a_saude, 'Creatina', array['Monohidratada é a mais estudada e a mais barata.', '- Não precisa de fase de saturação', '- Tomar em qualquer horário', '- Beber água normalmente; ver [[Sono]] e [[Treino Upper/Lower]]'], '{suplementos}', false, false, 3, 10),
    ('treino', a_saude, 'Treino Upper/Lower', array['## Princípios', '1. Progressão dupla: subir as repetições até o teto, depois a carga', '1. Teto de 15 repetições nas séries válidas', '1. Descanso de 2 a 3 min nos básicos', '[] Rever a ficha a cada 8 semanas', '[x] Incluir panturrilha no Lower A'], '{treino}', false, true, 5, 6),
    ('sono', a_saude, 'Sono', array['Meta: deitar antes das 23h (hábito no Painel).', '- Sem tela 30 min antes', '- Quarto escuro e fresco', '- Cafeína só até as 15h'], '{rotina}', false, false, 3, 15),
    ('regra', a_fin, 'Regra 50/30/20', array['**50%** necessidades, **30%** desejos, **20%** objetivos.', '- Necessidades: aluguel, mercado, contas', '- Objetivos: reserva de emergência primeiro', 'Ver também [[Hábitos Atômicos: resumo]] (pequenas melhorias somam).'], '{orcamento}', true, false, 4, 20),
    ('habitos', a_livros, 'Hábitos Atômicos: resumo', array['## As quatro leis', '1. Torne óbvio', '1. Torne atraente', '1. Torne fácil', '1. Torne satisfatório', '> Você não sobe ao nível das suas metas; cai ao nível dos seus sistemas.'], '{livros,habitos}', false, true, 4, 6),
    ('checkup', a_saude, 'Check-up anual', array['Pedir ao médico:', '- Hemograma completo', '- Perfil lipídico', '- Glicemia e hemoglobina glicada', '- Vitamina D e B12'], '{exames}', false, false, 2, 30),
    ('curso', a_trab, 'Excel: atalhos que mais uso', array['- `Ctrl + T`: transformar em tabela', '- `Alt + =`: soma automática', '- `Ctrl + Shift + L`: filtros', 'Projeto final do curso: dashboard de gastos.'], '{excel}', false, false, 3, 4);
  for r in select * from demo_notes loop
    insert into knowledge_blocks (user_id, area_id, title, content, content_text, tags, is_pinned, is_favorite, importance, created_at, updated_at)
    values (uid, r.area, r.title,
      (select jsonb_agg(jsonb_build_object(
        'id', 'd' || r.key || n,
        'type', case when l like '# %' or l like '## %' then 'heading' when l like '- %' then 'bulletListItem' when l like '1. %' then 'numberedListItem' when l like '[] %' or l like '[x] %' then 'checkListItem' when l like '> %' then 'quote' else 'paragraph' end,
        'props', case when l like '## %' then jsonb_build_object('level', 2) when l like '# %' then jsonb_build_object('level', 1) when l like '[x] %' then jsonb_build_object('checked', true) when l like '[] %' then jsonb_build_object('checked', false) else '{}'::jsonb end,
        'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', regexp_replace(l, '^(## |# |- |1\. |\[\] |\[x\] |> )', ''), 'styles', '{}'::jsonb)),
        'children', '[]'::jsonb) order by n) from unnest(r.lines) with ordinality u(l, n)),
      (select string_agg(regexp_replace(l, '^(## |# |- |1\. |\[\] |\[x\] |> )', ''), E'\n') from unnest(r.lines) l),
      r.tags, r.pinned, r.fav, r.importance, now() - (r.days_ago || ' days')::interval, now() - (r.days_ago || ' days')::interval);
  end loop;
  -- [[links]] become connections, as the editor would make them.
  insert into knowledge_connections (user_id, source_block_id, target_block_id, auto_generated)
    select distinct uid, s.id, t.id, true from knowledge_blocks s
      cross join lateral regexp_matches(s.content_text, '\[\[([^\]]+)\]\]', 'g') m
      join knowledge_blocks t on t.user_id = uid and t.title = m[1]
    where s.user_id = uid and s.id <> t.id;

  insert into diary_entries (user_id, date, title, content, mood)
    select uid, d0 - n, case n when 1 then 'Treino forte' when 3 then 'Dia corrido' when 7 then 'Fim de semana leve' else null end,
      (array['Treino de pernas rendeu, bati a carga do agachamento. Dormi bem.',
             'Muita reunião, pulei o lanche e cheguei com fome no jantar. Amanhã levo marmita.',
             'Corrida de 5 km no parque, ritmo melhor que na semana passada.',
             'Dia tranquilo. Li 30 páginas e meditei de manhã.',
             'Cansado, dormi tarde por causa da série. Preciso respeitar o horário.',
             'Fechei a proposta do cliente. Comemorei com um jantar fora.',
             'Organizei as finanças do mês: sobrou mais do que o previsto.'])[1 + n % 7],
      (array[4, 3, 5, 4, 2, 5, 4])[1 + n % 7]
    from generate_series(1, 20) n where n % 5 <> 2;
  insert into brain_entries (user_id, content, processed_into, created_at) values
    (uid, E'Ideia: planilha de custos da viagem para Lisboa\nseparar por passagem, hospedagem e passeios', null, now() - interval '3 hours'),
    (uid, 'Comprar presente de aniversário da Ju', null, now() - interval '1 day'),
    (uid, E'Podcast sobre sono recomendado pelo Pedro\nouvir no carro', null, now() - interval '2 days'),
    (uid, 'Trocar a senha do banco', 'tarefa', now() - interval '6 days'),
    (uid, E'Atalhos do Excel\nCtrl+T, Alt+=', 'nota', now() - interval '5 days');

  -- ------------------------------------------------------------------ autopilot and assistant
  insert into automations (user_id, title, prompt, action, weekdays, time_of_day, is_active, last_run_at) values
    (uid, 'Resumo da manhã', '', 'briefing', '{}', '07:00', true, (d0 + time '07:00') at time zone tz) returning id into au_resumo;
  insert into automations (user_id, title, prompt, action, weekdays, time_of_day, is_active, payload, last_run_at) values
    (uid, 'Revisão semanal das finanças', 'Revisar gastos da semana e a fatura do cartão', 'task', '{0}', '19:00', true, '{"priority": "medium"}', (d0 - extract(dow from d0)::int + time '19:00') at time zone tz) returning id into au_fin;
  insert into automations (user_id, title, prompt, action, weekdays, time_of_day, is_active, last_run_at) values
    (uid, 'Planejar a semana', 'Olhe minhas tarefas, metas e agenda e monte um plano para a semana.', 'ai', '{0}', '20:00', true, (d0 - extract(dow from d0)::int + time '20:00') at time zone tz) returning id into au_ia;
  insert into automation_runs (user_id, automation_id, ran_at, status, output) values
    (uid, au_resumo, (d0 + time '07:00') at time zone tz, 'ok', E'Resumo de ' || to_char(d0, 'DD/MM') || E'\nTarefas: 3 para hoje, 1 atrasada.\n• Enviar proposta para o cliente\n• Revisar contrato do aluguel\n• Comprar whey e creatina\nLembretes: 19:00 Ligar para a mãe.\nHábitos do dia: 5.'),
    (uid, au_fin, (d0 - extract(dow from d0)::int + time '19:00') at time zone tz, 'ok', 'Tarefa criada: Revisar gastos da semana e a fatura do cartão'),
    (uid, au_ia, (d0 - extract(dow from d0)::int + time '20:00') at time zone tz, 'ok',
      E'Plano da semana\n- Segunda: proposta do cliente e treino Upper A\n- Terça: reunião de planejamento; Lower A\n- Quarta: escolher a cadeira do home office\n- Quinta: consulta com a nutricionista\n- Sexta: Lower B e revisar o orçamento\nMeta de peso: 4,9 kg perdidos; no ritmo para 92 kg.');
  insert into chat_messages (user_id, content, is_user, metadata, created_at) values
    (uid, E'Plano da semana\n- **Segunda:** proposta do cliente e treino Upper A\n- **Terça:** reunião de planejamento; Lower A\n- **Quarta:** escolher a cadeira do home office\n- **Quinta:** consulta com a nutricionista\n- **Sexta:** Lower B e revisar o orçamento\n\nMeta de peso: 4,9 kg perdidos; no ritmo para 92 kg.', false,
      jsonb_build_object('kind', 'automation', 'automation_id', au_ia, 'title', 'Planejar a semana', 'model', 'deepseek/deepseek-chat-v3.1', 'actions', '[]'::jsonb), (d0 - extract(dow from d0)::int + time '20:00') at time zone tz),
    (uid, E'Resumo de ' || to_char(d0, 'DD/MM') || E'\nTarefas: 3 para hoje, 1 atrasada.\n• Enviar proposta para o cliente\n• Revisar contrato do aluguel\n• Comprar whey e creatina\nLembretes: 19:00 Ligar para a mãe.\nHábitos do dia: 5.', false,
      jsonb_build_object('kind', 'briefing', 'automation_id', au_resumo), (d0 + time '07:00') at time zone tz),
    (uid, 'O que tenho para hoje?', true, '{}', (d0 + time '08:10') at time zone tz),
    (uid, E'Hoje você tem 3 tarefas:\n- **Enviar proposta para o cliente** às 15:00 (alta)\n- **Comprar whey e creatina**\n- **Revisar contrato do aluguel** (atrasada desde anteontem)\n\nNa agenda: nada hoje; amanhã às 9:30 tem a reunião de planejamento. Lembrete às 19:00: ligar para a mãe.', false,
      jsonb_build_object('model', 'deepseek/deepseek-chat-v3.1', 'actions', '[]'::jsonb), (d0 + time '08:10:05') at time zone tz),
    (uid, 'Anote: gastei 42 reais no almoço, categoria Alimentação', true, '{}', (d0 + time '13:05') at time zone tz),
    (uid, 'Gasto registrado: Almoço, R$ 42,00 em Alimentação, hoje.', false,
      jsonb_build_object('model', 'deepseek/deepseek-chat-v3.1', 'actions', jsonb_build_array(jsonb_build_object('tool', 'registrar_transacao', 'summary', 'Gasto registrado: Almoço, R$ 42,00'))), (d0 + time '13:05:04') at time zone tz);
  insert into transactions (user_id, description, type, amount, date, category, payment_method, card_id) values (uid, 'Almoço', 'expense', 42, d0, 'Alimentação', 'credito', c_nu);
end
$seed$;
