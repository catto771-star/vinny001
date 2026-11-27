-- Revisão 2, item 7: tela Pessoas — resumo de uma pessoa da equipe para o Admin.
create or replace function public.person_summary(p_staff uuid)
returns jsonb
language plpgsql stable
security definer
set search_path = public
as $$
declare
  v_m1 timestamptz := public.operational_day_start(date_trunc('month', public.operational_day(now()))::date);
  v_m2 timestamptz := public.operational_day_start((date_trunc('month', public.operational_day(now())) + interval '1 month')::date);
begin
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  if not exists (select 1 from public.staff where id = p_staff) then raise exception 'staff_not_found' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'functions', coalesce((select jsonb_object_agg(function, n) from (
        select r.function, count(*) n from public.rota_shifts r
        where r.staff_id = p_staff and r.status = 'published' and r.starts_at > now() - interval '60 days' group by 1) x), '{}'::jsonb),
    'roster_upcoming', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'function', r.function, 'lodge_id', r.lodge_id, 'starts_at', r.starts_at, 'ends_at', r.ends_at) order by r.starts_at)
        from public.rota_shifts r where r.staff_id = p_staff and r.status = 'published' and r.starts_at >= now() and r.starts_at < now() + interval '14 days'), '[]'::jsonb),
    'shifts_recent', coalesce((select jsonb_agg(x order by x.opened_at desc) from (
        select s.id, s.lodge_id, s.opened_at, s.closed_at, s.hours_status from public.handover_shifts s
        where s.staff_id = p_staff order by s.opened_at desc limit 10) x), '[]'::jsonb),
    'notes_recent', coalesce((select jsonb_agg(x order by x.occurred_at desc) from (
        select e.id, e.lodge_id, e.kind, e.body, e.occurred_at from public.handover_entries e
        where e.filled_by = p_staff and e.status = 'active' and e.kind <> 'shift' order by e.occurred_at desc limit 15) x), '[]'::jsonb),
    'hours_month', (select jsonb_build_object('planned_minutes', h.planned_minutes, 'effective_minutes', h.effective_minutes)
        from public.staff_hours(v_m1, v_m2) h where h.staff_id = p_staff),
    'tasks_signed_30d', (select count(*) from public.task_signatures t where t.staff_id = p_staff and t.signed_at > now() - interval '30 days')
  );
end
$$;
revoke all on function public.person_summary(uuid) from public, anon;
grant execute on function public.person_summary(uuid) to authenticated;
