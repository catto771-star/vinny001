-- Revisão 2, item 11: Home com painéis — números e séries alimentados pela própria plataforma.
create or replace function public.home_dashboard()
returns jsonb
language plpgsql stable
security definer
set search_path = public
as $$
declare
  v_today date := public.operational_day(now());
begin
  if not public.is_active_staff() then raise exception 'not_authorised' using errcode = '42501'; end if;
  return jsonb_build_object(
    'lodges', (select jsonb_agg(jsonb_build_object(
        'lodge_id', l.id,
        'beds_total', (select count(*) from public.beds b join public.rooms r on r.id = b.room_id where r.lodge_id = l.id and b.active and r.active),
        'out_of_use', (select count(*) from public.beds b join public.rooms r on r.id = b.room_id where r.lodge_id = l.id and b.active and r.active and b.status <> 'in_use'),
        'occupied', (select count(*) from public.stays_present_at(l.id, now())),
        'out_pending', (select count(*) from public.stays s where s.lodge_id = l.id and s.status = 'out_pending'),
        'seen_today', (select count(*) from public.stays_present_at(l.id, now()) s
                       where exists (select 1 from public.resident_evidence(s.resident_id, v_today))),
        'checks_done', (select count(*) from public.room_check_runs where lodge_id = l.id and operational_day = v_today and status = 'launched'),
        'checks_total', cardinality(public.check_slots(l.id, v_today)),
        'rounds_done', (select count(*) from public.handover_entries where lodge_id = l.id and kind = 'round' and operational_day = v_today),
        'absences_now', (select count(*) from public.absences a join public.stays s on s.id = a.stay_id where s.lodge_id = l.id and a.ended_at is null and a.starts_at <= now())
      ) order by l.code) from public.lodges l where l.active),
    'series', (select jsonb_agg(jsonb_build_object(
        'day', d::date,
        'admissions', (select count(*) from public.stays s where s.transfer_from_stay_id is null and s.admitted_at >= public.operational_day_start(d::date) and s.admitted_at < public.operational_day_end(d::date)),
        'outs', (select count(*) from public.stays s where s.end_reason = 'out' and s.ended_at >= public.operational_day_start(d::date) and s.ended_at < public.operational_day_end(d::date)),
        'no_shows', (select count(*) from public.no_shows n where n.status = 'confirmed' and n.operational_day = d::date),
        'maintenance', (select count(*) from public.maintenance_tickets t where t.created_at >= public.operational_day_start(d::date) and t.created_at < public.operational_day_end(d::date)),
        'occupied', (select count(*) from public.stays s where s.admitted_at <= least(public.slot_instant(d::date, '23:00'), now()) and (s.ended_at is null or s.ended_at > least(public.slot_instant(d::date, '23:00'), now())))
      ) order by d) from generate_series(v_today - 13, v_today, interval '1 day') d),
    'maintenance_open', (select jsonb_build_object(
        'urgent', count(*) filter (where priority = 'urgent'), 'normal', count(*) filter (where priority = 'normal'), 'low', count(*) filter (where priority = 'low'),
        'overdue', count(*) filter (where deadline_at < now()))
      from public.maintenance_tickets where status <> 'resolved')
  );
end
$$;
revoke all on function public.home_dashboard() from public, anon;
grant execute on function public.home_dashboard() to authenticated;
