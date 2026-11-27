-- Revisão 16: cama cancelada fica livre para outro residente; painel da Home por período.

-- Libera a cama de um cancelamento decidido (out_pending): efetiva a saída de quem estava nela.
create or replace function public.release_cancelled_bed(p_bed uuid, p_at timestamptz)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.stays
     set status = 'ended', ended_at = greatest(least(coalesce(p_at, now()), now()), admitted_at),
         ended_by = public.current_staff_id(), end_reason = 'out'
   where bed_id = p_bed and status = 'out_pending';
end $$;
revoke all on function public.release_cancelled_bed(uuid, timestamptz) from public, anon, authenticated;

create or replace function public.admit_resident(p_lodge uuid, p_bed uuid, p_resident_id uuid default null, p_first_name text default null,
                                                 p_last_name text default null, p_date_of_birth date default null, p_pass_id text default null,
                                                 p_admitted_at timestamptz default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public.current_staff_id();
  v_resident uuid := p_resident_id;
  v_stay uuid;
  v_pass text := nullif(trim(coalesce(p_pass_id, '')), '');
begin
  if not public.can_see_lodge(p_lodge) then raise exception 'not_authorised' using errcode = '42501'; end if;
  if v_me is null or not public.can_write_lodge(p_lodge) then
    raise exception 'not_authorised' using errcode = '42501';
  end if;
  if p_admitted_at is not null and p_admitted_at > now() + interval '5 minutes' then
    raise exception 'admitted_in_future' using errcode = '22023';
  end if;

  if v_resident is null then
    if coalesce(trim(p_first_name), '') = '' then raise exception 'name_required' using errcode = '22023'; end if;
    if v_pass is null then raise exception 'pass_id_required' using errcode = '22023'; end if;
    if exists (select 1 from public.residents where lower(pass_id) = lower(v_pass)) then
      raise exception 'pass_id_exists' using errcode = '23505';
    end if;
    insert into public.residents (first_name, last_name, date_of_birth, pass_id, created_by)
    values (trim(p_first_name), coalesce(trim(p_last_name), ''), p_date_of_birth, v_pass, v_me)
    returning id into v_resident;
  else
    if not exists (select 1 from public.residents where id = v_resident) then raise exception 'resident_not_found' using errcode = 'P0002'; end if;
    if exists (select 1 from public.stays where resident_id = v_resident and status <> 'ended') then
      raise exception 'already_resident' using errcode = '23505';
    end if;
  end if;

  perform public.release_cancelled_bed(p_bed, p_admitted_at);
  insert into public.stays (resident_id, lodge_id, bed_id, admitted_at, created_by)
  values (v_resident, p_lodge, p_bed, coalesce(p_admitted_at, now()), v_me)
  returning id into v_stay;
  return v_stay;
end $$;

create or replace function public.transfer_resident(p_stay uuid, p_new_bed uuid, p_at timestamptz default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public.current_staff_id();
  v_old public.stays;
  v_new_lodge uuid := public.bed_lodge(p_new_bed);
  v_at timestamptz := coalesce(p_at, now());
  v_new uuid;
begin
  select * into v_old from public.stays where id = p_stay for update;
  if not found or v_old.status <> 'active' then
    raise exception 'stay_not_active' using errcode = '22023';
  end if;
  if v_me is null or not (public.can_write_lodge(v_old.lodge_id) or public.can_write_lodge(v_new_lodge)) then
    raise exception 'not_authorised' using errcode = '42501';
  end if;
  if v_at < v_old.admitted_at or v_at > now() + interval '5 minutes' then
    raise exception 'invalid_transfer_time' using errcode = '22023';
  end if;

  update public.stays
     set status = 'ended', ended_at = v_at, ended_by = v_me, end_reason = 'transfer'
   where id = p_stay;
  perform public.release_cancelled_bed(p_new_bed, v_at);
  insert into public.stays (resident_id, lodge_id, bed_id, admitted_at, transfer_from_stay_id, created_by)
  values (v_old.resident_id, v_new_lodge, p_new_bed, v_at, p_stay, v_me)
  returning id into v_new;
  return v_new;
end $$;

-- Painel da Home por período (padrão: últimos 14 dias).
drop function public.home_dashboard();
create or replace function public.home_dashboard(p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := public.operational_day(now());
  v_to date := coalesce(p_to, v_today);
  v_from date := coalesce(p_from, coalesce(p_to, v_today) - 13);
  v_series jsonb;
begin
  if not public.is_active_staff() then raise exception 'not_authorised' using errcode = '42501'; end if;
  if not isfinite(v_from) or not isfinite(v_to) or v_to < v_from or v_to - v_from > 365 or v_from < date '2020-01-01' or v_to > v_today + 31 then
    raise exception 'invalid_period' using errcode = '22023';
  end if;
  select jsonb_agg(jsonb_build_object(
        'day', d::date,
        'admissions', (select count(*) from public.stays s where public.can_see_lodge(s.lodge_id) and s.transfer_from_stay_id is null and s.admitted_at >= public.operational_day_start(d::date) and s.admitted_at < public.operational_day_end(d::date)),
        'outs', (select count(*) from public.stays s where public.can_see_lodge(s.lodge_id) and s.end_reason = 'out' and s.ended_at >= public.operational_day_start(d::date) and s.ended_at < public.operational_day_end(d::date)),
        'no_shows', (select count(*) from public.no_shows n where public.can_see_lodge(n.lodge_id) and n.status = 'confirmed' and n.operational_day = d::date),
        'maintenance', (select count(*) from public.maintenance_tickets t where public.can_see_lodge(t.lodge_id) and t.created_at >= public.operational_day_start(d::date) and t.created_at < public.operational_day_end(d::date)),
        'occupied', (select count(*) from public.stays s where public.can_see_lodge(s.lodge_id) and s.admitted_at <= least(public.slot_instant(d::date, '23:00'), now()) and (s.ended_at is null or s.ended_at > least(public.slot_instant(d::date, '23:00'), now())))
      ) order by d) into v_series
  from generate_series(v_from, v_to, interval '1 day') d;
  return jsonb_build_object(
    'period', jsonb_build_object('from', v_from, 'to', v_to),
    'lodges', (select jsonb_agg(jsonb_build_object(
        'lodge_id', l.id,
        'beds_total', (select count(*) from public.beds b join public.rooms r on r.id = b.room_id where r.lodge_id = l.id and b.active and r.active),
        'out_of_use', (select count(*) from public.beds b join public.rooms r on r.id = b.room_id where r.lodge_id = l.id and b.active and r.active and b.status <> 'in_use'),
        -- cama com cancelamento decidido já conta como livre; o residente aparece em out_pending
        'present', (select count(*) from public.stays_present_at(l.id, now())),
        'occupied', (select count(*) from public.stays_present_at(l.id, now()) p join public.stays s on s.id = p.id where s.status <> 'out_pending'),
        'out_pending', (select count(*) from public.stays s where s.lodge_id = l.id and s.status = 'out_pending'),
        'seen_today', (select count(*) from public.stays_present_at(l.id, now()) s
                       where exists (select 1 from public.resident_evidence(s.resident_id, v_today))),
        'checks_done', (select count(*) from public.room_check_runs where lodge_id = l.id and operational_day = v_today and status = 'launched'),
        'checks_total', cardinality(public.check_slots(l.id, v_today)),
        'rounds_done', (select count(*) from public.handover_entries where lodge_id = l.id and kind = 'round' and operational_day = v_today),
        'absences_now', (select count(*) from public.absences a join public.stays s on s.id = a.stay_id where s.lodge_id = l.id and a.ended_at is null and a.starts_at <= now())
      ) order by l.code) from public.lodges l where l.active and public.can_see_lodge(l.id)),
    'series', v_series,
    'totals', jsonb_build_object(
        'admissions', (select coalesce(sum((p ->> 'admissions')::int), 0) from jsonb_array_elements(v_series) p),
        'outs', (select coalesce(sum((p ->> 'outs')::int), 0) from jsonb_array_elements(v_series) p),
        'no_shows', (select coalesce(sum((p ->> 'no_shows')::int), 0) from jsonb_array_elements(v_series) p),
        'maintenance', (select coalesce(sum((p ->> 'maintenance')::int), 0) from jsonb_array_elements(v_series) p),
        'avg_occupancy', (select coalesce(round(avg((p ->> 'occupied')::numeric), 1), 0) from jsonb_array_elements(v_series) p)),
    'maintenance_open', (select jsonb_build_object(
        'urgent', count(*) filter (where priority = 'urgent'), 'normal', count(*) filter (where priority = 'normal'), 'low', count(*) filter (where priority = 'low'),
        'overdue', count(*) filter (where deadline_at < now()))
      from public.maintenance_tickets where status <> 'resolved' and public.can_see_lodge(lodge_id))
  );
end $$;

do $$ declare f text; begin
  for f in select unnest(array['admit_resident(uuid, uuid, uuid, text, text, date, text, timestamptz)', 'transfer_resident(uuid, uuid, timestamptz)', 'home_dashboard(date, date)']) loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
notify pgrst, 'reload schema';
