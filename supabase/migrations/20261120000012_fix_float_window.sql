-- Correção: a janela do Float vai das 12h à meia-noite do mesmo dia operacional.
-- slot_instant(d, '00:00') já é a meia-noite seguinte (horários antes das 07h pertencem ao dia seguinte);
-- com d + 1 a janela durava 36 h e um dia sem Float não aparecia como buraco quando havia Float no dia anterior.
create or replace function public.coverage_gaps(p_from timestamptz, p_to timestamptz)
returns table (lodge_id uuid, lodge_code text, kind text, starts_at timestamptz, ends_at timestamptz)
language plpgsql stable
security definer
set search_path = public
as $$
begin
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
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
