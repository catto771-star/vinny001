-- Beta — gestão (escopo 4): Reports por período e casa, Purchases (lista fixa do Tesco) e Holidays (calendário anual).

-- ---------------------------------------------------------------------------
-- 4.4 Reports: qualquer período (dia, semana, quinzena, intervalo livre) e uma casa ou as duas.
-- O relatório mensal continua existindo como um caso particular.
-- ---------------------------------------------------------------------------
create or replace function public.check_period(p_lodges uuid[], p_from date, p_to date)
returns void
language plpgsql immutable
as $$
begin
  if p_lodges is null or cardinality(p_lodges) = 0 or p_from is null or p_to is null
     or not isfinite(p_from) or not isfinite(p_to) or p_from < date '2020-01-01' or p_to <= p_from
     or p_to - p_from > 400 or p_from > current_date + 366 then
    raise exception 'invalid_period' using errcode = '22023';
  end if;
end
$$;
revoke all on function public.check_period(uuid[], date, date) from public, anon;
grant execute on function public.check_period(uuid[], date, date) to authenticated;

create or replace function public.stays_present_at_any(p_lodges uuid[], p_at timestamptz)
returns setof public.stays
language sql stable
security definer
set search_path = public
as $$
  select * from public.stays
  where lodge_id = any (p_lodges) and admitted_at <= p_at and (ended_at is null or ended_at > p_at)
$$;
revoke all on function public.stays_present_at_any(uuid[], timestamptz) from public, anon;

create or replace function public.report_details_period(p_lodges uuid[], p_from date, p_to date, p_metric text)
returns table (ref_id text, label text, at timestamptz, extra text, lodge_id uuid)
language plpgsql stable
security definer
set search_path = public
as $$
declare
  v_from timestamptz;
  v_to timestamptz;
  v_d1 date := p_from;
  v_d2 date := p_to;
begin
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  perform public.check_period(p_lodges, p_from, p_to);
  v_from := public.operational_day_start(p_from);
  v_to := public.operational_day_start(p_to);
  return query
  select x.ref_id, x.label, x.at, x.extra, x.lodge_id from (
    -- Ocupação e movimentação
    select s.id::text as ref_id, r.first_name || ' ' || r.last_name as label, s.admitted_at as at, null::text as extra, 'occupancy.admissions' as metric, s.lodge_id as lodge_id
    from public.stays s join public.residents r on r.id = s.resident_id
    where p_metric = 'occupancy.admissions' and s.lodge_id = any (p_lodges) and s.transfer_from_stay_id is null and s.admitted_at >= v_from and s.admitted_at < v_to
    union all
    select s.id::text, r.first_name || ' ' || r.last_name, s.ended_at, s.out_reason, 'occupancy.outs', s.lodge_id
    from public.stays s join public.residents r on r.id = s.resident_id
    where p_metric = 'occupancy.outs' and s.lodge_id = any (p_lodges) and s.end_reason = 'out' and s.ended_at >= v_from and s.ended_at < v_to
    union all
    select s.id::text, r.first_name || ' ' || r.last_name, s.admitted_at, null, 'occupancy.transfers_in', s.lodge_id
    from public.stays s join public.residents r on r.id = s.resident_id
    where p_metric = 'occupancy.transfers_in' and s.lodge_id = any (p_lodges) and s.transfer_from_stay_id is not null and s.admitted_at >= v_from and s.admitted_at < v_to
    union all
    select s.id::text, r.first_name || ' ' || r.last_name, s.ended_at, null, 'occupancy.transfers_out', s.lodge_id
    from public.stays s join public.residents r on r.id = s.resident_id
    where p_metric = 'occupancy.transfers_out' and s.lodge_id = any (p_lodges) and s.end_reason = 'transfer' and s.ended_at >= v_from and s.ended_at < v_to
    -- Manutenção
    union all
    select t.id::text, t.location || ' — ' || t.description, t.created_at, t.priority, 'maintenance.opened', t.lodge_id
    from public.maintenance_tickets t where p_metric = 'maintenance.opened' and t.lodge_id = any (p_lodges) and t.created_at >= v_from and t.created_at < v_to
    union all
    select t.id::text, t.location || ' — ' || t.description, t.resolved_at, t.priority, 'maintenance.resolved', t.lodge_id
    from public.maintenance_tickets t where p_metric = 'maintenance.resolved' and t.lodge_id = any (p_lodges) and t.resolved_at >= v_from and t.resolved_at < v_to
    union all
    select t.id::text, t.location || ' — ' || t.description, t.deadline_at, t.priority, 'maintenance.overdue', t.lodge_id
    from public.maintenance_tickets t where p_metric = 'maintenance.overdue' and t.lodge_id = any (p_lodges) and t.status <> 'resolved' and t.deadline_at < least(now(), v_to)
    union all
    select t.id::text, t.location || ' — ' || t.description, t.created_at, t.status, 'maintenance.on_hold', t.lodge_id
    from public.maintenance_tickets t where p_metric = 'maintenance.on_hold' and t.lodge_id = any (p_lodges) and t.status = 'on_hold'
    union all
    select t.id::text, t.location || ' — ' || t.description, t.created_at, t.status, 'maintenance.in_progress', t.lodge_id
    from public.maintenance_tickets t where p_metric = 'maintenance.in_progress' and t.lodge_id = any (p_lodges) and t.status = 'in_progress'
    -- No Shows
    union all
    select n.id::text, r.first_name || ' ' || r.last_name, n.confirmed_at, n.operational_day::text, 'no_shows.total', n.lodge_id
    from public.no_shows n join public.residents r on r.id = n.resident_id
    where p_metric = 'no_shows.total' and n.lodge_id = any (p_lodges) and n.status = 'confirmed' and n.operational_day >= v_d1 and n.operational_day < v_d2
    union all
    select n.id::text, r.first_name || ' ' || r.last_name, n.undone_at, n.undo_reason, 'no_shows.undone', n.lodge_id
    from public.no_shows n join public.residents r on r.id = n.resident_id
    where p_metric = 'no_shows.undone' and n.lodge_id = any (p_lodges) and n.status = 'undone' and n.operational_day >= v_d1 and n.operational_day < v_d2
    -- Warnings
    union all
    select w.id::text, r.first_name || ' ' || r.last_name, w.issued_at, w.note, 'warnings.' || w.type, w.lodge_id
    from public.warnings w join public.residents r on r.id = w.resident_id
    where p_metric = 'warnings.' || w.type and w.lodge_id = any (p_lodges) and w.issued_at >= v_from and w.issued_at < v_to
    -- Temperatura
    union all
    select f.id::text, f.temperature::text || ' °C', f.recorded_at, f.note, 'temperature.alerts', f.lodge_id
    from public.fridge_readings f where p_metric = 'temperature.alerts' and f.lodge_id = any (p_lodges) and f.out_of_range and f.recorded_at >= v_from and f.recorded_at < v_to
    -- Dinner e lavanderia
    union all
    select m.id::text, r.first_name || ' ' || r.last_name, m.marked_at, ds.operational_day::text, 'dinner.served', ds.lodge_id
    from public.dinner_marks m join public.dinner_services ds on ds.id = m.service_id join public.residents r on r.id = m.resident_id
    where p_metric = 'dinner.served' and ds.lodge_id = any (p_lodges) and m.served and ds.operational_day >= v_d1 and ds.operational_day < v_d2
    union all
    select u.id::text, coalesce(r.first_name || ' ' || r.last_name, '—'), u.started_at, null, 'laundry.uses', u.lodge_id
    from public.laundry_uses u left join public.residents r on r.id = u.resident_id
    where p_metric = 'laundry.uses' and u.lodge_id = any (p_lodges) and u.started_at >= v_from and u.started_at < v_to
    -- Lançamentos fora do turno no Handover
    union all
    select e.id::text, e.body, e.occurred_at, e.late_reason, 'late_entries.total', e.lodge_id
    from public.handover_entries e where p_metric = 'late_entries.total' and e.lodge_id = any (p_lodges) and e.late_reason is not null and e.occurred_at >= v_from and e.occurred_at < v_to
  ) x
  order by x.at nulls last;
end
$$;

create or replace function public.report_period(p_lodges uuid[], p_from date, p_to date)
returns jsonb
language plpgsql stable
security definer
set search_path = public
as $$
declare
  v_d1 date := p_from;
  v_d2 date := p_to;
  v_from timestamptz;
  v_to timestamptz;
  v_until timestamptz;
  v_beds integer;
  v_has_dinner boolean;
  v_has_laundry boolean;
  n integer;
  r jsonb := '{}'::jsonb;
  cnt text;
begin
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  perform public.check_period(p_lodges, p_from, p_to);
  v_from := public.operational_day_start(v_d1);
  v_to := public.operational_day_start(v_d2);
  v_until := least(v_to, now());
  select count(*) into v_beds from public.beds b join public.rooms rm on rm.id = b.room_id where rm.lodge_id = any (p_lodges) and b.active and rm.active;
  select bool_or(has_dinner), bool_or(has_laundry) into v_has_dinner, v_has_laundry from public.lodges where id = any (p_lodges);

  -- Contagem pelo mesmo critério da lista de origem (report_details).
  r := jsonb_build_object(
    -- Ordem dos blocos definida pela gestão em 20/11 (JSON não guarda ordem de chaves).
    'order', jsonb_build_array('occupancy', 'maintenance', 'no_shows', 'warnings', 'dinner', 'laundry', 'hours',
                               'rounds_checks', 'temperature', 'movements', 'late_entries', 'coverage'),
    'occupancy', jsonb_build_object(
      'beds_total', v_beds,
      'occupied', (select count(*) from public.stays_present_at_any(p_lodges, v_until - interval '1 second')),
      'protected_by_absence', (select count(*) from public.stays_present_at_any(p_lodges, v_until - interval '1 second') s
                               where (public.active_absence(s.id, v_until - interval '1 second')).id is not null),
      'average_occupancy', coalesce((
        select round(avg((select count(*) from public.stays_present_at_any(p_lodges, public.slot_instant(d::date, '23:00')))), 1)
        from generate_series(v_d1, v_d2 - 1, interval '1 day') d
        where public.slot_instant(d::date, '23:00') <= now()), 0),
      'admissions', (select count(*) from public.report_details_period(p_lodges, p_from, p_to, 'occupancy.admissions')),
      'outs', (select count(*) from public.report_details_period(p_lodges, p_from, p_to, 'occupancy.outs')),
      'transfers_in', (select count(*) from public.report_details_period(p_lodges, p_from, p_to, 'occupancy.transfers_in')),
      'transfers_out', (select count(*) from public.report_details_period(p_lodges, p_from, p_to, 'occupancy.transfers_out'))
    ),
    'maintenance', jsonb_build_object(
      'opened', (select count(*) from public.report_details_period(p_lodges, p_from, p_to, 'maintenance.opened')),
      'resolved', (select count(*) from public.report_details_period(p_lodges, p_from, p_to, 'maintenance.resolved')),
      'overdue', (select count(*) from public.report_details_period(p_lodges, p_from, p_to, 'maintenance.overdue')),
      'on_hold', (select count(*) from public.report_details_period(p_lodges, p_from, p_to, 'maintenance.on_hold')),
      'in_progress', (select count(*) from public.report_details_period(p_lodges, p_from, p_to, 'maintenance.in_progress')),
      'reopened', (select count(*) from public.maintenance_events e join public.maintenance_tickets t on t.id = e.ticket_id
                   where t.lodge_id = any (p_lodges) and e.kind = 'status' and e.to_value = 'reopened' and e.at >= v_from and e.at < v_to),
      'average_hours_to_resolve', coalesce((select round(avg(extract(epoch from t.resolved_at - t.created_at) / 3600)::numeric, 1)
                   from public.maintenance_tickets t where t.lodge_id = any (p_lodges) and t.resolved_at >= v_from and t.resolved_at < v_to), 0),
      'by_priority', coalesce((select jsonb_object_agg(priority, c) from (
                   select t.priority, count(*) c from public.maintenance_tickets t
                   where t.lodge_id = any (p_lodges) and t.created_at >= v_from and t.created_at < v_to group by 1) x), '{}'::jsonb),
      'by_location', coalesce((select jsonb_agg(jsonb_build_object('location', location, 'count', c)) from (
                   select t.location, count(*) c from public.maintenance_tickets t
                   where t.lodge_id = any (p_lodges) and t.created_at >= v_from and t.created_at < v_to group by 1 order by 2 desc limit 5) x), '[]'::jsonb)
    ),
    'no_shows', jsonb_build_object(
      'total', (select count(*) from public.report_details_period(p_lodges, p_from, p_to, 'no_shows.total')),
      'residents_1', (select count(*) from (select resident_id from public.no_shows where lodge_id = any (p_lodges) and status = 'confirmed' and operational_day >= v_d1 and operational_day < v_d2 group by 1 having count(*) = 1) x),
      'residents_2', (select count(*) from (select resident_id from public.no_shows where lodge_id = any (p_lodges) and status = 'confirmed' and operational_day >= v_d1 and operational_day < v_d2 group by 1 having count(*) = 2) x),
      'residents_3_plus', (select count(*) from (select resident_id from public.no_shows where lodge_id = any (p_lodges) and status = 'confirmed' and operational_day >= v_d1 and operational_day < v_d2 group by 1 having count(*) >= 3) x),
      'beds_cancelled', (select count(*) from public.stays s where s.lodge_id = any (p_lodges) and s.end_reason = 'out' and s.ended_at >= v_from and s.ended_at < v_to
                         and exists (select 1 from public.no_shows n where n.stay_id = s.id and n.status = 'confirmed')),
      'undone', (select count(*) from public.report_details_period(p_lodges, p_from, p_to, 'no_shows.undone'))
    ),
    'warnings', jsonb_build_object(
      'verbal', (select count(*) from public.report_details_period(p_lodges, p_from, p_to, 'warnings.verbal')),
      'written', (select count(*) from public.report_details_period(p_lodges, p_from, p_to, 'warnings.written')),
      'final_written', (select count(*) from public.report_details_period(p_lodges, p_from, p_to, 'warnings.final_written'))
    ),
    'dinner', case when v_has_dinner then jsonb_build_object(
      'served', (select count(*) from public.report_details_period(p_lodges, p_from, p_to, 'dinner.served')),
      'services', (select count(*) from public.dinner_services where lodge_id = any (p_lodges) and operational_day >= v_d1 and operational_day < v_d2)
    ) end,
    'laundry', case when v_has_laundry then jsonb_build_object(
      'uses', (select count(*) from public.report_details_period(p_lodges, p_from, p_to, 'laundry.uses'))
    ) end,
    'hours', jsonb_build_object(
      -- Beta: horas do Roster (previsto = publicado; trabalhado = como aconteceu, até agora).
      'planned_minutes', coalesce((select sum(public.overlap_minutes(rs.planned_starts_at, rs.planned_ends_at, v_from, v_to)) from public.rota_shifts rs
                                   where rs.planned_starts_at is not null and (rs.lodge_id = any (p_lodges) or (rs.lodge_id is null and cardinality(p_lodges) > 1))), 0),
      'effective_minutes', coalesce((select sum(public.overlap_minutes(rs.starts_at, rs.ends_at, v_from, v_until)) from public.rota_shifts rs
                                     where rs.status = 'published' and v_until > v_from and (rs.lodge_id = any (p_lodges) or (rs.lodge_id is null and cardinality(p_lodges) > 1))), 0)
                           + coalesce((select sum(public.overlap_minutes(w.starts_at, w.ends_at, v_from, v_to)) from public.work_intervals w
                                       where w.lodge_id = any (p_lodges)), 0)
    ),
    'rounds_checks', jsonb_build_object(
      'checks_launched', (select count(*) from public.room_check_runs where lodge_id = any (p_lodges) and status = 'launched' and operational_day >= v_d1 and operational_day < v_d2),
      'checks_pending', (select coalesce(sum(cardinality(public.pending_slots(l.id, d::date, now()))), 0)
                         from generate_series(v_d1, v_d2 - 1, interval '1 day') d cross join unnest(p_lodges) l(id) where public.operational_day_start(d::date) <= now()),
      'rounds_recorded', (select count(*) from public.handover_entries where lodge_id = any (p_lodges) and kind = 'round' and operational_day >= v_d1 and operational_day < v_d2)
    ),
    'temperature', jsonb_build_object('alerts', (select count(*) from public.report_details_period(p_lodges, p_from, p_to, 'temperature.alerts'))),
    'movements', jsonb_build_object(
      'admissions', (select count(*) from public.report_details_period(p_lodges, p_from, p_to, 'occupancy.admissions')),
      'outs', (select count(*) from public.report_details_period(p_lodges, p_from, p_to, 'occupancy.outs')),
      'transfers', (select count(*) from public.report_details_period(p_lodges, p_from, p_to, 'occupancy.transfers_in'))
                   + (select count(*) from public.report_details_period(p_lodges, p_from, p_to, 'occupancy.transfers_out'))
    ),
    'late_entries', jsonb_build_object(
      'total', (select count(*) from public.report_details_period(p_lodges, p_from, p_to, 'late_entries.total')),
      'by_reason', coalesce((select jsonb_object_agg(late_reason, c) from (
                   select e.late_reason, count(*) c from public.handover_entries e
                   where e.lodge_id = any (p_lodges) and e.late_reason is not null and e.occurred_at >= v_from and e.occurred_at < v_to group by 1) x), '{}'::jsonb)
    ),
    'coverage', jsonb_build_object(
      'shifts_below_minimum', (select count(*) from public.coverage_gaps(v_from, v_until) g where g.lodge_id = any (p_lodges) or g.lodge_id is null)
    )
  );
  return r;
end
$$;

-- O mensal por casa vira um caso particular (mesmos números de antes).
create or replace function public.report_details(p_lodge uuid, p_month date, p_metric text)
returns table (ref_id text, label text, at timestamptz, extra text)
language plpgsql stable
security definer
set search_path = public
as $$
begin
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  perform public.check_month(p_month);
  return query select d.ref_id, d.label, d.at, d.extra
    from public.report_details_period(array[p_lodge], date_trunc('month', p_month)::date, (date_trunc('month', p_month) + interval '1 month')::date, p_metric) d;
end
$$;

create or replace function public.report_monthly(p_lodge uuid, p_month date)
returns jsonb
language plpgsql stable
security definer
set search_path = public
as $$
begin
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  perform public.check_month(p_month);
  return public.report_period(array[p_lodge], date_trunc('month', p_month)::date, (date_trunc('month', p_month) + interval '1 month')::date);
end
$$;

revoke all on function public.report_details_period(uuid[], date, date, text), public.report_period(uuid[], date, date) from public, anon;
grant execute on function public.report_details_period(uuid[], date, date, text), public.report_period(uuid[], date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 4.1 Purchases: a planilha do Tesco vira uma lista fixa de produtos recorrentes com
-- quantidade padrão (média histórica, editável) e um pedido por entrega (as duas casas juntas).
-- ---------------------------------------------------------------------------
create table public.shop_items (
  id uuid primary key default gen_random_uuid(),
  sort_order integer not null default 0,
  category text not null check (length(trim(category)) > 0),
  name text not null check (length(trim(name)) > 0),
  default_qty integer not null default 1 check (default_qty between 0 and 999),
  default_action text not null default 'buy' check (default_action in ('buy', 'dont_buy')),
  tesco_url text check (tesco_url is null or tesco_url ~ '^https://'),
  image_path text,
  active boolean not null default true,
  version integer not null default 1
);
create unique index shop_items_name_unique on public.shop_items(lower(name)) where active;
create trigger audit_shop_items after insert or update or delete on public.shop_items for each row execute function public.audit_row();
create trigger shop_items_bump_version before update on public.shop_items for each row execute function public.bump_version();

insert into public.shop_items (sort_order, category, name, default_qty, default_action, tesco_url, image_path) values
  (1, 'Dairy & Chilled', 'Milk', 18, 'buy', 'https://www.tesco.ie/shop/en-IE/products/260776455', '/products/milk.jpg'),
  (2, 'Dairy & Chilled', 'Cheese', 1, 'buy', 'https://www.tesco.ie/shop/en-IE/products/285926344', '/products/cheese.jpg'),
  (3, 'Dairy & Chilled', 'Ham', 1, 'buy', 'https://www.tesco.ie/shop/en-IE/products/315165947', '/products/ham.jpg'),
  (4, 'Dairy & Chilled', 'Yogurts', 4, 'buy', 'https://www.tesco.ie/shop/en-IE/products/309463111', '/products/yogurts.jpg'),
  (5, 'Dairy & Chilled', 'Butter', 1, 'buy', 'https://www.tesco.ie/shop/en-IE/products/271809741', '/products/butter.jpg'),
  (6, 'Meals & Bakery', 'Frozen Meals', 22, 'buy', 'https://www.tesco.ie/shop/en-IE/search?query=tesco+frozen+meals', '/products/frozen-meals.jpg'),
  (7, 'Meals & Bakery', 'Bread', 1, 'buy', 'https://www.tesco.ie/shop/en-IE/products/306278295', '/products/bread.jpg'),
  (8, 'Meals & Bakery', 'Cup Soup', 1, 'buy', 'https://www.tesco.ie/shop/en-IE/search?query=tesco+5+cup+soup', '/products/cup-soup.jpg'),
  (9, 'Drinks & Groceries', 'Orange Juice', 1, 'buy', 'https://www.tesco.ie/shop/en-IE/products/306949383', '/products/orange-juice.jpg'),
  (10, 'Drinks & Groceries', 'Coffee', 1, 'buy', 'https://www.tesco.ie/shop/en-IE/products/254557015', '/products/coffee.jpg'),
  (11, 'Drinks & Groceries', 'Tea Bags', 2, 'buy', 'https://www.tesco.ie/shop/en-IE/products/252263544', '/products/tea-bags.jpg'),
  (12, 'Drinks & Groceries', 'Corn Flakes', 2, 'buy', 'https://www.tesco.ie/shop/en-IE/products/254842766', '/products/corn-flakes.jpg'),
  (13, 'Drinks & Groceries', 'Wheat Biscuits', 1, 'buy', 'https://www.tesco.ie/shop/en-IE/products/289491021', '/products/wheat-biscuits.jpg'),
  (14, 'Drinks & Groceries', 'Sugar', 1, 'buy', 'https://www.tesco.ie/shop/en-IE/products/256210549', '/products/sugar.jpg'),
  (15, 'Drinks & Groceries', 'Salt', 1, 'dont_buy', 'https://www.tesco.ie/shop/en-IE/products/313164995', '/products/salt.jpg'),
  (16, 'Cleaning & Hygiene', 'Toilet Tissue', 1, 'buy', 'https://www.tesco.ie/shop/en-IE/products/252227824', '/products/toilet-tissue.jpg'),
  (17, 'Cleaning & Hygiene', 'Bin Bag 90L', 1, 'buy', 'https://www.tesco.ie/shop/en-IE/products/321963855', '/products/bin-bag-90l.jpg'),
  (18, 'Cleaning & Hygiene', 'Bin Bag - Small', 10, 'buy', 'https://www.tesco.ie/shop/en-IE/products/321848860', '/products/bin-bag-small.jpg'),
  (19, 'Cleaning & Hygiene', 'Floor Cleaner', 1, 'buy', 'https://www.tesco.ie/shop/en-IE/products/320567341', '/products/floor-cleaner.jpg'),
  (20, 'Cleaning & Hygiene', 'Multi Purpose', 1, 'buy', 'https://www.tesco.ie/shop/en-IE/products/312346920', '/products/multi-purpose.jpg'),
  (21, 'Cleaning & Hygiene', 'Washing Up Liquid', 1, 'buy', 'https://www.tesco.ie/shop/en-IE/products/311945178', '/products/washing-up-liquid.jpg'),
  (22, 'Cleaning & Hygiene', 'Bleach', 1, 'buy', 'https://www.tesco.ie/shop/en-IE/products/257841394', '/products/bleach.jpg'),
  (23, 'Cleaning & Hygiene', 'Cream Cleaner', 1, 'buy', 'https://www.tesco.ie/shop/en-IE/products/255281212', '/products/cream-cleaner.jpg'),
  (24, 'Cleaning & Hygiene', 'Dish Sponge', 1, 'dont_buy', 'https://www.tesco.ie/shop/en-IE/products/315846560', '/products/dish-sponge.jpg'),
  (25, 'Cleaning & Hygiene', 'Glass Cleaning', 2, 'buy', 'https://www.tesco.ie/shop/en-IE/products/316430848', '/products/glass-cleaning.jpg'),
  (26, 'Cleaning & Hygiene', 'Hand Soap', 2, 'dont_buy', 'https://www.tesco.ie/shop/en-IE/products/323433086', '/products/hand-soap.jpg'),
  (27, 'Cleaning & Hygiene', 'Air Freshener', 1, 'buy', 'https://www.tesco.ie/shop/en-IE/search?query=air+freshener', '/products/air-freshener.jpg');

create table public.shop_orders (
  id uuid primary key default gen_random_uuid(),
  delivery_date date not null,
  notes text,
  status text not null default 'draft' check (status in ('draft', 'placed')),
  created_by uuid not null references public.staff(id),
  created_at timestamptz not null default now(),
  placed_at timestamptz
);
create trigger audit_shop_orders after insert or update or delete on public.shop_orders for each row execute function public.audit_row();

create table public.shop_order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.shop_orders(id) on delete cascade,
  item_id uuid not null references public.shop_items(id),
  standard_qty integer not null check (standard_qty >= 0),
  action text not null check (action in ('standard', 'more', 'less', 'dont')),
  delta integer not null default 0 check (delta between 0 and 999),
  final_qty integer generated always as (
    case action when 'standard' then standard_qty when 'more' then standard_qty + delta
                when 'less' then greatest(standard_qty - delta, 0) else 0 end) stored,
  unit_price numeric(8, 2) check (unit_price is null or unit_price between 0 and 99999),
  unique (order_id, item_id)
);
create trigger audit_shop_order_lines after insert or update or delete on public.shop_order_lines for each row execute function public.audit_row();

alter table public.shop_items enable row level security;
alter table public.shop_orders enable row level security;
alter table public.shop_order_lines enable row level security;
revoke all on public.shop_items, public.shop_orders, public.shop_order_lines from anon, authenticated;
grant select on public.shop_items, public.shop_orders, public.shop_order_lines to authenticated;
create policy shop_items_read on public.shop_items for select to authenticated using (public.is_management());
create policy shop_orders_read on public.shop_orders for select to authenticated using (public.is_management());
create policy shop_lines_read on public.shop_order_lines for select to authenticated using (public.is_management());

create or replace function public.create_shop_order(p_delivery date, p_notes text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  if p_delivery is null or not isfinite(p_delivery) or p_delivery < current_date - 30 or p_delivery > current_date + 366 then
    raise exception 'invalid_date' using errcode = '22023';
  end if;
  insert into public.shop_orders (delivery_date, notes, created_by)
  values (p_delivery, nullif(trim(p_notes), ''), public.current_staff_id())
  returning id into v_id;
  insert into public.shop_order_lines (order_id, item_id, standard_qty, action)
  select v_id, i.id, i.default_qty, case i.default_action when 'buy' then 'standard' else 'dont' end
  from public.shop_items i where i.active;
  return v_id;
end
$$;

create or replace function public.set_shop_line(p_line uuid, p_action text, p_delta integer, p_unit_price numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  if p_action is null or p_action not in ('standard', 'more', 'less', 'dont') then raise exception 'invalid_action' using errcode = '22023'; end if;
  if coalesce(p_delta, 0) < 0 or coalesce(p_delta, 0) > 999 then raise exception 'invalid_quantity' using errcode = '22023'; end if;
  if p_unit_price is not null and (p_unit_price < 0 or p_unit_price > 99999) then raise exception 'invalid_price' using errcode = '22023'; end if;
  update public.shop_order_lines
     set action = p_action, delta = case when p_action in ('more', 'less') then coalesce(p_delta, 0) else 0 end,
         unit_price = round(p_unit_price, 2)
   where id = p_line;
  if not found then raise exception 'line_not_found' using errcode = 'P0002'; end if;
end
$$;

create or replace function public.set_shop_order(p_order uuid, p_delivery date, p_notes text, p_placed boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  if p_delivery is null or not isfinite(p_delivery) or p_delivery < current_date - 366 or p_delivery > current_date + 366 then
    raise exception 'invalid_date' using errcode = '22023';
  end if;
  update public.shop_orders
     set delivery_date = p_delivery, notes = nullif(trim(p_notes), ''),
         status = case when p_placed then 'placed' else 'draft' end,
         placed_at = case when p_placed then coalesce(placed_at, now()) end
   where id = p_order;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
end
$$;

create or replace function public.update_shop_item(p_id uuid, p_name text, p_category text, p_default_qty integer, p_default_action text, p_tesco_url text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_category), '') = '' then raise exception 'name_required' using errcode = '22023'; end if;
  if p_default_qty is null or p_default_qty < 0 or p_default_qty > 999 then raise exception 'invalid_quantity' using errcode = '22023'; end if;
  if p_default_action is null or p_default_action not in ('buy', 'dont_buy') then raise exception 'invalid_action' using errcode = '22023'; end if;
  if nullif(trim(p_tesco_url), '') is not null and trim(p_tesco_url) !~ '^https://' then raise exception 'invalid_url' using errcode = '22023'; end if;
  if p_id is null then
    insert into public.shop_items (sort_order, category, name, default_qty, default_action, tesco_url)
    values ((select coalesce(max(sort_order), 0) + 1 from public.shop_items), trim(p_category), trim(p_name), p_default_qty, p_default_action, nullif(trim(p_tesco_url), ''))
    returning id into v_id;
  else
    update public.shop_items
       set name = trim(p_name), category = trim(p_category), default_qty = p_default_qty, default_action = p_default_action,
           tesco_url = nullif(trim(p_tesco_url), '')
     where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'item_not_found' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end
$$;

create or replace function public.shop_order_total(p_order uuid)
returns jsonb
language plpgsql stable
security definer
set search_path = public
as $$
begin
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  return (select jsonb_build_object(
            'total', coalesce(sum(final_qty * unit_price), 0),
            'items', count(*) filter (where final_qty > 0),
            'lines_without_price', count(*) filter (where final_qty > 0 and unit_price is null))
          from public.shop_order_lines where order_id = p_order);
end
$$;

revoke all on function public.create_shop_order(date, text), public.set_shop_line(uuid, text, integer, numeric),
  public.set_shop_order(uuid, date, text, boolean), public.update_shop_item(uuid, text, text, integer, text, text),
  public.shop_order_total(uuid) from public, anon;
grant execute on function public.create_shop_order(date, text), public.set_shop_line(uuid, text, integer, numeric),
  public.set_shop_order(uuid, date, text, boolean), public.update_shop_item(uuid, text, text, integer, text, text),
  public.shop_order_total(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4.2 Holidays: Under Review (amarelo), Approved (laranja) e datas bloqueadas (vermelho).
-- A equipe vê o calendário sem nomes; o Admin vê e edita com nomes.
-- ---------------------------------------------------------------------------
alter table public.vacations drop constraint if exists vacations_status_check;
update public.vacations set status = 'approved' where status = 'active';
alter table public.vacations alter column status set default 'approved';
alter table public.vacations add constraint vacations_status_check check (status in ('under_review', 'approved', 'cancelled'));

create table public.holiday_locks (
  id uuid primary key default gen_random_uuid(),
  starts_on date not null,
  ends_on date not null,
  note text,
  active boolean not null default true,
  created_by uuid not null references public.staff(id),
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create trigger audit_holiday_locks after insert or update or delete on public.holiday_locks for each row execute function public.audit_row();
alter table public.holiday_locks enable row level security;
revoke all on public.holiday_locks from anon, authenticated;
grant select on public.holiday_locks to authenticated;
create policy holiday_locks_read on public.holiday_locks for select to authenticated using (public.is_active_staff());

drop function if exists public.register_vacation(uuid, date, date, text);
create or replace function public.register_vacation(p_staff uuid, p_start date, p_end date, p_note text, p_status text default 'approved')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_conflicts integer;
begin
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  if p_start is null or p_end is null or p_end < p_start or not isfinite(p_start) or not isfinite(p_end) or p_end - p_start > 366 then
    raise exception 'invalid_period' using errcode = '22023';
  end if;
  if coalesce(p_status, '') not in ('under_review', 'approved') then raise exception 'invalid_status' using errcode = '22023'; end if;
  if not exists (select 1 from public.staff where id = p_staff and active and role <> 'station') then
    raise exception 'staff_not_found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.holiday_locks l where l.active and l.starts_on <= p_end and l.ends_on >= p_start) then
    raise exception 'dates_locked' using errcode = '22023';
  end if;
  insert into public.vacations (staff_id, starts_on, ends_on, note, status, created_by)
  values (p_staff, p_start, p_end, nullif(trim(p_note), ''), p_status, public.current_staff_id())
  returning id into v_id;
  v_conflicts := public.vacation_conflicts(p_staff, p_start, p_end);
  if v_conflicts > 0 then
    insert into public.notifications (kind, audience, payload)
    values ('vacation_conflict', 'management', jsonb_build_object('vacation_id', v_id, 'staff_id', p_staff, 'conflicts', v_conflicts,
            'name', (select full_name from public.staff where id = p_staff)));
  end if;
  return jsonb_build_object('id', v_id, 'conflicts', v_conflicts);
end
$$;

create or replace function public.set_vacation_status(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  if coalesce(p_status, '') not in ('under_review', 'approved', 'cancelled') then raise exception 'invalid_status' using errcode = '22023'; end if;
  update public.vacations set status = p_status where id = p_id;
  if not found then raise exception 'vacation_not_found' using errcode = 'P0002'; end if;
end
$$;

create or replace function public.lock_holiday_dates(p_start date, p_end date, p_note text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  if p_start is null or p_end is null or p_end < p_start or not isfinite(p_start) or not isfinite(p_end) or p_end - p_start > 366 then
    raise exception 'invalid_period' using errcode = '22023';
  end if;
  insert into public.holiday_locks (starts_on, ends_on, note, created_by)
  values (p_start, p_end, nullif(trim(p_note), ''), public.current_staff_id())
  returning id into v_id;
  return v_id;
end
$$;

create or replace function public.unlock_holiday_dates(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  update public.holiday_locks set active = false where id = p_id;
end
$$;

-- Um dia por linha (só os dias com algo). Bloqueio vence aprovado, que vence em análise.
create or replace function public.holiday_calendar(p_year integer)
returns table (day date, status text, people jsonb)
language plpgsql stable
security definer
set search_path = public
as $$
declare
  v_admin boolean := public.is_management();
begin
  if not public.is_active_staff() then raise exception 'not_authorised' using errcode = '42501'; end if;
  if p_year is null or p_year < 2020 or p_year > extract(year from current_date)::int + 2 then
    raise exception 'invalid_period' using errcode = '22023';
  end if;
  return query
  with days as (
    select d::date as day from generate_series(make_date(p_year, 1, 1), make_date(p_year, 12, 31), interval '1 day') d
  ), v as (
    select ds.day, va.status, s.full_name, va.id
    from days ds join public.vacations va on va.status in ('under_review', 'approved') and ds.day between va.starts_on and va.ends_on
    join public.staff s on s.id = va.staff_id
  ), l as (
    select ds.day, string_agg(coalesce(hl.note, ''), ' · ') as note
    from days ds join public.holiday_locks hl on hl.active and ds.day between hl.starts_on and hl.ends_on group by ds.day
  )
  select ds.day,
         case when l.day is not null then 'locked'
              when bool_or(v.status = 'approved') then 'approved'
              else 'under_review' end,
         case when v_admin then jsonb_build_object(
                'names', coalesce(jsonb_agg(jsonb_build_object('name', v.full_name, 'status', v.status, 'vacation_id', v.id)) filter (where v.day is not null), '[]'::jsonb),
                'lock_note', l.note)
              end
  from days ds
  left join v on v.day = ds.day
  left join l on l.day = ds.day
  where v.day is not null or l.day is not null
  group by ds.day, l.day, l.note
  order by ds.day;
end
$$;

revoke all on function public.register_vacation(uuid, date, date, text, text), public.set_vacation_status(uuid, text),
  public.lock_holiday_dates(date, date, text), public.unlock_holiday_dates(uuid), public.holiday_calendar(integer) from public, anon;
grant execute on function public.register_vacation(uuid, date, date, text, text), public.set_vacation_status(uuid, text),
  public.lock_holiday_dates(date, date, text), public.unlock_holiday_dates(uuid), public.holiday_calendar(integer) to authenticated;
