-- Revisão 5: horário informado na abertura e no encerramento/passagem do turno (Office e Float).
-- Sem horário = agora. Quem assume na passagem começa no mesmo horário.
drop function if exists public.open_handover_shift(uuid, uuid, text);
drop function if exists public.close_handover_shift(uuid, uuid, text);

create or replace function public.open_handover_shift(p_lodge uuid, p_staff uuid, p_function text default 'office', p_at timestamptz default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_name text;
  v_fn text := coalesce(p_function, 'office');
  v_at timestamptz := coalesce(p_at, now());
begin
  if public.current_staff_id() is null or not public.can_write_lodge(p_lodge) then
    raise exception 'not_authorised' using errcode = '42501';
  end if;
  if v_fn not in ('office', 'float') then raise exception 'invalid_function' using errcode = '22023'; end if;
  if v_at > now() + interval '5 minutes' or v_at < now() - interval '24 hours' then raise exception 'invalid_time' using errcode = '22023'; end if;
  select coalesce(display_name, full_name) into v_name from public.staff
  where id = p_staff and active and role in ('porter', 'manager', 'owner', 'developer');
  if v_name is null then raise exception 'invalid_filled_by' using errcode = '22023'; end if;
  if exists (select 1 from public.handover_shifts where closed_at is null and function = v_fn and (v_fn = 'float' or lodge_id = p_lodge)) then
    raise exception 'shift_already_open' using errcode = '23505';
  end if;
  insert into public.handover_shifts (lodge_id, staff_id, opened_by, rota_shift_id, function, opened_at)
  values (p_lodge, p_staff, public.current_staff_id(), public.match_rota_shift(p_staff, p_lodge, v_at, v_fn), v_fn, v_at)
  returning id into v_id;
  insert into public.handover_entries (lodge_id, kind, body, occurred_at, operational_day, author_id, shift_id, filled_by)
  values (p_lodge, 'shift', case when v_fn = 'float' then 'Float shift opened — ' else 'Shift opened — ' end || v_name,
          v_at, public.operational_day(v_at), public.current_staff_id(), case when v_fn = 'office' then v_id end, p_staff);
  return v_id;
end
$$;

create or replace function public.close_handover_shift(p_shift uuid, p_handed_to uuid, p_note text, p_at timestamptz default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s public.handover_shifts;
  v_r public.rota_shifts;
  v_name text;
  v_to_name text;
  v_mismatch boolean;
  v_at timestamptz := coalesce(p_at, now());
begin
  select * into v_s from public.handover_shifts where id = p_shift for update;
  if not found then raise exception 'shift_not_found' using errcode = 'P0002'; end if;
  if public.current_staff_id() is null or not public.can_write_lodge(v_s.lodge_id) then
    raise exception 'not_authorised' using errcode = '42501';
  end if;
  if v_s.closed_at is not null then raise exception 'shift_already_closed' using errcode = '22023'; end if;
  if v_at > now() + interval '5 minutes' or v_at < v_s.opened_at then raise exception 'invalid_time' using errcode = '22023'; end if;
  if p_handed_to is not null then
    select coalesce(display_name, full_name) into v_to_name from public.staff
    where id = p_handed_to and active and role in ('porter', 'manager', 'owner', 'developer');
    if v_to_name is null then raise exception 'invalid_filled_by' using errcode = '22023'; end if;
  end if;
  select coalesce(display_name, full_name) into v_name from public.staff where id = v_s.staff_id;
  update public.handover_shifts
     set closed_at = v_at, closed_by = public.current_staff_id(), handed_to = p_handed_to,
         close_note = nullif(trim(p_note), ''), hours_status = 'pending'
   where id = p_shift;
  insert into public.handover_entries (lodge_id, kind, body, occurred_at, operational_day, author_id, shift_id, filled_by)
  values (v_s.lodge_id, 'shift',
          case when v_s.function = 'float' then 'Float shift closed — ' else 'Shift closed — ' end || v_name
            || coalesce(' handed over to ' || v_to_name, '') || coalesce('. ' || nullif(trim(p_note), ''), ''),
          v_at, public.operational_day(v_at), public.current_staff_id(), case when v_s.function = 'office' then p_shift end, v_s.staff_id);
  select * into v_r from public.rota_shifts where id = v_s.rota_shift_id;
  v_mismatch := v_r.id is null or abs(extract(epoch from v_r.starts_at - v_s.opened_at)) > 900 or abs(extract(epoch from v_r.ends_at - v_at)) > 900;
  if v_mismatch then
    insert into public.notifications (kind, audience, lodge_id, payload)
    values ('shift_hours_review', 'management', v_s.lodge_id, jsonb_build_object('shift_id', p_shift, 'name', v_name, 'function', v_s.function));
  end if;
  if p_handed_to is not null then
    return public.open_handover_shift(v_s.lodge_id, p_handed_to, v_s.function, v_at);
  end if;
  return null;
end
$$;

revoke all on function public.open_handover_shift(uuid, uuid, text, timestamptz), public.close_handover_shift(uuid, uuid, text, timestamptz) from public, anon;
grant execute on function public.open_handover_shift(uuid, uuid, text, timestamptz), public.close_handover_shift(uuid, uuid, text, timestamptz) to authenticated;
