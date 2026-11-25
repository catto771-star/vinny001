-- Revisão 4: turno de Float no Handover. Na abertura, quem assume o Float; no encerramento, para quem passa.
-- Um Float aberto por vez (cobre as duas casas); o turno de Office continua um por casa.
alter table public.handover_shifts add column function text not null default 'office' check (function in ('office', 'float'));
drop index if exists public.handover_shifts_one_open;
create unique index handover_shifts_one_open on public.handover_shifts(lodge_id) where closed_at is null and function = 'office';
create unique index handover_shifts_one_float on public.handover_shifts(function) where closed_at is null and function = 'float';

-- Turno do Roster da pessoa na função certa (Float no Roster não tem casa).
create or replace function public.match_rota_shift(p_staff uuid, p_lodge uuid, p_at timestamptz, p_function text default 'office')
returns uuid
language sql stable
security definer
set search_path = public
as $$
  select r.id from public.rota_shifts r
  where r.staff_id = p_staff and r.status = 'published'
    and case when p_function = 'float' then r.function = 'float' else (r.lodge_id = p_lodge or r.lodge_id is null) end
    and r.starts_at - interval '3 hours' <= p_at and r.ends_at > p_at
  order by abs(extract(epoch from r.starts_at - p_at))
  limit 1
$$;
drop function if exists public.match_rota_shift(uuid, uuid, timestamptz);

-- Anotações entram só no turno de Office da casa.
create or replace function public.handover_fill_default()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chosen text := nullif(current_setting('app.filled_by', true), '');
  v_shift public.handover_shifts;
begin
  select * into v_shift from public.handover_shifts s
  where s.lodge_id = new.lodge_id and s.function = 'office'
    and s.opened_at <= greatest(new.occurred_at, now() - interval '12 hours')
    and (s.closed_at is null or s.closed_at > new.occurred_at)
  order by s.opened_at desc limit 1;
  if new.shift_id is null and v_shift.id is not null and new.occurred_at >= v_shift.opened_at - interval '5 minutes' then
    new.shift_id := v_shift.id;
  end if;
  if new.filled_by is null then
    new.filled_by := coalesce(
      v_chosen::uuid,
      case when new.shift_id is not null then (select staff_id from public.handover_shifts where id = new.shift_id) end,
      case when public.current_staff_role() = 'station' then public.on_duty_staff(new.lodge_id, new.occurred_at)
           else public.current_staff_id() end);
  end if;
  return new;
end
$$;

drop function if exists public.open_handover_shift(uuid, uuid);
create or replace function public.open_handover_shift(p_lodge uuid, p_staff uuid, p_function text default 'office')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_name text;
  v_fn text := coalesce(p_function, 'office');
begin
  if public.current_staff_id() is null or not public.can_write_lodge(p_lodge) then
    raise exception 'not_authorised' using errcode = '42501';
  end if;
  if v_fn not in ('office', 'float') then raise exception 'invalid_function' using errcode = '22023'; end if;
  select coalesce(display_name, full_name) into v_name from public.staff
  where id = p_staff and active and role in ('porter', 'manager', 'owner', 'developer');
  if v_name is null then raise exception 'invalid_filled_by' using errcode = '22023'; end if;
  if exists (select 1 from public.handover_shifts where closed_at is null and function = v_fn and (v_fn = 'float' or lodge_id = p_lodge)) then
    raise exception 'shift_already_open' using errcode = '23505';
  end if;
  insert into public.handover_shifts (lodge_id, staff_id, opened_by, rota_shift_id, function)
  values (p_lodge, p_staff, public.current_staff_id(), public.match_rota_shift(p_staff, p_lodge, now(), v_fn), v_fn)
  returning id into v_id;
  insert into public.handover_entries (lodge_id, kind, body, occurred_at, operational_day, author_id, shift_id, filled_by)
  values (p_lodge, 'shift', case when v_fn = 'float' then 'Float shift opened — ' else 'Shift opened — ' end || v_name,
          now(), public.operational_day(now()), public.current_staff_id(), case when v_fn = 'office' then v_id end, p_staff);
  return v_id;
end
$$;

create or replace function public.close_handover_shift(p_shift uuid, p_handed_to uuid, p_note text)
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
begin
  select * into v_s from public.handover_shifts where id = p_shift for update;
  if not found then raise exception 'shift_not_found' using errcode = 'P0002'; end if;
  if public.current_staff_id() is null or not public.can_write_lodge(v_s.lodge_id) then
    raise exception 'not_authorised' using errcode = '42501';
  end if;
  if v_s.closed_at is not null then raise exception 'shift_already_closed' using errcode = '22023'; end if;
  if p_handed_to is not null then
    select coalesce(display_name, full_name) into v_to_name from public.staff
    where id = p_handed_to and active and role in ('porter', 'manager', 'owner', 'developer');
    if v_to_name is null then raise exception 'invalid_filled_by' using errcode = '22023'; end if;
  end if;
  select coalesce(display_name, full_name) into v_name from public.staff where id = v_s.staff_id;
  update public.handover_shifts
     set closed_at = now(), closed_by = public.current_staff_id(), handed_to = p_handed_to,
         close_note = nullif(trim(p_note), ''), hours_status = 'pending'
   where id = p_shift;
  insert into public.handover_entries (lodge_id, kind, body, occurred_at, operational_day, author_id, shift_id, filled_by)
  values (v_s.lodge_id, 'shift',
          case when v_s.function = 'float' then 'Float shift closed — ' else 'Shift closed — ' end || v_name
            || coalesce(' handed over to ' || v_to_name, '') || coalesce('. ' || nullif(trim(p_note), ''), ''),
          now(), public.operational_day(now()), public.current_staff_id(), case when v_s.function = 'office' then p_shift end, v_s.staff_id);
  select * into v_r from public.rota_shifts where id = v_s.rota_shift_id;
  v_mismatch := v_r.id is null or abs(extract(epoch from v_r.starts_at - v_s.opened_at)) > 900 or abs(extract(epoch from v_r.ends_at - now())) > 900;
  if v_mismatch then
    insert into public.notifications (kind, audience, lodge_id, payload)
    values ('shift_hours_review', 'management', v_s.lodge_id, jsonb_build_object('shift_id', p_shift, 'name', v_name, 'function', v_s.function));
  end if;
  if p_handed_to is not null then
    return public.open_handover_shift(v_s.lodge_id, p_handed_to, v_s.function);
  end if;
  return null;
end
$$;

-- Confirmação: cobertura de Float sem escala vira Float no Roster.
create or replace function public.confirm_shift_hours(p_shift uuid, p_start timestamptz, p_end timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s public.handover_shifts;
  v_start timestamptz;
  v_end timestamptz;
  v_fn text;
  v_new uuid;
begin
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  select * into v_s from public.handover_shifts where id = p_shift for update;
  if not found or v_s.closed_at is null then raise exception 'shift_not_found' using errcode = 'P0002'; end if;
  v_start := coalesce(p_start, v_s.opened_at);
  v_end := coalesce(p_end, v_s.closed_at);
  if v_end <= v_start or v_end - v_start > interval '24 hours' or v_end > now() + interval '5 minutes' then
    raise exception 'invalid_period' using errcode = '22023';
  end if;
  if v_s.rota_shift_id is not null then
    update public.rota_shifts set starts_at = v_start, ends_at = v_end where id = v_s.rota_shift_id;
  else
    select case when v_s.function = 'float' then 'float' when role = 'porter' then 'office' else 'manager' end into v_fn from public.staff where id = v_s.staff_id;
    insert into public.rota_shifts (staff_id, lodge_id, function, starts_at, ends_at, status, published_at, created_by)
    values (v_s.staff_id, case when v_fn = 'float' then null else v_s.lodge_id end, v_fn, v_start, v_end, 'published', now(), public.current_staff_id())
    returning id into v_new;
  end if;
  update public.handover_shifts
     set hours_status = 'confirmed', confirmed_start = v_start, confirmed_end = v_end,
         confirmed_by = public.current_staff_id(), confirmed_at = now(), rota_shift_id = coalesce(rota_shift_id, v_new)
   where id = p_shift;
end
$$;

revoke all on function public.match_rota_shift(uuid, uuid, timestamptz, text), public.open_handover_shift(uuid, uuid, text) from public, anon;
grant execute on function public.open_handover_shift(uuid, uuid, text) to authenticated;
