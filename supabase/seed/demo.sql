-- =============================================================================
-- DS Lodge — dados de demonstração (fictícios)
--
-- Cria ~30 dias de operação nos dois Lodges para testar a plataforma: equipe,
-- residentes, checks, Seen, ausências, No Shows, Handover, rondas, Daily Tasks,
-- manutenção, warnings, geladeira, entregas, Dinner, Laundry, compras,
-- distribuição, Rota, horas e férias.
--
-- Tudo é identificável:
--   * residentes: residents.is_demo = true;
--   * equipe: e-mails em @demo.ds-lodge.test;
--   * o resto: registros feitos por essa equipe ou ligados a esses residentes;
--   * notificações: payload.demo = true.
--
-- Uso (como postgres):  select demo.seed();   -- recusa se já houver demo
--                       select demo.clear();  -- remove tudo, inclusive a auditoria do seed
--
-- As RPCs da plataforma usam o relógio do servidor, então o histórico é inserido
-- direto nas tabelas, no mesmo formato que as RPCs gravam. tests/db/demo.test.ts
-- confere a consistência (checks lançados, ninguém sem evidência fora dos No Shows,
-- relatório = lista de origem) e que demo.clear() devolve o banco ao estado anterior.
-- =============================================================================

create schema if not exists demo;
revoke all on schema demo from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then execute 'revoke all on schema demo from anon, authenticated'; end if;
end $$;

create table if not exists demo.runs (
  seeded_at timestamptz primary key,
  first_day date not null,
  last_day date not null
);

-- Quem estava no posto num Lodge num instante (Office do Lodge; senão o Float; senão o Manager).
create or replace function demo.on_duty(p_lodge uuid, p_at timestamptz)
returns uuid language sql stable set search_path = public as $$
  select coalesce(
    (select staff_id from public.duty_posts where function = 'office' and lodge_id = p_lodge
       and started_at <= p_at and coalesce(ended_at, 'infinity') > p_at order by started_at desc limit 1),
    (select staff_id from public.duty_posts where function = 'float'
       and started_at <= p_at and coalesce(ended_at, 'infinity') > p_at order by started_at desc limit 1),
    (select id from public.staff where email = 'siobhan.murphy@demo.ds-lodge.test'))
$$;

create or replace function demo.minutes(p_min integer, p_max integer)
returns interval language sql volatile as $$
  select make_interval(mins => p_min + floor(random() * (p_max - p_min + 1))::int)
$$;

-- Lista de ids da equipe demo (para limpeza e checagens).
create or replace function demo.staff_ids()
returns uuid[] language sql stable set search_path = public as $$
  select coalesce(array_agg(id), '{}') from public.staff where email like '%@demo.ds-lodge.test'
$$;

-- Turnos sem cobertura mínima (mesma regra de coverage_gaps, sem exigir sessão de gestão).
create or replace function demo.gap_count(p_from date, p_to date)
returns integer language sql stable set search_path = public as $$
  select count(*)::int from (
    select l.id lodge_id, w.kind, w.s, w.e
    from generate_series(p_from, p_to, interval '1 day') g(d)
    cross join public.lodges l
    cross join lateral (values ('day', public.slot_instant(g.d::date, '07:00'), public.slot_instant(g.d::date, '19:00')),
                               ('night', public.slot_instant(g.d::date, '19:00'), public.slot_instant(g.d::date + 1, '07:00'))) w(kind, s, e)
    where l.active
    union all
    select null, 'float', public.slot_instant(g.d::date, '12:00'), ((g.d::date + 1) + time '00:00') at time zone 'Europe/Dublin'
    from generate_series(p_from, p_to, interval '1 day') g(d)
  ) w
  where not exists (select 1 from public.rota_shifts r where r.status <> 'cancelled' and tstzrange(r.starts_at, r.ends_at) && tstzrange(w.s, w.e)
                    and ((w.kind = 'float' and r.function = 'float') or (w.kind <> 'float' and r.function = 'office' and r.lodge_id = w.lodge_id)))
$$;

create or replace function demo.seed(p_now timestamptz default now())
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_fridge record;
  v_today date := public.operational_day(p_now);
  v_first date := public.operational_day(p_now) - 30;
  v_last_rota date := public.operational_day(p_now) + 20;
  v_amiens uuid;
  v_connolly uuid;
  v_mgr uuid;
  v_owner uuid;
  v_ana uuid;
  v_joanna uuid;
  v_p uuid[];
  v_d date;
  v_i integer;
  v_s integer;
  v_k integer;
  v_lodge uuid;
  v_code text;
  v_slot text;
  v_at timestamptz;
  v_at2 timestamptz;
  v_st timestamptz;
  v_en timestamptz;
  v_staff uuid;
  v_id uuid;
  v_id2 uuid;
  v_entry uuid;
  v_run uuid;
  v_rec record;
  v_rec2 record;
  v_res uuid;
  v_txt text;
  v_temp numeric;
  v_out boolean;
  v_names text[];
  v_first_names text[] := array['Seán','Aoife','Darragh','Chiamaka','Mateus','Oksana','Piotr','Fatima','Conor','Larisa','Emeka','Bruna',
    'Kacper','Yusuf','Siobhra','Andrei','Thiago','Agnieszka','Liam','Amina','Dmytro','Gabriela','Cathal','Ioana','Tunde','Rafaela',
    'Paweł','Omar','Róisín','Bogdan','Igor','Leticia','Ciara','Abdul','Natalia','Eoin','Juliana','Viktor','Nkechi','Kieran',
    'Mariana','Stefan','Hassan','Orla','Wojciech','Beatriz','Ahmed','Niall','Iryna','Felipe'];
  v_last_names text[] := array['Brennan','Okafor','Silva','Kowalczyk','Popescu','Shevchenko','Doherty','Haddad','Lynch','Santos',
    'Mazur','Adeyemi','Costello','Ionescu','Pereira','Kavanagh','Bondarenko','Nolan','Rahman','Oliveira','Zielinski','Fitzgerald',
    'Moldovan','Eze','Carvalho','Quinn','Kozak','Barbosa','Walsh','Nowicki','Mensah','Rocha','Hennessy','Lewandowski','Azizi',
    'Gallagher','Moraes','Tkachenko','Sheridan','Balogun'];
  v_notes text[] := array[
    'Quiet shift, no incidents.',
    'Fire alarm panel checked at reception — all OK.',
    'Resident asked for an extra blanket — provided.',
    'Kitchen left clean after dinner.',
    'Visitor at the door asking for a resident after 22:00 — not allowed in, informed politely.',
    'Noise complaint from the first floor — spoke to residents, resolved.',
    'Resident reported a lost key card — new card issued.',
    'Back door found open during the round — closed and checked.',
    'Laundry room cleaned and lint filters emptied.',
    'Smoking area bin emptied — cigarette still lit, extinguished, no damage.',
    'Hot water back to normal after the reset of the boiler.',
    'Post collected and left at reception for residents.',
    'Taxi called for a resident going to a medical appointment.',
    'Resident asked about bus routes to the city centre — map given.',
    'Recycling bins taken out for collection.'];
  v_mention_notes text[] := array[
    'Resident felt unwell — ambulance called, taken to the Mater Hospital.',
    'Resident returned late (01:40) — let in and noted.',
    'Resident asked to speak with the Manager about a room change.',
    'Resident reported a broken chair in the room — moved to storage.',
    'Resident received a parcel — kept at reception and handed over.',
    'Resident seemed upset after a phone call — offered support, calm now.'];
  v_places text[] := array['Reception', 'Kitchen', 'Garden', 'Corridor', 'Smoking area', 'Laundry room', 'Front door'];
  v_suppliers text[] := array['Musgrave', 'Pallas Foods', 'Brakes Ireland'];
  v_foods text[] := array['Chicken breast', 'Minced beef', 'Salmon fillets', 'Vegetable mix', 'Pork sausages', 'Chicken curry (ready meal)', 'Lasagne trays'];
  v_late text[] := array['other_occurrence', 'system_failure', 'forgot', 'info_received_later'];
  v_counts jsonb;
begin
  if exists (select 1 from public.residents where is_demo) or exists (select 1 from public.staff where email like '%@demo.ds-lodge.test') then
    raise exception 'demo_already_seeded' using hint = 'select demo.clear(); antes de semear de novo';
  end if;
  perform setseed(0.2026);
  insert into demo.runs (seeded_at, first_day, last_day) values (now(), v_first, v_today);

  select id into v_amiens from public.lodges where code = 'AMIENS';
  select id into v_connolly from public.lodges where code = 'CONNOLLY';

  -- Daily Tasks valem para o histórico (os modelos foram criados "agora" para não gerar atraso numa instalação nova).
  update public.task_templates set created_at = (v_first - 60)::timestamptz where created_at > (v_first - 60)::timestamptz;

  -- ---------------------------------------------------------------------------
  -- Equipe
  -- ---------------------------------------------------------------------------
  insert into public.staff (full_name, display_name, role, email, locale, home_lodge_id, must_change_password, created_at, user_id)
  select v.full_name, v.display_name, v.role::public.staff_role, v.email, v.locale::public.app_locale,
         case when v.role = 'station' then case v.lodge when 'A' then v_amiens when 'C' then v_connolly end end, false, (v_first - 90)::timestamptz,
         case when v.role <> 'cleaner' then (select u.id from auth.users u where lower(u.email) = v.email) end
  from (values
    ('Pedro Almeida', 'Pedro', 'porter', 'pedro.almeida@demo.ds-lodge.test', 'pt-PT', 'A'),
    ('Aoife Kelly', null, 'porter', 'aoife.kelly@demo.ds-lodge.test', 'en-IE', 'A'),
    ('Tomasz Nowak', 'Tomek', 'porter', 'tomasz.nowak@demo.ds-lodge.test', 'pl-PL', 'A'),
    ('Lucas Ferreira', null, 'porter', 'lucas.ferreira@demo.ds-lodge.test', 'pt-PT', 'C'),
    ('Ciarán Byrne', null, 'porter', 'ciaran.byrne@demo.ds-lodge.test', 'en-IE', 'C'),
    ('Marta Wiśniewska', 'Marta', 'porter', 'marta.wisniewska@demo.ds-lodge.test', 'pl-PL', 'C'),
    ('Rafael Souza', 'Rafa', 'porter', 'rafael.souza@demo.ds-lodge.test', 'pt-PT', null),
    ('Niamh Doyle', null, 'porter', 'niamh.doyle@demo.ds-lodge.test', 'en-IE', null),
    ('Siobhán Murphy', null, 'manager', 'siobhan.murphy@demo.ds-lodge.test', 'en-IE', 'A'),
    ('Declan O''Brien', null, 'owner', 'declan.obrien@demo.ds-lodge.test', 'en-IE', null),
    ('Ana Costa', null, 'cleaner', 'ana.costa@demo.ds-lodge.test', 'pt-PT', 'A'),
    ('Joanna Zielińska', null, 'cleaner', 'joanna.zielinska@demo.ds-lodge.test', 'pl-PL', 'C'),
    ('Amiens Reception', null, 'station', 'amiens.reception@demo.ds-lodge.test', 'en-IE', 'A'),
    ('Connolly Reception', null, 'station', 'connolly.reception@demo.ds-lodge.test', 'en-IE', 'C')
  ) v(full_name, display_name, role, email, locale, lodge);

  select array_agg(id order by ord) into v_p from (
    select s.id, array_position(array['pedro.almeida','aoife.kelly','tomasz.nowak','lucas.ferreira','ciaran.byrne','marta.wisniewska','rafael.souza','niamh.doyle'],
                                split_part(s.email, '@', 1)) ord
    from public.staff s where s.role = 'porter' and s.email like '%@demo.ds-lodge.test') x;
  select id into v_mgr from public.staff where email = 'siobhan.murphy@demo.ds-lodge.test';
  select id into v_owner from public.staff where email = 'declan.obrien@demo.ds-lodge.test';
  select id into v_ana from public.staff where email = 'ana.costa@demo.ds-lodge.test';
  select id into v_joanna from public.staff where email = 'joanna.zielinska@demo.ds-lodge.test';

  -- ---------------------------------------------------------------------------
  -- Rota: 5 postos por dia (Office Day/Night em cada Lodge + Float), cleaners e Manager.
  -- Buracos de propósito: Float aos domingos e uma noite de Connolly na semana que vem.
  -- ---------------------------------------------------------------------------
  for v_d in select generate_series(v_first, v_last_rota, interval '1 day')::date loop
    v_i := v_d - v_first;
    for v_s in 0..4 loop
      continue when v_s = 4 and public.iso_weekday(v_d) = 7;
      continue when v_s = 3 and v_d = v_today + 9;
      v_staff := v_p[((v_i * 5 + v_s) % 8) + 1];
      v_st := public.slot_instant(v_d, case v_s when 1 then '19:00' when 3 then '19:00' when 4 then '12:00' else '07:00' end);
      v_en := case when v_s = 4 then ((v_d + 1) + time '00:00') at time zone 'Europe/Dublin'
                   when v_s in (1, 3) then public.slot_instant(v_d + 1, '07:00')
                   else public.slot_instant(v_d, '19:00') end;
      insert into public.rota_shifts (staff_id, lodge_id, function, starts_at, ends_at, status, published_at, created_by, created_at)
      values (v_staff, case when v_s in (0, 1) then v_amiens when v_s in (2, 3) then v_connolly end,
              case when v_s = 4 then 'float' else 'office' end, v_st, v_en,
              case when v_d <= v_today + 13 then 'published' else 'draft' end,
              case when v_d <= v_today + 13 then least(v_st - interval '10 days', p_now - interval '3 days') end,
              v_mgr, least(v_st - interval '14 days', p_now - interval '4 days'));
    end loop;
    if public.iso_weekday(v_d) <= 5 then
      -- Ana Costa de férias (passadas): o cleaner de Amiens fica sem escala nesses dias.
      if v_d not between v_today - 17 and v_today - 13 then
        insert into public.rota_shifts (staff_id, lodge_id, function, starts_at, ends_at, status, published_at, created_by, created_at)
        values (v_ana, v_amiens, 'cleaner', public.slot_instant(v_d, '09:00'), public.slot_instant(v_d, '13:00'),
                case when v_d <= v_today + 13 then 'published' else 'draft' end,
                case when v_d <= v_today + 13 then least(public.slot_instant(v_d, '09:00') - interval '10 days', p_now - interval '3 days') end,
                v_mgr, least(public.slot_instant(v_d, '09:00') - interval '14 days', p_now - interval '4 days'));
      end if;
      insert into public.rota_shifts (staff_id, lodge_id, function, starts_at, ends_at, status, published_at, created_by, created_at)
      values (v_joanna, v_connolly, 'cleaner', public.slot_instant(v_d, '09:00'), public.slot_instant(v_d, '13:00'),
              case when v_d <= v_today + 13 then 'published' else 'draft' end,
              case when v_d <= v_today + 13 then least(public.slot_instant(v_d, '09:00') - interval '10 days', p_now - interval '3 days') end,
              v_mgr, least(public.slot_instant(v_d, '09:00') - interval '14 days', p_now - interval '4 days')),
             (v_mgr, case when public.iso_weekday(v_d) in (2, 4) then v_connolly else v_amiens end, 'manager',
              public.slot_instant(v_d, '09:00'), public.slot_instant(v_d, '17:00'),
              case when v_d <= v_today + 13 then 'published' else 'draft' end,
              case when v_d <= v_today + 13 then least(public.slot_instant(v_d, '09:00') - interval '10 days', p_now - interval '3 days') end,
              v_mgr, least(public.slot_instant(v_d, '09:00') - interval '14 days', p_now - interval '4 days'));
    end if;
  end loop;
  -- Beta: o Roster publicado guarda o horário previsto (horas previstas × trabalhadas).
  update public.rota_shifts set planned_starts_at = starts_at, planned_ends_at = ends_at
   where created_by = v_mgr and status = 'published' and planned_starts_at is null;
  insert into public.notifications (kind, audience, payload, created_at)
  values ('coverage_below_minimum', 'management',
          jsonb_build_object('demo', true, 'gaps', demo.gap_count(v_today + 1, v_today + 13),
                             'from', public.operational_day_start(v_today + 1), 'to', public.operational_day_start(v_today + 14)),
          p_now - interval '3 days');

  -- ---------------------------------------------------------------------------
  -- Assumir Posto (horas efetivas) a partir da Rota publicada, com atrasos pequenos,
  -- uma substituição por doença, um posto ajustado pelo Manager e os postos abertos agora.
  -- ---------------------------------------------------------------------------
  for v_rec in
    select r.*, public.operational_day(r.starts_at) d from public.rota_shifts r
    where r.created_by = v_mgr and r.function in ('office', 'float') and r.starts_at <= p_now
    order by r.starts_at
  loop
    v_staff := v_rec.staff_id;
    if v_rec.d = v_today - 6 and v_rec.lodge_id = v_connolly and v_rec.starts_at = public.slot_instant(v_rec.d, '19:00') then
      v_staff := v_p[(((v_rec.d - v_first) * 5 + 6) % 8) + 1];  -- cobriu quem estava de folga
    end if;
    v_st := v_rec.starts_at + demo.minutes(-12, 9);
    v_en := case when v_rec.ends_at > p_now then null else v_rec.ends_at + demo.minutes(0, 14) end;
    insert into public.duty_posts (staff_id, function, lodge_id, started_at, ended_at, ended_by, end_reason, adjust_reason, adjusted_by)
    values (v_staff, v_rec.function::public.duty_function, v_rec.lodge_id,
            case when v_rec.d = v_today - 3 and v_rec.lodge_id = v_amiens and v_rec.function = 'office' and v_rec.starts_at = public.slot_instant(v_rec.d, '07:00')
                 then v_rec.starts_at + interval '2 minutes' else v_st end,
            v_en, case when v_en is not null then v_staff end, case when v_en is not null then 'taken_over' end,
            case when v_rec.d = v_today - 3 and v_rec.lodge_id = v_amiens and v_rec.function = 'office' and v_rec.starts_at = public.slot_instant(v_rec.d, '07:00')
                 then 'Forgot to take post until 09:30 — start confirmed by the Manager' end,
            case when v_rec.d = v_today - 3 and v_rec.lodge_id = v_amiens and v_rec.function = 'office' and v_rec.starts_at = public.slot_instant(v_rec.d, '07:00')
                 then v_mgr end);
  end loop;
  -- Quem assume o posto encerra o anterior no mesmo instante (taken_over): nunca há dois no mesmo posto.
  update public.duty_posts p set ended_at = x.next_start
  from (select id, lead(started_at) over (partition by function, lodge_id order by started_at) next_start
        from public.duty_posts where staff_id = any (v_p)) x
  where p.id = x.id and x.next_start is not null and (p.ended_at is null or p.ended_at > x.next_start);
  -- Manager e cleaners: horas lançadas pela gestão.
  insert into public.work_intervals (staff_id, lodge_id, starts_at, ends_at, note, created_by, created_at)
  select r.staff_id, r.lodge_id, r.starts_at + demo.minutes(-5, 10), r.ends_at + demo.minutes(-5, 25),
         case when r.function = 'cleaner' then 'Cleaning shift' end, v_mgr, r.ends_at + interval '1 day'
  from public.rota_shifts r
  where r.created_by = v_mgr and r.function in ('cleaner', 'manager') and r.ends_at + interval '1 day' <= p_now;

  -- ---------------------------------------------------------------------------
  -- Residentes e estadias
  -- ---------------------------------------------------------------------------
  drop table if exists _beds, _ns, _special, _events;
  create temp table _beds on commit drop as
    select b.id bed_id, rm.lodge_id, random() ord, '-infinity'::timestamptz free_from
    from public.beds b join public.rooms rm on rm.id = b.room_id where b.active and rm.active and b.status = 'in_use';
  create temp table _ns (resident_id uuid, d date, status text) on commit drop;       -- No Shows planejados
  create temp table _special (resident_id uuid primary key, role text) on commit drop;

  v_k := 0;
  for v_lodge, v_s in select * from (values (v_amiens, 33), (v_connolly, 39)) x loop
    for v_rec in select bed_id from _beds where lodge_id = v_lodge order by ord limit v_s loop
      v_k := v_k + 1;
      insert into public.residents (pass_id, first_name, last_name, date_of_birth, is_demo, created_at)
      values ('DEMO-' || lpad(v_k::text, 4, '0'), v_first_names[1 + (v_k * 7) % array_length(v_first_names, 1)],
              v_last_names[1 + (v_k * 11) % array_length(v_last_names, 1)],
              date '1965-01-01' + floor(random() * 12000)::int, true, (v_first - 200)::timestamptz)
      returning id into v_res;
      v_at := public.slot_instant(v_first - 5 - floor(random() * 150)::int, '14:00') + demo.minutes(0, 180);
      insert into public.stays (resident_id, lodge_id, bed_id, admitted_at, status, created_at, created_by)
      values (v_res, v_lodge, v_rec.bed_id, v_at, 'active', v_at, v_p[1 + floor(random() * 8)::int]);
      update _beds set free_from = 'infinity' where bed_id = v_rec.bed_id;
    end loop;
  end loop;

  -- Papéis para os cenários (escolhidos entre os residentes iniciais).
  insert into _special
  select resident_id, role from (
    select s.resident_id, row_number() over (partition by s.lodge_id order by s.admitted_at) n, s.lodge_id
    from public.stays s join public.residents r on r.id = s.resident_id where r.is_demo
  ) x cross join lateral (values
    (case when x.lodge_id = v_amiens and x.n = 3 then 'noshow_out' end),
    (case when x.lodge_id = v_connolly and x.n = 4 then 'noshow_two' end),
    (case when x.lodge_id = v_amiens and x.n = 6 then 'absence_active' end),
    (case when x.lodge_id = v_connolly and x.n = 8 then 'absence_overdue' end),
    (case when x.lodge_id = v_connolly and x.n = 10 then 'final_warning' end),
    (case when x.lodge_id = v_amiens and x.n = 12 then 'out_pending' end),
    (case when x.lodge_id = v_amiens and x.n = 14 then 'transfer_ac' end),
    (case when x.lodge_id = v_connolly and x.n = 15 then 'transfer_ca' end),
    (case when x.lodge_id = v_amiens and x.n = 16 then 'fw_deactivated' end)
  ) r(role) where r.role is not null;

  -- Movimentos do período: Outs, admissões e transferências, em ordem de tempo.
  create temp table _events on commit drop as
  select * from (values
    (4, 'out', 'A', 'Moved to own accommodation'), (11, 'out', 'A', 'Left voluntarily'), (19, 'out', 'A', 'Moved to another service'),
    (7, 'out', 'C', 'Moved to own accommodation'), (16, 'out', 'C', 'Family reunification'), (22, 'out', 'C', 'Left voluntarily'),
    (26, 'out_noshow', 'A', '3 No Shows in the month — bed cancelled'),
    (2, 'admit', 'A', null), (6, 'admit', 'A', null), (12, 'admit', 'A', null), (20, 'admit', 'A', null), (28, 'admit', 'A', null),
    (3, 'admit', 'C', null), (9, 'admit', 'C', null), (15, 'admit', 'C', null), (24, 'admit', 'C', null), (29, 'admit', 'C', null),
    (10, 'transfer', 'A', 'Requested a room closer to work'), (21, 'transfer', 'C', 'Needs ground floor access')
  ) e(off, kind, lodge, reason);
  for v_rec in select * from _events order by off, kind loop
    v_d := v_first + v_rec.off;
    v_lodge := case v_rec.lodge when 'A' then v_amiens else v_connolly end;
    v_at := public.slot_instant(v_d, '11:00') + demo.minutes(0, 240);
    v_staff := demo.on_duty(v_lodge, v_at);
    if v_rec.kind in ('out', 'out_noshow') then
      select s.* into v_rec2 from public.stays s join public.residents r on r.id = s.resident_id
      where s.lodge_id = v_lodge and s.status = 'active' and r.is_demo
        and (case when v_rec.kind = 'out_noshow' then s.resident_id in (select resident_id from _special where role = 'noshow_out')
                  else s.resident_id not in (select resident_id from _special) end)
      order by random() limit 1;
      update public.stays set status = 'ended', ended_at = v_at, ended_by = v_mgr, end_reason = 'out',
             out_decided_at = v_at - interval '1 day', out_decided_by = v_mgr, out_reason = v_rec.reason
       where id = v_rec2.id;
      update _beds set free_from = v_at where bed_id = v_rec2.bed_id;
    elsif v_rec.kind = 'admit' then
      v_k := v_k + 1;
      insert into public.residents (pass_id, first_name, last_name, date_of_birth, is_demo, created_at, created_by)
      values ('DEMO-' || lpad(v_k::text, 4, '0'), v_first_names[1 + (v_k * 7) % array_length(v_first_names, 1)],
              v_last_names[1 + (v_k * 13) % array_length(v_last_names, 1)], date '1965-01-01' + floor(random() * 12000)::int, true, v_at, v_staff)
      returning id into v_res;
      select bed_id into v_id from _beds where lodge_id = v_lodge and free_from <= v_at - interval '2 hours' order by free_from, ord limit 1;
      insert into public.stays (resident_id, lodge_id, bed_id, admitted_at, status, created_at, created_by)
      values (v_res, v_lodge, v_id, v_at, 'active', v_at, v_staff);
      update _beds set free_from = 'infinity' where bed_id = v_id;
    else
      select s.* into v_rec2 from public.stays s
      where s.status = 'active' and s.resident_id in (select resident_id from _special where role = case v_rec.lodge when 'A' then 'transfer_ac' else 'transfer_ca' end);
      update public.stays set status = 'ended', ended_at = v_at, ended_by = v_mgr, end_reason = 'transfer' where id = v_rec2.id;
      update _beds set free_from = v_at where bed_id = v_rec2.bed_id;
      v_lodge := case v_rec.lodge when 'A' then v_connolly else v_amiens end;
      select bed_id into v_id from _beds where lodge_id = v_lodge and free_from <= v_at - interval '2 hours' order by free_from, ord limit 1;
      insert into public.stays (resident_id, lodge_id, bed_id, admitted_at, status, transfer_from_stay_id, created_at, created_by)
      values (v_rec2.resident_id, v_lodge, v_id, v_at, 'active', v_rec2.id, v_at, v_mgr);
      update _beds set free_from = 'infinity' where bed_id = v_id;
    end if;
  end loop;
  -- Admissão de hoje de manhã (se já passou das 10h30) e um Out decidido ontem, ainda por efetivar.
  if public.slot_instant(v_today, '10:30') < p_now then
    v_k := v_k + 1;
    v_staff := demo.on_duty(v_amiens, public.slot_instant(v_today, '10:30'));
    insert into public.residents (pass_id, first_name, last_name, date_of_birth, is_demo, created_at, created_by)
    values ('DEMO-' || lpad(v_k::text, 4, '0'), 'Kateryna', 'Melnyk', date '1991-04-12', true, public.slot_instant(v_today, '10:30'), v_staff)
    returning id into v_res;
    select bed_id into v_id from _beds where lodge_id = v_amiens and free_from < public.slot_instant(v_today, '08:00') order by free_from, ord limit 1;
    if v_id is not null then
      insert into public.stays (resident_id, lodge_id, bed_id, admitted_at, status, created_at, created_by)
      values (v_res, v_amiens, v_id, public.slot_instant(v_today, '10:30'), 'active', public.slot_instant(v_today, '10:30'), v_staff);
      update _beds set free_from = 'infinity' where bed_id = v_id;
    end if;
  end if;
  update public.stays set status = 'out_pending', out_decided_at = public.slot_instant(v_today - 1, '15:00'), out_decided_by = v_mgr,
         out_reason = 'Moving to Cork — leaves on Saturday'
   where status = 'active' and resident_id in (select resident_id from _special where role = 'out_pending');
  -- Uma cama livre fora de uso.
  update public.beds set status = 'out_of_service', status_note = 'Bed frame broken — replacement ordered (demo)'
   where id = (select bed_id from _beds where lodge_id = v_connolly and free_from < p_now order by ord limit 1);

  -- ---------------------------------------------------------------------------
  -- Ausências (passadas, uma ativa e uma vencida) e No Shows planejados
  -- ---------------------------------------------------------------------------
  for v_rec in
    select s.id stay_id, s.resident_id, n from (
      select s.*, row_number() over (order by s.resident_id) n from public.stays s join public.residents r on r.id = s.resident_id
      where r.is_demo and s.status <> 'ended' and s.transfer_from_stay_id is null and s.admitted_at < v_first::timestamptz
        and s.resident_id not in (select resident_id from _special)) s
    where n in (2, 9, 17, 25, 33, 41)
  loop
    v_at := public.slot_instant(v_first + 2 + (v_rec.n % 20)::int, '10:00') + demo.minutes(0, 300);
    insert into public.absences (stay_id, resident_id, starts_at, expected_return_at, ended_at, ended_by, notes, created_by, created_at)
    values (v_rec.stay_id, v_rec.resident_id, v_at, v_at + interval '3 days', v_at + interval '2 days' + demo.minutes(0, 600),
            demo.on_duty((select lodge_id from public.stays where id = v_rec.stay_id), v_at),
            (array['Visiting family in Galway', 'Hospital stay', 'Work trip to Belfast', 'Weekend with friends in Cork'])[1 + (v_rec.n % 4)::int],
            demo.on_duty((select lodge_id from public.stays where id = v_rec.stay_id), v_at), v_at);
  end loop;
  insert into public.absences (stay_id, resident_id, starts_at, expected_return_at, notes, created_by, created_at)
  select s.id, s.resident_id, public.slot_instant(v_today - 2, '10:00'), public.slot_instant(v_today + 2, '18:00'),
         'Visiting family in Limerick', demo.on_duty(s.lodge_id, public.slot_instant(v_today - 2, '10:00')), public.slot_instant(v_today - 2, '10:00')
  from public.stays s where s.status <> 'ended' and s.resident_id in (select resident_id from _special where role = 'absence_active');
  insert into public.absences (stay_id, resident_id, starts_at, expected_return_at, notes, created_by, created_at)
  select s.id, s.resident_id, public.slot_instant(v_today - 5, '09:00'), public.slot_instant(v_today - 1, '12:00'),
         'Hospital stay — said would be back yesterday', demo.on_duty(s.lodge_id, public.slot_instant(v_today - 5, '09:00')), public.slot_instant(v_today - 5, '09:00')
  from public.stays s where s.status <> 'ended' and s.resident_id in (select resident_id from _special where role = 'absence_overdue');
  -- O residente da ausência vencida também não volta hoje: sem evidência a partir do retorno previsto.

  -- No Shows: 3 no mês para o residente que depois tem a cama cancelada; 2 neste mês em Connolly
  -- (o próximo dispara o aviso) e um desfeito no mês passado.
  insert into _ns
  select resident_id, v_first + o, 'confirmed' from _special, unnest(array[13, 17, 22]) o where role = 'noshow_out'
  union all
  select resident_id, d, 'confirmed' from _special, unnest(array[v_today - 6, v_today - 1]) d where role = 'noshow_two'
  union all
  select resident_id, v_first + 5, 'undone' from _special where role = 'noshow_two';
  -- Os dias do residente da ausência vencida, depois da volta prevista, também não têm evidência (fica para hoje).

  -- ---------------------------------------------------------------------------
  -- Dia a dia: checks, rondas, tarefas, geladeira, entregas, Dinner, Laundry, Handover
  -- ---------------------------------------------------------------------------
  for v_d in select generate_series(v_first, v_today, interval '1 day')::date loop
    for v_lodge, v_code in select id, code from public.lodges where id in (v_amiens, v_connolly) loop

      -- Room Checks (12:00, 18:00, 22:00)
      foreach v_slot in array public.check_slots(v_lodge, v_d) loop
        v_at := public.slot_instant(v_d, v_slot) + demo.minutes(0, 18);
        continue when v_at > p_now;
        v_staff := demo.on_duty(v_lodge, v_at);
        v_at2 := v_at + demo.minutes(8, 35);  -- digitação
        insert into public.room_check_runs (lodge_id, operational_day, slot, checked_at, performed_by, entered_by, entered_at, status, launched_at, launched_by, sheet_number)
        values (v_lodge, v_d, v_slot, v_at, v_staff, v_staff, v_at2,
                (case when v_d = v_today and v_lodge = v_connolly and v_at2 > p_now - interval '3 hours' then 'pending' else 'launched' end)::public.check_status,
                case when v_d = v_today and v_lodge = v_connolly and v_at2 > p_now - interval '3 hours' then null else v_at2 + interval '2 minutes' end,
                case when v_d = v_today and v_lodge = v_connolly and v_at2 > p_now - interval '3 hours' then null else v_staff end,
                left(v_code, 2) || '-' || to_char(v_d, 'YYYYMMDD') || '-' || replace(v_slot, ':', ''))
        returning id, status::text into v_run, v_txt;
        insert into public.room_check_marks (run_id, stay_id, resident_id, result, marked_by, marked_at)
        select v_run, s.id, s.resident_id,
               case when exists (select 1 from public.absences a where a.stay_id = s.id and a.starts_at <= v_at and public.absence_effective_end(a) > v_at) then 'absent'
                    when exists (select 1 from _ns n where n.resident_id = s.resident_id and n.d = v_d) then 'not_seen'
                    when s.resident_id in (select resident_id from _special where role = 'absence_overdue')
                         and v_at > public.slot_instant(v_today - 1, '12:00') then 'not_seen'
                    when random() < 0.86 then 'seen' else 'not_seen' end::public.check_result,
               v_staff, v_at2 - demo.minutes(1, 7)
        from public.stays_present_at(v_lodge, v_at) s
        where v_txt = 'launched' or random() < 0.5;
        -- Ronda do horário do check
        if v_slot = any (public.round_slots()) and v_txt = 'launched' then
          insert into public.handover_entries (lodge_id, kind, body, occurred_at, operational_day, round_slot, author_id, created_at)
          values (v_lodge, 'round', 'Room Check Done', v_at, v_d, v_slot, v_staff, v_at2 + interval '2 minutes');
        end if;
      end loop;

      -- Rondas a cada 2 h (uma de hoje fica pendente em Connolly)
      foreach v_slot in array public.round_slots() loop
        v_at := public.slot_instant(v_d, v_slot) + demo.minutes(2, 24);
        continue when v_at + interval '5 minutes' > p_now;
        continue when v_d = v_today and v_lodge = v_connolly and v_slot = '10:00';
        continue when exists (select 1 from public.handover_entries where lodge_id = v_lodge and operational_day = v_d and round_slot = v_slot and kind = 'round');
        continue when random() < 0.015;
        insert into public.handover_entries (lodge_id, kind, body, occurred_at, operational_day, round_slot, author_id, created_at)
        values (v_lodge, 'round', 'Room Check Done', v_at, v_d, v_slot, demo.on_duty(v_lodge, v_at), v_at + demo.minutes(0, 4));
      end loop;

      -- Geladeira (2x por dia) — assina a tarefa do turno
      foreach v_slot in array array['09:40', '21:10'] loop
        v_at := public.slot_instant(v_d, v_slot) + demo.minutes(-20, 25);
        continue when v_at > p_now;
        v_staff := demo.on_duty(v_lodge, v_at);
        v_temp := round((2.2 + random() * 2.4)::numeric, 1);
        if (v_lodge = v_amiens and v_d = v_first + 9 and v_slot = '09:40') then v_temp := 6.8; end if;
        if (v_lodge = v_connolly and v_d = v_first + 17 and v_slot = '21:10') then v_temp := 7.4; end if;
        if (v_lodge = v_amiens and v_d = v_today - 4 and v_slot = '21:10') then v_temp := -0.6; end if;
        -- Uma leitura por geladeira da casa (Beta: Amiens 1, Connolly 4); o valor especial vai na primeira.
        for v_fridge in select f.id, f.name, f.sort_order from public.fridges f where f.lodge_id = v_lodge and f.active order by f.sort_order loop
          if v_fridge.sort_order > 1 then v_temp := round((2.2 + random() * 2.4)::numeric, 1); end if;
          v_out := v_temp < 0 or v_temp > 5;
          insert into public.fridge_readings (lodge_id, fridge_id, temperature, range_min, range_max, out_of_range, note, recorded_by, recorded_at)
          values (v_lodge, v_fridge.id, v_temp, 0, 5, v_out,
                  case when v_temp = 6.8 then 'Door left open after the delivery — closed, re-check in 30 min'
                       when v_temp = 7.4 then 'Fridge very full — reorganised shelves'
                       when v_temp = -0.6 then 'Thermostat turned down by mistake — adjusted' end,
                  v_staff, v_at + make_interval(mins => v_fridge.sort_order - 1))
          returning id into v_id;
          if v_out then
            insert into public.notifications (kind, audience, lodge_id, payload, created_at)
            values ('fridge_out_of_range', 'management', v_lodge,
                    jsonb_build_object('demo', true, 'reading_id', v_id, 'temperature', v_temp, 'min', 0, 'max', 5,
                                       'fridge_id', v_fridge.id, 'fridge_name', v_fridge.name), v_at);
          end if;
        end loop;
        insert into public.task_signatures (lodge_id, operational_day, shift, template_id, staff_id, duty_function, signed_at)
        select v_lodge, v_d, public.shift_of(v_at), t.id, v_staff,
               coalesce((select function::text from public.duty_posts where staff_id = v_staff and started_at <= v_at and coalesce(ended_at, 'infinity') > v_at limit 1), 'office'), v_at
        from public.task_templates t
        where t.lodge_id = v_lodge and t.shift = public.shift_of(v_at) and t.auto_key = 'fridge_temperature' and t.active;
      end loop;

      -- Daily Tasks (≈95% assinadas; as do turno atual só até agora)
      for v_rec in
        select t.id, t.shift, t.sort_order, t.suggested_time from public.task_templates t
        where t.lodge_id = v_lodge and t.active and t.auto_key is null
          and (t.weekdays is null or public.iso_weekday(v_d) = any (t.weekdays))
      loop
        v_at := coalesce(public.slot_instant(v_d, v_rec.suggested_time), public.shift_start_of(v_d, v_rec.shift) + make_interval(mins => 60 + v_rec.sort_order * 20))
                + demo.minutes(0, 40);
        continue when v_at > p_now;
        continue when random() < 0.05;
        v_staff := demo.on_duty(v_lodge, v_at);
        insert into public.task_signatures (lodge_id, operational_day, shift, template_id, staff_id, duty_function, signed_at)
        values (v_lodge, v_d, v_rec.shift, v_rec.id, v_staff,
                coalesce((select function::text from public.duty_posts where staff_id = v_staff and started_at <= v_at and coalesce(ended_at, 'infinity') > v_at limit 1), 'office'), v_at);
      end loop;

      -- Food Delivery (Amiens: seg/qua/sex)
      if v_lodge = v_amiens and public.iso_weekday(v_d) in (1, 3, 5) and public.slot_instant(v_d, '10:30') < p_now then
        for v_i in 1..2 loop
          v_at := public.slot_instant(v_d, '10:30') + demo.minutes(0, 50);
          insert into public.food_deliveries (lodge_id, product, supplier, batch, expiry_date, temperature, note, received_by, received_at)
          values (v_amiens, v_foods[1 + floor(random() * array_length(v_foods, 1))::int], v_suppliers[1 + floor(random() * 3)::int],
                  'L' || to_char(v_d, 'MMDD') || '-' || v_i, v_d + 3 + floor(random() * 8)::int,
                  case when v_d = v_first + 16 and v_i = 1 then 6.5 else round((1.5 + random() * 3)::numeric, 1) end,
                  case when v_d = v_first + 16 and v_i = 1 then 'Arrived above 5 °C — supplier informed, moved to the cold room at once' end,
                  demo.on_duty(v_amiens, v_at), v_at);
        end loop;
      end if;

      -- Dinner (Amiens): marcas ~19h; o Manager fecha na manhã seguinte
      if v_lodge = v_amiens and v_d < v_today then
        v_at := public.slot_instant(v_d + 1, '09:15') + demo.minutes(0, 60);
        insert into public.dinner_services (lodge_id, operational_day, leftovers, packaged, close_note, closed_at, closed_by)
        values (v_amiens, v_d, case when v_at <= p_now then floor(random() * 6)::int end, case when v_at <= p_now then floor(random() * 4)::int end,
                case when v_at <= p_now and random() < 0.2 then 'Two portions kept for residents arriving late' end,
                case when v_at <= p_now then v_at end, case when v_at <= p_now then v_mgr end)
        returning id into v_id;
        insert into public.dinner_marks (service_id, stay_id, resident_id, served, marked_by, marked_at)
        select v_id, s.id, s.resident_id, x.r < 0.88, demo.on_duty(v_amiens, public.slot_instant(v_d, '19:30')),
               public.slot_instant(v_d, '19:00') + demo.minutes(0, 75)
        from public.stays_present_at(v_amiens, public.slot_instant(v_d, '19:30')) s
        cross join lateral (select random() r) x
        where x.r < 0.97
          and not exists (select 1 from _ns n where n.resident_id = s.resident_id and n.d = v_d)
          and not exists (select 1 from public.absences a where a.stay_id = s.id and a.starts_at <= public.slot_instant(v_d, '19:30')
                          and public.absence_effective_end(a) > public.slot_instant(v_d, '19:30'));
      end if;

      -- Laundry (Connolly)
      if v_lodge = v_connolly then
        for v_i in 1..(3 + floor(random() * 4)::int) loop
          v_at := public.slot_instant(v_d, '09:00') + demo.minutes(0, 720);
          continue when v_at > p_now;
          select m.* into v_rec2 from public.laundry_machines m where m.lodge_id = v_connolly and m.active order by random() limit 1;
          continue when exists (select 1 from public.laundry_uses u where u.machine_id = v_rec2.id and u.started_at < v_at + interval '95 minutes'
                                and coalesce(u.finished_at, 'infinity') > v_at);
          select s.* into v_rec from public.stays_present_at(v_connolly, v_at) s
          where not exists (select 1 from _ns n where n.resident_id = s.resident_id and n.d = v_d)
            and not exists (select 1 from public.absences a where a.stay_id = s.id and a.starts_at <= v_at and public.absence_effective_end(a) > v_at)
            and not (s.resident_id in (select resident_id from _special where role = 'absence_overdue') and v_at > public.slot_instant(v_today - 1, '12:00'))
          order by random() limit 1;
          continue when v_rec.id is null;
          v_staff := demo.on_duty(v_connolly, v_at);
          insert into public.handover_entries (lodge_id, kind, body, occurred_at, operational_day, author_id, created_at)
          values (v_connolly, 'laundry', 'Laundry — ' || v_rec2.label, v_at, public.operational_day(v_at), v_staff, v_at)
          returning id into v_entry;
          insert into public.handover_mentions (entry_id, resident_id) values (v_entry, v_rec.resident_id);
          v_en := v_at + demo.minutes(55, 95);
          insert into public.laundry_uses (machine_id, lodge_id, stay_id, resident_id, started_at, started_by, finished_at, finished_by, handover_entry_id)
          values (v_rec2.id, v_connolly, v_rec.id, v_rec.resident_id, v_at, v_staff,
                  case when v_en <= p_now then v_en end, case when v_en <= p_now then demo.on_duty(v_connolly, v_en) end, v_entry);
        end loop;
      end if;

      -- Seen manual ao longo do dia
      for v_i in 1..4 loop
        v_at := public.operational_day_start(v_d) + demo.minutes(30, 1380);
        continue when v_at > p_now;
        select s.* into v_rec from public.stays_present_at(v_lodge, v_at) s
        where not exists (select 1 from _ns n where n.resident_id = s.resident_id and n.d = v_d)
          and not exists (select 1 from public.absences a where a.stay_id = s.id and a.starts_at <= v_at and public.absence_effective_end(a) > v_at)
          and not (s.resident_id in (select resident_id from _special where role = 'absence_overdue') and v_at > public.slot_instant(v_today - 1, '12:00'))
        order by random() limit 1;
        continue when v_rec.id is null;
        insert into public.sightings (resident_id, lodge_id, seen_at, place, recorded_by, recorded_at)
        values (v_rec.resident_id, v_lodge, v_at, v_places[1 + floor(random() * array_length(v_places, 1))::int],
                demo.on_duty(v_lodge, v_at), v_at + demo.minutes(0, 20));
      end loop;

      -- Anotações do Handover (algumas com residente; algumas lançadas depois do turno, com motivo)
      for v_i in 1..(2 + floor(random() * 3)::int) loop
        v_at := public.operational_day_start(v_d) + demo.minutes(20, 1400);
        continue when v_at > p_now;
        v_staff := demo.on_duty(v_lodge, v_at);
        if random() < 0.3 then
          select s.resident_id into v_res from public.stays_present_at(v_lodge, v_at) s
          where not exists (select 1 from _ns n where n.resident_id = s.resident_id and n.d = v_d) order by random() limit 1;
          v_txt := v_mention_notes[1 + floor(random() * array_length(v_mention_notes, 1))::int];
        else
          v_res := null;
          v_txt := v_notes[1 + floor(random() * array_length(v_notes, 1))::int];
        end if;
        v_at2 := v_at + demo.minutes(1, 30);
        if random() < 0.06 and public.shift_end(v_at) + interval '2 hours' < p_now then
          v_at2 := least(public.shift_end(v_at) + demo.minutes(30, 300), p_now - interval '1 minute');
        end if;
        insert into public.handover_entries (lodge_id, kind, body, occurred_at, operational_day, author_id, created_at, late_reason)
        values (v_lodge, 'note', v_txt, v_at, public.operational_day(v_at), v_staff, v_at2,
                case when v_at2 > public.shift_end(v_at) then v_late[1 + floor(random() * 4)::int] end)
        returning id into v_entry;
        if v_res is not null then insert into public.handover_mentions (entry_id, resident_id) values (v_entry, v_res); end if;
      end loop;
    end loop;

    -- Dia encerrado: quem não tem evidência (e não é No Show nem ausente) foi visto na recepção à noite.
    if v_d < v_today then
      for v_lodge in select unnest(array[v_amiens, v_connolly]) loop
        insert into public.sightings (resident_id, lodge_id, seen_at, place, recorded_by, recorded_at)
        select c.resident_id, v_lodge, t.seen, 'Reception', demo.on_duty(v_lodge, t.seen), t.seen + demo.minutes(0, 15)
        from public.residents_without_evidence(v_lodge, v_d, public.operational_day_end(v_d)) c
        cross join lateral (select public.slot_instant(v_d, '23:00') + demo.minutes(0, 50) as seen) t
        where not exists (select 1 from _ns n where n.resident_id = c.resident_id and n.d = v_d)
          and not (c.resident_id in (select resident_id from _special where role = 'absence_overdue') and v_d >= v_today - 1);
      end loop;
    end if;
  end loop;

  -- Duas No Shows "confirmadas" de verdade precisam de nenhuma evidência: conferido no teste.
  insert into public.no_shows (resident_id, stay_id, lodge_id, operational_day, status, confirmed_by, confirmed_at, undone_by, undone_at, undo_reason)
  select n.resident_id, s.id, s.lodge_id, n.d, n.status::public.no_show_status,
         demo.on_duty(s.lodge_id, public.slot_instant(n.d + 1, '06:40')), public.slot_instant(n.d + 1, '06:40'),
         case when n.status = 'undone' then v_mgr end,
         case when n.status = 'undone' then public.slot_instant(n.d + 1, '10:20') end,
         case when n.status = 'undone' then 'Resident was at the Mater Hospital overnight — discharge letter shown at reception' end
  from _ns n join public.stays s on s.resident_id = n.resident_id
   and s.admitted_at <= public.operational_day_start(n.d) and coalesce(s.ended_at, 'infinity') > public.operational_day_end(n.d);
  -- O No Show desfeito: o residente passa a ter evidência (Seen lançado pela gestão).
  insert into public.sightings (resident_id, lodge_id, seen_at, place, recorded_by, recorded_at)
  select n.resident_id, n.lodge_id, public.slot_instant(n.operational_day, '23:30'), 'Mater Hospital (letter)', v_mgr, n.undone_at
  from public.no_shows n where n.status = 'undone' and n.undone_by = v_mgr;
  -- 3º No Show do mês → aviso para a gestão.
  insert into public.notifications (kind, audience, lodge_id, resident_id, payload, created_at)
  select 'no_show_monthly_limit', 'management', n.lodge_id, n.resident_id,
         jsonb_build_object('demo', true, 'no_show_id', n.id, 'month_count', 3, 'operational_day', n.operational_day,
                            'first_name', r.first_name, 'last_name', r.last_name), n.confirmed_at
  from public.no_shows n join public.residents r on r.id = n.resident_id
  where n.status = 'confirmed' and n.resident_id in (select resident_id from _special where role = 'noshow_out')
  order by n.operational_day desc limit 1;

  -- ---------------------------------------------------------------------------
  -- Manutenção
  -- ---------------------------------------------------------------------------
  for v_rec in select * from (values
    ('A', 2, 'Room 3 — shower', 'Dripping tap in the shower', 'normal', 'resolved', 2, null::int),
    ('A', 8, 'Kitchen', 'Oven door hinge broken', 'urgent', 'resolved', 0, null),
    ('A', 15, 'Room 7 — window', 'Window does not close fully', 'normal', 'on_hold', null, null),
    ('A', 24, 'Corridor, 1st floor', 'Light out next to the fire exit', 'urgent', 'in_progress', null, null),
    ('A', 27, 'Back yard', 'Bin lid broken', 'low', 'open', null, null),
    ('A', 12, 'Room 2 — bed 3', 'Mattress torn', 'normal', 'reopened', 6, null),
    ('C', 5, 'Apartment 2', 'Storage heater not working', 'urgent', 'resolved', 1, null),
    ('C', 10, 'Laundry room', 'Dryer B not heating', 'normal', 'resolved', 4, null),
    ('C', 18, 'Room 14 — door', 'Lock sticks, hard to open', 'normal', 'in_progress', null, null),
    ('C', 20, 'Main entrance', 'Intercom buzzing on and off', 'normal', 'open', null, null),
    ('C', 28, 'Room 21 — sink', 'Blocked sink', 'urgent', 'open', null, null),
    ('C', 1, 'Kitchen', 'Fridge door seal worn', 'low', 'on_hold', null, null),
    ('C', 30, 'Room 9', 'Damp patch on the ceiling', 'normal', 'open', null, null)
  ) t(lodge, off, location, description, priority, status, resolve_after, x) loop
    v_lodge := case v_rec.lodge when 'A' then v_amiens else v_connolly end;
    v_at := least(public.slot_instant(v_first + v_rec.off, '09:30') + demo.minutes(0, 300), p_now - interval '30 minutes');
    v_staff := demo.on_duty(v_lodge, v_at);
    insert into public.handover_entries (lodge_id, kind, body, occurred_at, operational_day, author_id, created_at)
    values (v_lodge, 'maintenance', v_rec.location || ' — ' || v_rec.description, v_at, public.operational_day(v_at), v_staff, v_at)
    returning id into v_entry;
    insert into public.maintenance_tickets (lodge_id, location, description, priority, status, deadline_at, request_key, handover_entry_id, created_by, created_at)
    values (v_lodge, v_rec.location, v_rec.description, v_rec.priority, 'open',
            v_at + make_interval(hours => case v_rec.priority when 'urgent' then 24 when 'normal' then 168 else 720 end),
            gen_random_uuid(), v_entry, v_staff, v_at)
    returning id into v_id;
    insert into public.maintenance_events (ticket_id, kind, to_value, staff_id, at) values (v_id, 'created', 'open', v_staff, v_at);
    insert into public.notifications (kind, audience, lodge_id, payload, created_at)
    values ('maintenance_opened', 'management', v_lodge, jsonb_build_object('demo', true, 'ticket_id', v_id, 'location', v_rec.location, 'priority', v_rec.priority), v_at);
    if v_rec.status in ('in_progress', 'on_hold', 'resolved', 'reopened') then
      v_at2 := v_at + interval '3 hours';
      insert into public.maintenance_events (ticket_id, kind, from_value, to_value, note, staff_id, at)
      values (v_id, 'status', 'open', 'in_progress', 'Contractor contacted', v_mgr, v_at2);
      update public.maintenance_tickets set status = 'in_progress' where id = v_id;
    end if;
    if v_rec.status = 'on_hold' then
      insert into public.maintenance_events (ticket_id, kind, from_value, to_value, note, staff_id, at)
      values (v_id, 'status', 'in_progress', 'on_hold', 'Waiting for the part to arrive', v_mgr, v_at2 + interval '1 day');
      update public.maintenance_tickets set status = 'on_hold' where id = v_id;
    end if;
    if v_rec.status in ('resolved', 'reopened') then
      v_en := v_at + make_interval(days => v_rec.resolve_after, hours => 5);
      insert into public.maintenance_events (ticket_id, kind, from_value, to_value, note, staff_id, at)
      values (v_id, 'status', 'in_progress', 'resolved', 'Fixed', v_mgr, v_en);
      update public.maintenance_tickets set status = 'resolved', resolved_at = v_en, resolved_by = v_mgr where id = v_id;
    end if;
    if v_rec.status = 'reopened' then
      insert into public.maintenance_events (ticket_id, kind, from_value, to_value, note, staff_id, at)
      values (v_id, 'status', 'resolved', 'reopened', 'Resident says the new mattress is also damaged', v_mgr, v_en + interval '4 days');
      update public.maintenance_tickets set status = 'reopened', resolved_at = null, resolved_by = null,
             deadline_at = v_en + interval '11 days' where id = v_id;
      insert into public.maintenance_events (ticket_id, kind, from_value, to_value, note, staff_id, at)
      values (v_id, 'deadline', null, (v_en + interval '11 days')::text, 'New mattress ordered', v_mgr, v_en + interval '4 days');
    end if;
  end loop;

  -- ---------------------------------------------------------------------------
  -- Warnings (com a anotação no Handover)
  -- ---------------------------------------------------------------------------
  for v_rec in select * from (values
    ('A', 3, 'verbal', 'Smoking in the room', null::text),
    ('A', 13, 'written', 'Second time smoking indoors', null),
    ('A', 20, 'verbal', 'Noise after 23:00', null),
    ('A', 28, 'verbal', 'Guest in the room after hours', null),
    ('A', 2, 'final_written', 'Threatened another resident', 'fw_deactivated'),
    ('C', 6, 'written', 'Aggressive language with staff', null),
    ('C', 16, 'final_written', 'Repeated aggressive behaviour — last warning', 'final_warning'),
    ('C', 25, 'verbal', 'Left the kitchen dirty', null)
  ) w(lodge, off, type, note, role) loop
    v_lodge := case v_rec.lodge when 'A' then v_amiens else v_connolly end;
    v_at := public.slot_instant(v_first + v_rec.off, '20:00') + demo.minutes(0, 120);
    select s.* into v_rec2 from public.stays_present_at(v_lodge, v_at) s
    where (v_rec.role is null and s.resident_id not in (select resident_id from _special))
       or s.resident_id in (select resident_id from _special where role = v_rec.role)
    order by random() limit 1;
    continue when v_rec2.id is null;
    v_staff := case when v_rec.type = 'final_written' then v_mgr else demo.on_duty(v_lodge, v_at) end;
    insert into public.handover_entries (lodge_id, kind, body, occurred_at, operational_day, author_id, created_at)
    values (v_lodge, 'warning',
            case v_rec.type when 'verbal' then 'Verbal Warning' when 'written' then 'Written Warning' else 'Final Written Warning (FW)' end || ': ' || v_rec.note,
            v_at, public.operational_day(v_at), v_staff, v_at)
    returning id into v_entry;
    insert into public.handover_mentions (entry_id, resident_id) values (v_entry, v_rec2.resident_id);
    insert into public.warnings (resident_id, stay_id, lodge_id, type, note, handover_entry_id, issued_by, issued_at,
                                 active, deactivated_by, deactivated_at, deactivation_reason)
    values (v_rec2.resident_id, v_rec2.id, v_lodge, v_rec.type, v_rec.note, v_entry, v_staff, v_at,
            v_rec.role is distinct from 'fw_deactivated' or v_rec.type <> 'final_written',
            case when v_rec.role = 'fw_deactivated' then v_mgr end,
            case when v_rec.role = 'fw_deactivated' then public.slot_instant(v_first + 19, '11:00') end,
            case when v_rec.role = 'fw_deactivated' then 'Behaviour improved — agreed at the review meeting' end);
  end loop;

  -- ---------------------------------------------------------------------------
  -- Tarefas extras do Manager
  -- ---------------------------------------------------------------------------
  insert into public.task_extras (lodge_id, operational_day, shift, staff_id, title, due_at, created_by, created_at)
  values (v_amiens, v_today - 4, 'day', null, 'Check fire extinguisher dates', null, v_mgr, public.slot_instant(v_today - 4, '08:00')),
         (v_connolly, v_today - 1, 'night', null, 'Count bed linen stock and note it in the Handover', null, v_mgr, public.slot_instant(v_today - 1, '16:00'));
  insert into public.task_signatures (lodge_id, operational_day, shift, extra_id, staff_id, duty_function, signed_at)
  select x.lodge_id, x.operational_day, x.shift, x.id, demo.on_duty(x.lodge_id, public.slot_instant(x.operational_day, '11:20')), 'office',
         public.slot_instant(x.operational_day, '11:20')
  from public.task_extras x where x.created_by = v_mgr and x.title = 'Check fire extinguisher dates';
  if public.shift_of(p_now) = 'day' then
    insert into public.task_extras (lodge_id, operational_day, shift, staff_id, title, due_at, created_by, created_at)
    values (v_amiens, v_today, 'day', demo.on_duty(v_amiens, p_now), 'Prepare a bed for a new admission tomorrow',
            public.slot_instant(v_today, '17:00'), v_mgr, p_now - interval '20 minutes');
  end if;

  -- ---------------------------------------------------------------------------
  -- Compras, distribuição e transferências
  -- ---------------------------------------------------------------------------
  insert into public.products (name, unit, category, created_at)
  select n, u, c, (v_first - 10)::timestamptz from (values
    ('Milk 2L', 'un', 'Food'), ('Bread loaf', 'un', 'Food'), ('Eggs (dozen)', 'un', 'Food'), ('Tea bags (80)', 'un', 'Food'),
    ('Coffee 1kg', 'un', 'Food'), ('Sugar 1kg', 'un', 'Food'), ('Toilet paper (9 pack)', 'un', 'Cleaning'),
    ('Bin bags (50)', 'un', 'Cleaning'), ('Washing powder 5kg', 'un', 'Laundry'), ('Bleach 1L', 'un', 'Cleaning'),
    ('Hand soap 500ml', 'un', 'Cleaning'), ('Bed sheets (single)', 'un', 'Linen')
  ) p(n, u, c)
  where not exists (select 1 from public.products x where x.name = p.n);
  for v_rec in select * from (values
    (1, 'Musgrave', 'INV-48211', '[["Milk 2L",24,1.39],["Bread loaf",20,1.65],["Eggs (dozen)",10,3.49],["Tea bags (80)",6,2.85]]'),
    (5, 'Lyreco', 'LY-99310', '[["Toilet paper (9 pack)",12,6.99],["Bin bags (50)",8,4.25],["Bleach 1L",10,1.19],["Hand soap 500ml",12,1.75]]'),
    (9, 'Musgrave', 'INV-48602', '[["Milk 2L",24,1.39],["Coffee 1kg",4,11.49],["Sugar 1kg",6,1.335]]'),
    (13, 'Tesco Business', 'TB-20177', '[["Washing powder 5kg",4,14.50],["Bed sheets (single)",20,8.995]]'),
    (17, 'Musgrave', 'INV-49015', '[["Milk 2L",24,1.42],["Bread loaf",20,1.65],["Eggs (dozen)",10,3.49]]'),
    (22, 'Lyreco', 'LY-99877', '[["Toilet paper (9 pack)",10,6.99],["Bin bags (50)",6,4.25]]'),
    (26, 'Musgrave', 'INV-49388', '[["Milk 2L",24,1.42],["Tea bags (80)",6,2.85],["Coffee 1kg",3,11.49]]'),
    (29, 'Tesco Business', 'TB-20412', '[["Washing powder 5kg",3,14.50],["Hand soap 500ml",10,1.79]]')
  ) p(off, supplier, doc, lines) loop
    v_at := public.slot_instant(v_first + v_rec.off, '10:00') + demo.minutes(0, 120);
    insert into public.purchases (supplier, purchased_on, document_ref, created_by, created_at)
    values (v_rec.supplier, v_first + v_rec.off, v_rec.doc, v_mgr, v_at) returning id into v_id;
    for v_rec2 in select value as l from jsonb_array_elements(v_rec.lines::jsonb) loop
      insert into public.purchase_lines (purchase_id, product_id, quantity, unit_price)
      values (v_id, (select id from public.products where name = v_rec2.l ->> 0), (v_rec2.l ->> 1)::numeric, (v_rec2.l ->> 2)::numeric)
      returning id into v_id2;
      -- Distribuição: tudo alocado, exceto a última compra (fica para a equipe alocar).
      if v_rec.off < 29 then
        insert into public.product_movements (kind, product_id, purchase_line_id, to_lodge_id, quantity, created_by, created_at)
        values ('allocation', (select product_id from public.purchase_lines where id = v_id2), v_id2, v_amiens,
                ceil((v_rec2.l ->> 1)::numeric * 0.45), demo.on_duty(v_amiens, v_at + interval '2 hours'), v_at + interval '2 hours'),
               ('allocation', (select product_id from public.purchase_lines where id = v_id2), v_id2, v_connolly,
                (v_rec2.l ->> 1)::numeric - ceil((v_rec2.l ->> 1)::numeric * 0.45), demo.on_duty(v_connolly, v_at + interval '3 hours'), v_at + interval '3 hours');
      end if;
    end loop;
  end loop;
  insert into public.product_movements (kind, product_id, from_lodge_id, to_lodge_id, quantity, note, created_by, created_at)
  values ('transfer', (select id from public.products where name = 'Bed sheets (single)'), v_amiens, v_connolly, 4, 'Connolly ran short after the new admissions',
          v_mgr, public.slot_instant(v_first + 18, '15:00')),
         ('transfer', (select id from public.products where name = 'Milk 2L'), v_connolly, v_amiens, 6, 'Dinner needed extra milk',
          demo.on_duty(v_connolly, public.slot_instant(v_first + 27, '12:30')), public.slot_instant(v_first + 27, '12:30'));

  -- ---------------------------------------------------------------------------
  -- Férias (uma passada, uma futura em conflito com a Rota, uma cancelada)
  -- ---------------------------------------------------------------------------
  insert into public.vacations (staff_id, starts_on, ends_on, note, created_by, created_at)
  values (v_ana, v_today - 17, v_today - 13, 'Annual leave', v_mgr, p_now - interval '40 days');
  insert into public.vacations (staff_id, starts_on, ends_on, note, status, created_by, created_at)
  values (v_p[8], v_today + 3, v_today + 4, 'Asked to swap — cancelled', 'cancelled', v_mgr, p_now - interval '9 days');
  insert into public.vacations (staff_id, starts_on, ends_on, note, created_by, created_at)
  values (v_p[7], v_today + 11, v_today + 17, 'Trip to Brazil', v_mgr, p_now - interval '1 day')
  returning id into v_id;
  insert into public.notifications (kind, audience, payload, created_at)
  values ('vacation_conflict', 'management',
          jsonb_build_object('demo', true, 'vacation_id', v_id, 'staff_id', v_p[7], 'conflicts', public.vacation_conflicts(v_p[7], v_today + 11, v_today + 17),
                             'name', 'Rafael Souza'), p_now - interval '1 day');

  select jsonb_build_object(
    'first_day', v_first, 'last_day', v_today,
    'staff', (select count(*) from public.staff where email like '%@demo.ds-lodge.test'),
    'residents', (select count(*) from public.residents where is_demo),
    'open_stays', (select count(*) from public.stays s join public.residents r on r.id = s.resident_id where r.is_demo and s.status <> 'ended'),
    'checks', (select count(*) from public.room_check_runs where performed_by = any (demo.staff_ids())),
    'marks', (select count(*) from public.room_check_marks where marked_by = any (demo.staff_ids())),
    'handover', (select count(*) from public.handover_entries where author_id = any (demo.staff_ids())),
    'task_signatures', (select count(*) from public.task_signatures where staff_id = any (demo.staff_ids())),
    'no_shows', (select count(*) from public.no_shows n join public.residents r on r.id = n.resident_id where r.is_demo),
    'maintenance', (select count(*) from public.maintenance_tickets where created_by = any (demo.staff_ids())),
    'warnings', (select count(*) from public.warnings w join public.residents r on r.id = w.resident_id where r.is_demo),
    'laundry_uses', (select count(*) from public.laundry_uses where started_by = any (demo.staff_ids())),
    'dinner_marks', (select count(*) from public.dinner_marks where marked_by = any (demo.staff_ids())),
    'fridge_readings', (select count(*) from public.fridge_readings where recorded_by = any (demo.staff_ids())),
    'purchases', (select count(*) from public.purchases where created_by = any (demo.staff_ids())),
    'rota_shifts', (select count(*) from public.rota_shifts where created_by = any (demo.staff_ids()))
  ) into v_counts;
  return v_counts;
end
$$;

-- -----------------------------------------------------------------------------
-- Remoção: tudo o que foi registrado por uma equipe ou sobre um conjunto de residentes.
-- Usada por demo.clear() (dados demo) e demo.purge_test_data() (sobras dos testes "[TESTE]").
-- -----------------------------------------------------------------------------
create or replace function demo.remove_records(p_staff uuid[], p_res uuid[], p_first date, p_last date)
returns integer
language plpgsql
set search_path = public
as $$
declare
  n integer;
  v_fk record;
begin
  delete from public.notification_reads where notification_id in (
    select id from public.notifications where resident_id = any (p_res)) or staff_id = any (p_staff);
  delete from public.notifications where resident_id = any (p_res);
  delete from public.handover_mentions where resident_id = any (p_res) or staff_id = any (p_staff)
     or entry_id in (select id from public.handover_entries where author_id = any (p_staff));
  delete from public.laundry_uses where resident_id = any (p_res) or started_by = any (p_staff);
  delete from public.dinner_marks where resident_id = any (p_res) or marked_by = any (p_staff);
  delete from public.dinner_services ds where closed_by = any (p_staff)
     or (not exists (select 1 from public.dinner_marks m where m.service_id = ds.id) and ds.operational_day between p_first and p_last);
  delete from public.room_check_marks where resident_id = any (p_res) or marked_by = any (p_staff);
  delete from public.room_check_runs r where performed_by = any (p_staff) or entered_by = any (p_staff)
     or (not exists (select 1 from public.room_check_marks m where m.run_id = r.id) and r.operational_day between p_first and p_last);
  delete from public.sightings where resident_id = any (p_res) or recorded_by = any (p_staff);
  delete from public.absences where resident_id = any (p_res);
  delete from public.no_shows where resident_id = any (p_res);
  delete from public.warnings where resident_id = any (p_res) or issued_by = any (p_staff);
  delete from public.maintenance_reminder_snoozes where staff_id = any (p_staff)
     or ticket_id in (select id from public.maintenance_tickets where created_by = any (p_staff));
  delete from public.maintenance_events where ticket_id in (select id from public.maintenance_tickets where created_by = any (p_staff));
  delete from public.maintenance_tickets where created_by = any (p_staff);
  delete from public.handover_entries e where author_id = any (p_staff)
    and not exists (select 1 from public.maintenance_tickets t where t.handover_entry_id = e.id)
    and not exists (select 1 from public.warnings w where w.handover_entry_id = e.id)
    and not exists (select 1 from public.laundry_uses u where u.handover_entry_id = e.id);
  delete from public.task_signatures where staff_id = any (p_staff)
     or extra_id in (select id from public.task_extras where created_by = any (p_staff));
  delete from public.task_extras where created_by = any (p_staff) or staff_id = any (p_staff);
  delete from public.food_deliveries where received_by = any (p_staff);
  delete from public.fridge_readings where recorded_by = any (p_staff);
  delete from public.product_movements where created_by = any (p_staff)
     or purchase_line_id in (select l.id from public.purchase_lines l join public.purchases p on p.id = l.purchase_id where p.created_by = any (p_staff));
  delete from public.purchase_lines where purchase_id in (select id from public.purchases where created_by = any (p_staff));
  delete from public.purchases where created_by = any (p_staff);
  delete from public.products p where p.created_at < (p_first - 5)::timestamptz and p.created_at >= (p_first - 15)::timestamptz
    and not exists (select 1 from public.purchase_lines l where l.product_id = p.id)
    and not exists (select 1 from public.product_movements m where m.product_id = p.id);
  -- Turnos do Handover (abertos na demonstração, ligados ao Roster) saem antes do Roster, com as anotações que pertencem a eles.
  create temporary table if not exists demo_shifts_tmp (id uuid) on commit drop;
  truncate demo_shifts_tmp;
  insert into demo_shifts_tmp
    select id from public.handover_shifts
    where staff_id = any (p_staff) or opened_by = any (p_staff) or closed_by = any (p_staff) or handed_to = any (p_staff) or confirmed_by = any (p_staff)
       or rota_shift_id in (select id from public.rota_shifts where staff_id = any (p_staff) or created_by = any (p_staff));
  delete from public.handover_entries e where e.shift_id in (select id from demo_shifts_tmp)
    and not exists (select 1 from public.maintenance_tickets t where t.handover_entry_id = e.id)
    and not exists (select 1 from public.warnings w where w.handover_entry_id = e.id)
    and not exists (select 1 from public.laundry_uses u where u.handover_entry_id = e.id);
  update public.handover_entries set shift_id = null where shift_id in (select id from demo_shifts_tmp);
  delete from public.handover_shifts where id in (select id from demo_shifts_tmp);
  delete from public.rota_shifts where staff_id = any (p_staff) or created_by = any (p_staff);
  delete from public.work_intervals where staff_id = any (p_staff) or created_by = any (p_staff);
  delete from public.vacations where staff_id = any (p_staff) or created_by = any (p_staff);
  update public.duty_posts set adjusted_by = null where adjusted_by = any (p_staff) and not (staff_id = any (p_staff));
  update public.duty_posts set ended_by = null where ended_by = any (p_staff) and not (staff_id = any (p_staff));
  delete from public.duty_posts where staff_id = any (p_staff);
  delete from public.stays where resident_id = any (p_res) and transfer_from_stay_id is not null;
  delete from public.stays where resident_id = any (p_res);
  delete from public.access_log where resident_id = any (p_res);
  delete from public.residents where id = any (p_res);
  -- O que estas contas fizeram em registros que ficam (ex.: mudar o status de um chamado de outra pessoa):
  -- colunas opcionais passam a "sem autor"; as obrigatórias saem. Lido das chaves estrangeiras.
  for v_fk in
    select c.conrelid::regclass::text tbl, a.attname col, a.attnotnull required
    from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.confrelid = 'public.staff'::regclass and cardinality(c.conkey) = 1
  loop
    if v_fk.required then
      execute format('delete from %s where %I = any ($1)', v_fk.tbl, v_fk.col) using p_staff;
    else
      execute format('update %s set %I = null where %I = any ($1) and not (%s)', v_fk.tbl, v_fk.col, v_fk.col,
                     case when v_fk.tbl = 'public.staff' then 'id = any ($1)' else 'false' end) using p_staff;
    end if;
  end loop;
  delete from public.staff where id = any (p_staff);
  get diagnostics n = row_count;
  delete from public.audit_log where actor_staff_id = any (p_staff)
     or (table_name = 'staff' and record_id = any (p_staff::text[]))
     or (table_name = 'residents' and record_id = any (p_res::text[]))
     or (table_name = 'stays' and coalesce(new_data, old_data) ->> 'resident_id' = any (p_res::text[]));
  return n;
end
$$;

create or replace function demo.set_triggers(p_enabled boolean)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_t text;
begin
  foreach v_t in array array['notification_reads', 'notifications', 'handover_mentions', 'laundry_uses', 'dinner_marks', 'dinner_services',
    'room_check_marks', 'room_check_runs', 'sightings', 'absences', 'no_shows', 'warnings', 'maintenance_reminder_snoozes',
    'maintenance_events', 'maintenance_tickets', 'handover_entries', 'task_signatures', 'task_extras', 'food_deliveries',
    'fridge_readings', 'product_movements', 'purchase_lines', 'purchases', 'products', 'rota_shifts', 'work_intervals', 'vacations',
    'duty_posts', 'stays', 'access_log', 'residents', 'staff', 'audit_log', 'task_templates', 'beds'] loop
    execute format('alter table public.%I %s trigger user', v_t, case when p_enabled then 'enable' else 'disable' end);
  end loop;
end
$$;

-- Remove tudo o que o seed criou e o que foi registrado sobre residentes/equipe demo.
create or replace function demo.clear()
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_staff uuid[] := demo.staff_ids();
  v_res uuid[];
  v_runs timestamptz[];
  v_first date;
  v_last date;
  n integer;
begin
  -- Demo = marcado como demo OU admitido pela equipe demo durante uma demonstração (ex.: admissões feitas pela interface).
  select coalesce(array_agg(id), '{}') into v_res from public.residents where is_demo or created_by = any (v_staff);
  select coalesce(array_agg(seeded_at), '{}'), min(first_day), max(last_day) into v_runs, v_first, v_last from demo.runs;
  -- Sem auditoria nem bloqueios durante a limpeza (as linhas de auditoria do seed também saem).
  perform demo.set_triggers(false);
  -- Avisos criados pelo seed (payload.demo); os sobre residentes demo saem em remove_records.
  delete from public.notification_reads where notification_id in (select id from public.notifications where payload ->> 'demo' = 'true');
  delete from public.notifications where payload ->> 'demo' = 'true';
  n := demo.remove_records(v_staff, v_res, v_first, v_last);
  delete from public.products p where p.created_at < (v_first - 5)::timestamptz and p.created_at >= (v_first - 15)::timestamptz
    and not exists (select 1 from public.purchase_lines l where l.product_id = p.id)
    and not exists (select 1 from public.product_movements m where m.product_id = p.id);
  delete from public.audit_log where occurred_at = any (v_runs);
  update public.task_templates set created_at = now() where created_at < coalesce(v_first, current_date) - 30;
  update public.beds set status = 'in_use', status_note = null where status_note like '%(demo)';
  delete from demo.runs;
  perform demo.set_triggers(true);
  -- Logins da equipe demo (no Supabase; no banco local é a réplica mínima do auth).
  delete from auth.users where email like '%@demo.ds-lodge.test';
  return jsonb_build_object('residents', cardinality(v_res), 'staff', n);
end
$$;

-- Sobras dos testes de ponta a ponta ("[TESTE]" e logins @ds-lodge.test), antes de semear a demo.
create or replace function demo.purge_test_data()
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_staff uuid[];
  v_res uuid[];
  n integer;
begin
  select coalesce(array_agg(id), '{}') into v_staff from public.staff where full_name like '[TESTE]%';
  select coalesce(array_agg(id), '{}') into v_res from public.residents where first_name like '[TESTE]%';
  perform demo.set_triggers(false);
  -- Avisos gerados pelas ações dos testes (sem autor na tabela).
  delete from public.notification_reads where notification_id in (
    select id from public.notifications where coalesce(payload ->> 'demo', '') <> 'true' and (
      resident_id = any (v_res)
      or payload ->> 'ticket_id' in (select id::text from public.maintenance_tickets where created_by = any (v_staff))
      or payload ->> 'reading_id' in (select id::text from public.fridge_readings where recorded_by = any (v_staff))
      or payload ->> 'staff_id' = any (v_staff::text[])
      or kind = 'coverage_below_minimum'));
  delete from public.notifications where coalesce(payload ->> 'demo', '') <> 'true' and (
      resident_id = any (v_res)
      or payload ->> 'ticket_id' in (select id::text from public.maintenance_tickets where created_by = any (v_staff))
      or payload ->> 'reading_id' in (select id::text from public.fridge_readings where recorded_by = any (v_staff))
      or payload ->> 'staff_id' = any (v_staff::text[])
      or kind = 'coverage_below_minimum');
  n := demo.remove_records(v_staff, v_res, date '2026-01-01', public.operational_day(now()));
  delete from public.products p where p.name like '[TESTE]%'
    and not exists (select 1 from public.purchase_lines l where l.product_id = p.id);
  perform demo.set_triggers(true);
  delete from auth.users where email like '%@ds-lodge.test';
  return jsonb_build_object('residents', cardinality(v_res), 'staff', n);
end
$$;

revoke all on all functions in schema demo from public;
revoke all on all tables in schema demo from public;
