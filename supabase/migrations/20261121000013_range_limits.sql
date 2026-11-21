-- Varredura em massa: um intervalo absurdo (ano 1 até 2099) fazia coverage_gaps gerar dias sem
-- limite e travar o banco. Intervalos agora são validados (início < fim, no máximo 62 dias).
create or replace function public.check_range(p_from timestamptz, p_to timestamptz)
returns void
language plpgsql immutable
as $$
begin
  if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to) or p_to <= p_from then
    raise exception 'invalid_range' using errcode = '22023';
  end if;
  if p_to - p_from > interval '62 days' then raise exception 'range_too_large' using errcode = '22023'; end if;
end
$$;
revoke all on function public.check_range(timestamptz, timestamptz) from public, anon;
grant execute on function public.check_range(timestamptz, timestamptz) to authenticated;

create or replace function public.coverage_gaps(p_from timestamptz, p_to timestamptz)
returns table (lodge_id uuid, lodge_code text, kind text, starts_at timestamptz, ends_at timestamptz)
language plpgsql stable
security definer
set search_path = public
as $$
begin
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  perform public.check_range(p_from, p_to);
  return query
  with days as (
    select d::date as d from generate_series(public.operational_day(p_from), public.operational_day(p_to - interval '1 second'), interval '1 day') d
  ),
  windows as (
    select l.id as lodge_id, l.code as lodge_code, w.kind, w.s, w.e
    from days
    cross join public.lodges l
    cross join lateral (values
      ('day', public.slot_instant(days.d, '07:00'), public.slot_instant(days.d, '19:00')),
      ('night', public.slot_instant(days.d, '19:00'), public.slot_instant(days.d + 1, '07:00'))) w(kind, s, e)
    where l.active
    union all
    select null, null, 'float', public.slot_instant(days.d, '12:00'), public.slot_instant(days.d, '00:00')
    from days
  )
  select w.lodge_id, w.lodge_code, w.kind, w.s, w.e
  from windows w
  where w.s < p_to and w.e > p_from
    and not exists (
      select 1 from public.rota_shifts r
      where r.status <> 'cancelled'
        and tstzrange(r.starts_at, r.ends_at) && tstzrange(w.s, w.e)
        and ((w.kind = 'float' and r.function = 'float') or (w.kind <> 'float' and r.function = 'office' and r.lodge_id = w.lodge_id)))
  order by w.s, w.lodge_code nulls last;
end
$$;

create or replace function public.publish_rota(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_gaps integer;
begin
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  perform public.check_range(p_from, p_to);
  update public.rota_shifts set status = 'published', published_at = now()
   where status = 'draft' and starts_at < p_to and ends_at > p_from;
  get diagnostics v_count = row_count;
  select count(*) into v_gaps from public.coverage_gaps(p_from, p_to);
  if v_gaps > 0 then
    insert into public.notifications (kind, audience, payload)
    values ('coverage_below_minimum', 'management', jsonb_build_object('gaps', v_gaps, 'from', p_from, 'to', p_to));
  end if;
  return jsonb_build_object('published', v_count, 'gaps', v_gaps);
end
$$;

-- Relatório: mês precisa ser uma data finita e plausível (infinity fazia o relatório girar sem fim).
create or replace function public.check_month(p_month date)
returns void
language plpgsql immutable
as $$
begin
  if p_month is null or not isfinite(p_month) or p_month < date '2020-01-01' or p_month > (current_date + 366) then
    raise exception 'invalid_month' using errcode = '22023';
  end if;
end
$$;
revoke all on function public.check_month(date) from public, anon;
grant execute on function public.check_month(date) to authenticated;

create or replace function public.report_details(p_lodge uuid, p_month date, p_metric text)
returns table (ref_id text, label text, at timestamptz, extra text)
language plpgsql stable
security definer
set search_path = public
as $$
declare
  v_from timestamptz := public.operational_day_start(date_trunc('month', p_month)::date);
  v_to timestamptz := public.operational_day_start((date_trunc('month', p_month) + interval '1 month')::date);
  v_d1 date := date_trunc('month', p_month)::date;
  v_d2 date := (date_trunc('month', p_month) + interval '1 month')::date;
begin
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  perform public.check_month(p_month);
  return query
  select x.ref_id, x.label, x.at, x.extra from (
    -- Ocupação e movimentação
    select s.id::text as ref_id, r.first_name || ' ' || r.last_name as label, s.admitted_at as at, null::text as extra, 'occupancy.admissions' as metric
    from public.stays s join public.residents r on r.id = s.resident_id
    where p_metric = 'occupancy.admissions' and s.lodge_id = p_lodge and s.transfer_from_stay_id is null and s.admitted_at >= v_from and s.admitted_at < v_to
    union all
    select s.id::text, r.first_name || ' ' || r.last_name, s.ended_at, s.out_reason, 'occupancy.outs'
    from public.stays s join public.residents r on r.id = s.resident_id
    where p_metric = 'occupancy.outs' and s.lodge_id = p_lodge and s.end_reason = 'out' and s.ended_at >= v_from and s.ended_at < v_to
    union all
    select s.id::text, r.first_name || ' ' || r.last_name, s.admitted_at, null, 'occupancy.transfers_in'
    from public.stays s join public.residents r on r.id = s.resident_id
    where p_metric = 'occupancy.transfers_in' and s.lodge_id = p_lodge and s.transfer_from_stay_id is not null and s.admitted_at >= v_from and s.admitted_at < v_to
    union all
    select s.id::text, r.first_name || ' ' || r.last_name, s.ended_at, null, 'occupancy.transfers_out'
    from public.stays s join public.residents r on r.id = s.resident_id
    where p_metric = 'occupancy.transfers_out' and s.lodge_id = p_lodge and s.end_reason = 'transfer' and s.ended_at >= v_from and s.ended_at < v_to
    -- Manutenção
    union all
    select t.id::text, t.location || ' — ' || t.description, t.created_at, t.priority, 'maintenance.opened'
    from public.maintenance_tickets t where p_metric = 'maintenance.opened' and t.lodge_id = p_lodge and t.created_at >= v_from and t.created_at < v_to
    union all
    select t.id::text, t.location || ' — ' || t.description, t.resolved_at, t.priority, 'maintenance.resolved'
    from public.maintenance_tickets t where p_metric = 'maintenance.resolved' and t.lodge_id = p_lodge and t.resolved_at >= v_from and t.resolved_at < v_to
    union all
    select t.id::text, t.location || ' — ' || t.description, t.deadline_at, t.priority, 'maintenance.overdue'
    from public.maintenance_tickets t where p_metric = 'maintenance.overdue' and t.lodge_id = p_lodge and t.status <> 'resolved' and t.deadline_at < least(now(), v_to)
    union all
    select t.id::text, t.location || ' — ' || t.description, t.created_at, t.status, 'maintenance.on_hold'
    from public.maintenance_tickets t where p_metric = 'maintenance.on_hold' and t.lodge_id = p_lodge and t.status = 'on_hold'
    union all
    select t.id::text, t.location || ' — ' || t.description, t.created_at, t.status, 'maintenance.in_progress'
    from public.maintenance_tickets t where p_metric = 'maintenance.in_progress' and t.lodge_id = p_lodge and t.status = 'in_progress'
    -- No Shows
    union all
    select n.id::text, r.first_name || ' ' || r.last_name, n.confirmed_at, n.operational_day::text, 'no_shows.total'
    from public.no_shows n join public.residents r on r.id = n.resident_id
    where p_metric = 'no_shows.total' and n.lodge_id = p_lodge and n.status = 'confirmed' and n.operational_day >= v_d1 and n.operational_day < v_d2
    union all
    select n.id::text, r.first_name || ' ' || r.last_name, n.undone_at, n.undo_reason, 'no_shows.undone'
    from public.no_shows n join public.residents r on r.id = n.resident_id
    where p_metric = 'no_shows.undone' and n.lodge_id = p_lodge and n.status = 'undone' and n.operational_day >= v_d1 and n.operational_day < v_d2
    -- Warnings
    union all
    select w.id::text, r.first_name || ' ' || r.last_name, w.issued_at, w.note, 'warnings.' || w.type
    from public.warnings w join public.residents r on r.id = w.resident_id
    where p_metric = 'warnings.' || w.type and w.lodge_id = p_lodge and w.issued_at >= v_from and w.issued_at < v_to
    -- Temperatura
    union all
    select f.id::text, f.temperature::text || ' °C', f.recorded_at, f.note, 'temperature.alerts'
    from public.fridge_readings f where p_metric = 'temperature.alerts' and f.lodge_id = p_lodge and f.out_of_range and f.recorded_at >= v_from and f.recorded_at < v_to
    -- Dinner e lavanderia
    union all
    select m.id::text, r.first_name || ' ' || r.last_name, m.marked_at, ds.operational_day::text, 'dinner.served'
    from public.dinner_marks m join public.dinner_services ds on ds.id = m.service_id join public.residents r on r.id = m.resident_id
    where p_metric = 'dinner.served' and ds.lodge_id = p_lodge and m.served and ds.operational_day >= v_d1 and ds.operational_day < v_d2
    union all
    select u.id::text, coalesce(r.first_name || ' ' || r.last_name, '—'), u.started_at, null, 'laundry.uses'
    from public.laundry_uses u left join public.residents r on r.id = u.resident_id
    where p_metric = 'laundry.uses' and u.lodge_id = p_lodge and u.started_at >= v_from and u.started_at < v_to
    -- Lançamentos fora do turno no Handover
    union all
    select e.id::text, e.body, e.occurred_at, e.late_reason, 'late_entries.total'
    from public.handover_entries e where p_metric = 'late_entries.total' and e.lodge_id = p_lodge and e.late_reason is not null and e.occurred_at >= v_from and e.occurred_at < v_to
  ) x
  order by x.at nulls last;
end
$$;

create or replace function public.report_monthly(p_lodge uuid, p_month date)
returns jsonb
language plpgsql stable
security definer
set search_path = public
as $$
declare
  v_d1 date := date_trunc('month', p_month)::date;
  v_d2 date := (date_trunc('month', p_month) + interval '1 month')::date;
  v_from timestamptz := public.operational_day_start(v_d1);
  v_to timestamptz := public.operational_day_start(v_d2);
  v_until timestamptz := least(v_to, now());
  v_beds integer;
  v_has_dinner boolean;
  v_has_laundry boolean;
  n integer;
  r jsonb := '{}'::jsonb;
  cnt text;
begin
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  perform public.check_month(p_month);
  select count(*) into v_beds from public.beds b join public.rooms rm on rm.id = b.room_id where rm.lodge_id = p_lodge and b.active and rm.active;
  select has_dinner, has_laundry into v_has_dinner, v_has_laundry from public.lodges where id = p_lodge;

  -- Contagem pelo mesmo critério da lista de origem (report_details).
  r := jsonb_build_object(
    -- Ordem dos blocos definida pela gestão em 20/11 (JSON não guarda ordem de chaves).
    'order', jsonb_build_array('occupancy', 'maintenance', 'no_shows', 'warnings', 'dinner', 'laundry', 'hours', 'tasks',
                               'rounds_checks', 'temperature', 'movements', 'late_entries', 'coverage'),
    'occupancy', jsonb_build_object(
      'beds_total', v_beds,
      'occupied', (select count(*) from public.stays_present_at(p_lodge, v_until - interval '1 second')),
      'protected_by_absence', (select count(*) from public.stays_present_at(p_lodge, v_until - interval '1 second') s
                               where (public.active_absence(s.id, v_until - interval '1 second')).id is not null),
      'average_occupancy', coalesce((
        select round(avg((select count(*) from public.stays_present_at(p_lodge, public.slot_instant(d::date, '23:00')))), 1)
        from generate_series(v_d1, v_d2 - 1, interval '1 day') d
        where public.slot_instant(d::date, '23:00') <= now()), 0),
      'admissions', (select count(*) from public.report_details(p_lodge, p_month, 'occupancy.admissions')),
      'outs', (select count(*) from public.report_details(p_lodge, p_month, 'occupancy.outs')),
      'transfers_in', (select count(*) from public.report_details(p_lodge, p_month, 'occupancy.transfers_in')),
      'transfers_out', (select count(*) from public.report_details(p_lodge, p_month, 'occupancy.transfers_out'))
    ),
    'maintenance', jsonb_build_object(
      'opened', (select count(*) from public.report_details(p_lodge, p_month, 'maintenance.opened')),
      'resolved', (select count(*) from public.report_details(p_lodge, p_month, 'maintenance.resolved')),
      'overdue', (select count(*) from public.report_details(p_lodge, p_month, 'maintenance.overdue')),
      'on_hold', (select count(*) from public.report_details(p_lodge, p_month, 'maintenance.on_hold')),
      'in_progress', (select count(*) from public.report_details(p_lodge, p_month, 'maintenance.in_progress')),
      'reopened', (select count(*) from public.maintenance_events e join public.maintenance_tickets t on t.id = e.ticket_id
                   where t.lodge_id = p_lodge and e.kind = 'status' and e.to_value = 'reopened' and e.at >= v_from and e.at < v_to),
      'average_hours_to_resolve', coalesce((select round(avg(extract(epoch from t.resolved_at - t.created_at) / 3600)::numeric, 1)
                   from public.maintenance_tickets t where t.lodge_id = p_lodge and t.resolved_at >= v_from and t.resolved_at < v_to), 0),
      'by_priority', coalesce((select jsonb_object_agg(priority, c) from (
                   select t.priority, count(*) c from public.maintenance_tickets t
                   where t.lodge_id = p_lodge and t.created_at >= v_from and t.created_at < v_to group by 1) x), '{}'::jsonb),
      'by_location', coalesce((select jsonb_agg(jsonb_build_object('location', location, 'count', c)) from (
                   select t.location, count(*) c from public.maintenance_tickets t
                   where t.lodge_id = p_lodge and t.created_at >= v_from and t.created_at < v_to group by 1 order by 2 desc limit 5) x), '[]'::jsonb)
    ),
    'no_shows', jsonb_build_object(
      'total', (select count(*) from public.report_details(p_lodge, p_month, 'no_shows.total')),
      'residents_1', (select count(*) from (select resident_id from public.no_shows where lodge_id = p_lodge and status = 'confirmed' and operational_day >= v_d1 and operational_day < v_d2 group by 1 having count(*) = 1) x),
      'residents_2', (select count(*) from (select resident_id from public.no_shows where lodge_id = p_lodge and status = 'confirmed' and operational_day >= v_d1 and operational_day < v_d2 group by 1 having count(*) = 2) x),
      'residents_3_plus', (select count(*) from (select resident_id from public.no_shows where lodge_id = p_lodge and status = 'confirmed' and operational_day >= v_d1 and operational_day < v_d2 group by 1 having count(*) >= 3) x),
      'beds_cancelled', (select count(*) from public.stays s where s.lodge_id = p_lodge and s.end_reason = 'out' and s.ended_at >= v_from and s.ended_at < v_to
                         and exists (select 1 from public.no_shows n where n.stay_id = s.id and n.status = 'confirmed')),
      'undone', (select count(*) from public.report_details(p_lodge, p_month, 'no_shows.undone'))
    ),
    'warnings', jsonb_build_object(
      'verbal', (select count(*) from public.report_details(p_lodge, p_month, 'warnings.verbal')),
      'written', (select count(*) from public.report_details(p_lodge, p_month, 'warnings.written')),
      'final_written', (select count(*) from public.report_details(p_lodge, p_month, 'warnings.final_written'))
    ),
    'dinner', case when v_has_dinner then jsonb_build_object(
      'served', (select count(*) from public.report_details(p_lodge, p_month, 'dinner.served')),
      'services', (select count(*) from public.dinner_services where lodge_id = p_lodge and operational_day >= v_d1 and operational_day < v_d2)
    ) end,
    'laundry', case when v_has_laundry then jsonb_build_object(
      'uses', (select count(*) from public.report_details(p_lodge, p_month, 'laundry.uses'))
    ) end,
    'hours', jsonb_build_object(
      'planned_minutes', coalesce((select sum(public.overlap_minutes(rs.starts_at, rs.ends_at, v_from, v_to)) from public.rota_shifts rs
                                   where rs.lodge_id = p_lodge and rs.status <> 'cancelled'), 0),
      'effective_minutes', coalesce((select sum(public.overlap_minutes(d.started_at, coalesce(d.ended_at, now()), v_from, v_to)) from public.duty_posts d
                                     where d.lodge_id = p_lodge), 0)
                           + coalesce((select sum(public.overlap_minutes(w.starts_at, w.ends_at, v_from, v_to)) from public.work_intervals w
                                       where w.lodge_id = p_lodge), 0)
    ),
    'tasks', (select jsonb_build_object('done', count(*) filter (where jsonb_array_length(t.signatures) > 0),
                                        'not_done', count(*) filter (where jsonb_array_length(t.signatures) = 0))
              from generate_series(v_d1, v_d2 - 1, interval '1 day') d
              cross join unnest(array['day', 'night']) sh
              cross join lateral public.shift_tasks(p_lodge, d::date, sh) t
              where public.shift_end_of(d::date, sh) <= now()),
    'rounds_checks', jsonb_build_object(
      'checks_launched', (select count(*) from public.room_check_runs where lodge_id = p_lodge and status = 'launched' and operational_day >= v_d1 and operational_day < v_d2),
      'checks_pending', (select coalesce(sum(cardinality(public.pending_slots(p_lodge, d::date, now()))), 0)
                         from generate_series(v_d1, v_d2 - 1, interval '1 day') d where public.operational_day_start(d::date) <= now()),
      'rounds_recorded', (select count(*) from public.handover_entries where lodge_id = p_lodge and kind = 'round' and operational_day >= v_d1 and operational_day < v_d2)
    ),
    'temperature', jsonb_build_object('alerts', (select count(*) from public.report_details(p_lodge, p_month, 'temperature.alerts'))),
    'movements', jsonb_build_object(
      'admissions', (select count(*) from public.report_details(p_lodge, p_month, 'occupancy.admissions')),
      'outs', (select count(*) from public.report_details(p_lodge, p_month, 'occupancy.outs')),
      'transfers', (select count(*) from public.report_details(p_lodge, p_month, 'occupancy.transfers_in'))
                   + (select count(*) from public.report_details(p_lodge, p_month, 'occupancy.transfers_out'))
    ),
    'late_entries', jsonb_build_object(
      'total', (select count(*) from public.report_details(p_lodge, p_month, 'late_entries.total')),
      'by_reason', coalesce((select jsonb_object_agg(late_reason, c) from (
                   select e.late_reason, count(*) c from public.handover_entries e
                   where e.lodge_id = p_lodge and e.late_reason is not null and e.occurred_at >= v_from and e.occurred_at < v_to group by 1) x), '{}'::jsonb)
    ),
    'coverage', jsonb_build_object(
      'shifts_below_minimum', (select count(*) from public.coverage_gaps(v_from, v_until) g where g.lodge_id = p_lodge or g.lodge_id is null)
    )
  );
  return r;
end
$$;

create or replace function public.staff_hours(p_from timestamptz, p_to timestamptz)
returns table (staff_id uuid, full_name text, role public.staff_role, planned_minutes integer, effective_minutes integer)
language plpgsql stable
security definer
set search_path = public
as $$
begin
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  perform public.check_range(p_from, p_to);
  return query
  select s.id, s.full_name, s.role,
         coalesce((select sum(public.overlap_minutes(r.starts_at, r.ends_at, p_from, p_to))::int
                   from public.rota_shifts r where r.staff_id = s.id and r.status <> 'cancelled'), 0),
         coalesce((select sum(public.overlap_minutes(d.started_at, coalesce(d.ended_at, now()), p_from, p_to))::int
                   from public.duty_posts d where d.staff_id = s.id), 0)
         + coalesce((select sum(public.overlap_minutes(w.starts_at, w.ends_at, p_from, p_to))::int
                     from public.work_intervals w where w.staff_id = s.id), 0)
  from public.staff s
  where s.active or exists (select 1 from public.duty_posts d where d.staff_id = s.id and d.started_at < p_to and coalesce(d.ended_at, now()) > p_from)
  order by s.full_name;
end
$$;

create or replace function public.staff_work_log(p_staff uuid, p_from timestamptz, p_to timestamptz)
returns table (source text, id uuid, lodge_id uuid, function text, starts_at timestamptz, ends_at timestamptz, note text)
language plpgsql stable
security definer
set search_path = public
as $$
begin
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  perform public.check_range(p_from, p_to);
  return query
    select 'post', d.id, d.lodge_id, d.function::text, d.started_at, d.ended_at, d.adjust_reason
    from public.duty_posts d where d.staff_id = p_staff and d.started_at < p_to and coalesce(d.ended_at, now()) > p_from
    union all
    select 'manual', w.id, w.lodge_id, null, w.starts_at, w.ends_at, w.note
    from public.work_intervals w where w.staff_id = p_staff and w.starts_at < p_to and w.ends_at > p_from
    order by 5;
end
$$;

create or replace function public.add_work_interval(p_staff uuid, p_lodge uuid, p_start timestamptz, p_end timestamptz, p_note text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  if p_staff is null or p_start is null or p_end is null or not isfinite(p_start) or not isfinite(p_end) or p_end <= p_start then
    raise exception 'invalid_period' using errcode = '22023';
  end if;
  if p_end - p_start > interval '24 hours' then raise exception 'interval_too_long' using errcode = '22023'; end if;
  if p_end > now() + interval '5 minutes' then raise exception 'in_future' using errcode = '22023'; end if;
  insert into public.work_intervals (staff_id, lodge_id, starts_at, ends_at, note, created_by)
  values (p_staff, p_lodge, p_start, p_end, nullif(trim(p_note), ''), public.current_staff_id())
  returning id into v_id;
  return v_id;
end
$$;

create or replace function public.adjust_work_interval(p_post uuid, p_start timestamptz, p_end timestamptz, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post public.duty_posts;
begin
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required' using errcode = '22023'; end if;
  select * into v_post from public.duty_posts where id = p_post for update;
  if not found then raise exception 'post_not_found' using errcode = 'P0002'; end if;
  if coalesce(p_end, v_post.ended_at, now()) <= coalesce(p_start, v_post.started_at) then
    raise exception 'invalid_period' using errcode = '22023';
  end if;
  if (p_start is not null and not isfinite(p_start)) or (p_end is not null and not isfinite(p_end))
     or coalesce(p_end, v_post.ended_at, now()) - coalesce(p_start, v_post.started_at) > interval '24 hours' then
    raise exception 'interval_too_long' using errcode = '22023';
  end if;
  update public.duty_posts
     set started_at = coalesce(p_start, started_at),
         ended_at = coalesce(p_end, ended_at),
         end_reason = case when p_end is not null and ended_at is null then 'ended' else end_reason end,
         adjust_reason = trim(p_reason),
         adjusted_by = public.current_staff_id()
   where id = p_post;
end
$$;

create or replace function public.transfer_product(p_product uuid, p_from uuid, p_to uuid, p_quantity numeric, p_note text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_from = p_to then raise exception 'same_lodge' using errcode = '22023'; end if;
  if public.current_staff_id() is null or not (public.can_write_lodge(p_from) or public.can_write_lodge(p_to)) then
    raise exception 'not_authorised' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity > 1000000 then raise exception 'invalid_quantity' using errcode = '22023'; end if;
  insert into public.product_movements (kind, product_id, from_lodge_id, to_lodge_id, quantity, note, created_by)
  values ('transfer', p_product, p_from, p_to, p_quantity, nullif(trim(p_note), ''), public.current_staff_id())
  returning id into v_id;
  return v_id;
end
$$;

create or replace function public.create_purchase(p_supplier text, p_on date, p_document text, p_lines jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_line jsonb;
begin
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  if coalesce(trim(p_supplier), '') = '' then raise exception 'supplier_required' using errcode = '22023'; end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'lines_required' using errcode = '22023'; end if;
  -- cada linha: produto, quantidade (0–1.000.000) e preço (0–1.000.000) válidos
  for v_line in select * from jsonb_array_elements(p_lines) loop
    if jsonb_typeof(v_line) <> 'object' or coalesce(v_line ->> 'product_id', '') !~ '^[0-9a-fA-F-]{36}$'
       or coalesce(v_line ->> 'quantity', '') !~ '^[0-9]+(\.[0-9]{1,3})?$' or coalesce(v_line ->> 'unit_price', '') !~ '^[0-9]+(\.[0-9]{1,4})?$'
       or (v_line ->> 'quantity')::numeric not between 0.001 and 1000000 or (v_line ->> 'unit_price')::numeric > 1000000
       or not exists (select 1 from public.products where id = (v_line ->> 'product_id')::uuid) then
      raise exception 'invalid_line' using errcode = '22023';
    end if;
  end loop;
  insert into public.purchases (supplier, purchased_on, document_ref, created_by)
  values (trim(p_supplier), coalesce(p_on, current_date), nullif(trim(p_document), ''), public.current_staff_id())
  returning id into v_id;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    insert into public.purchase_lines (purchase_id, product_id, quantity, unit_price)
    values (v_id, (v_line ->> 'product_id')::uuid, (v_line ->> 'quantity')::numeric, (v_line ->> 'unit_price')::numeric);
  end loop;
  return v_id;
end
$$;
