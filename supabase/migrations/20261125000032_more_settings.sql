-- Revisão 12: mais configurações reais — janela de tolerância do Room Check (Admin) e nome de exibição (pessoal).
insert into public.parameters (key, value, valid_from) values ('presence.check_window_minutes', '60', '2026-01-01T00:00:00Z');

CREATE OR REPLACE FUNCTION public.set_system_parameter(p_key text, p_value jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_value jsonb := p_value;
  v_items text[];
  v_n numeric;
  v_min numeric;
  v_max numeric;
begin
  if public.current_staff_id() is null or not public.is_management() then
    raise exception 'not_authorised' using errcode = '42501';
  end if;

  if p_key in ('presence.check_times', 'rounds.hours') then
    v_max := case p_key when 'rounds.hours' then 24 else 8 end;
    if jsonb_typeof(p_value) <> 'array' or jsonb_array_length(p_value) = 0 or jsonb_array_length(p_value) > v_max then
      raise exception 'invalid_parameter' using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_array_elements(p_value) e where jsonb_typeof(e) <> 'string' or (e #>> '{}') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') then
      raise exception 'invalid_parameter' using errcode = '22023';
    end if;
    select array_agg(distinct e #>> '{}' order by e #>> '{}') into v_items from jsonb_array_elements(p_value) e;
    v_value := to_jsonb(v_items);
  elsif p_key = 'fridge.range_celsius' then
    if jsonb_typeof(p_value) <> 'object' or jsonb_typeof(p_value -> 'min') <> 'number' or jsonb_typeof(p_value -> 'max') <> 'number' then
      raise exception 'invalid_parameter' using errcode = '22023';
    end if;
    if (p_value ->> 'min')::numeric < -30 or (p_value ->> 'max')::numeric > 40 or (p_value ->> 'min')::numeric >= (p_value ->> 'max')::numeric then
      raise exception 'invalid_parameter' using errcode = '22023';
    end if;
    v_value := jsonb_build_object('min', (p_value ->> 'min')::numeric, 'max', (p_value ->> 'max')::numeric);
  elsif p_key = 'maintenance.default_deadline_hours' then
    if jsonb_typeof(p_value) <> 'object' or exists (select 1 from unnest(array['urgent', 'normal', 'low']) k where jsonb_typeof(p_value -> k) <> 'number') then
      raise exception 'invalid_parameter' using errcode = '22023';
    end if;
    if exists (select 1 from unnest(array['urgent', 'normal', 'low']) k
               where (p_value ->> k)::numeric <> trunc((p_value ->> k)::numeric) or (p_value ->> k)::numeric < 1 or (p_value ->> k)::numeric > 8760)
       or (p_value ->> 'urgent')::numeric > (p_value ->> 'normal')::numeric or (p_value ->> 'normal')::numeric > (p_value ->> 'low')::numeric then
      raise exception 'invalid_parameter' using errcode = '22023';
    end if;
    v_value := jsonb_build_object('urgent', (p_value ->> 'urgent')::int, 'normal', (p_value ->> 'normal')::int, 'low', (p_value ->> 'low')::int);
  elsif p_key in ('maintenance.reminder_hours', 'presence.no_show_monthly_alert', 'records.correction_window_hours', 'security.session_idle_minutes', 'presence.check_window_minutes') then
    if jsonb_typeof(p_value) <> 'number' then raise exception 'invalid_parameter' using errcode = '22023'; end if;
    v_n := (p_value #>> '{}')::numeric;
    v_min := case p_key when 'security.session_idle_minutes' then 5 when 'presence.check_window_minutes' then 5 else 1 end;
    v_max := case p_key when 'maintenance.reminder_hours' then 168 when 'presence.no_show_monthly_alert' then 31
                        when 'records.correction_window_hours' then 720 when 'presence.check_window_minutes' then 180 else 240 end;
    if v_n <> trunc(v_n) or v_n < v_min or v_n > v_max then
      raise exception 'invalid_parameter' using errcode = '22023';
    end if;
    v_value := to_jsonb(v_n::int);
  else
    raise exception 'unknown_parameter' using errcode = '22023';
  end if;

  insert into public.parameters (key, value, valid_from, created_by) values (p_key, v_value, now(), public.current_staff_id());
end
$function$;

CREATE OR REPLACE FUNCTION public.open_room_check(p_lodge uuid, p_day date, p_slot text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_win integer := coalesce((public.param_value('presence.check_window_minutes') #>> '{}')::int, 60);
  v_me uuid := public.current_staff_id();
  v_planned timestamptz;
  v_at timestamptz;
  v_id uuid;
  v_code text;
begin
    if not public.can_see_lodge(p_lodge) then raise exception 'not_authorised' using errcode = '42501'; end if;
  if v_me is null or not public.can_write_lodge(p_lodge) then
    raise exception 'not_authorised' using errcode = '42501';
  end if;
  if not (p_slot = any (public.check_slots(p_lodge, p_day))) then
    raise exception 'invalid_slot' using errcode = '22023';
  end if;
  v_planned := public.slot_instant(p_day, p_slot);
  if v_planned > now() + make_interval(mins => v_win) then
    raise exception 'check_in_future' using errcode = '22023';
  end if;
  v_at := case when now() between v_planned - make_interval(mins => v_win) and v_planned + make_interval(mins => v_win)
                    and now() < public.operational_day_end(p_day)
               then now() else v_planned end;

  select id into v_id from public.room_check_runs
  where lodge_id = p_lodge and operational_day = p_day and slot = p_slot;
  if found then
    return v_id;
  end if;

  select code into v_code from public.lodges where id = p_lodge;
  insert into public.room_check_runs (lodge_id, operational_day, slot, checked_at, performed_by, entered_by, sheet_number)
  values (p_lodge, p_day, p_slot, v_at, v_me, v_me,
          left(v_code, 2) || '-' || to_char(p_day, 'YYYYMMDD') || '-' || replace(p_slot, ':', ''))
  on conflict (lodge_id, operational_day, slot) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.room_check_runs
    where lodge_id = p_lodge and operational_day = p_day and slot = p_slot;
  end if;
  return v_id;
end
$function$;

CREATE OR REPLACE FUNCTION public.room_check_done(p_lodge uuid, p_day date, p_slot text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_win integer := coalesce((public.param_value('presence.check_window_minutes') #>> '{}')::int, 60);
  v_id uuid;
begin
    if not public.can_see_lodge(p_lodge) then raise exception 'not_authorised' using errcode = '42501'; end if;
  if public.current_staff_id() is null or not public.can_write_lodge(p_lodge) then
    raise exception 'not_authorised' using errcode = '42501';
  end if;
  if not (p_slot = any (public.round_slots())) then raise exception 'invalid_round_slot' using errcode = '22023'; end if;
  if public.slot_instant(p_day, p_slot) > now() + make_interval(mins => v_win) then
    raise exception 'round_in_future' using errcode = '22023';
  end if;
  select id into v_id from public.handover_entries
  where lodge_id = p_lodge and operational_day = p_day and round_slot = p_slot and kind = 'round';
  if found then return jsonb_build_object('status', 'already_recorded', 'entry_id', v_id); end if;
  begin
    v_id := public.insert_handover_entry(p_lodge, 'round', 'Room Check Done', now(), '[]'::jsonb, null, p_day, p_slot);
  exception when unique_violation then
    select id into v_id from public.handover_entries
    where lodge_id = p_lodge and operational_day = p_day and round_slot = p_slot and kind = 'round';
    return jsonb_build_object('status', 'already_recorded', 'entry_id', v_id);
  end;
  return jsonb_build_object('status', 'recorded', 'entry_id', v_id);
end
$function$;


-- Nome de exibição: cada pessoa muda só o próprio (vale em Handover, Roster, Audit…).
create or replace function public.set_my_display_name(p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_name text := nullif(trim(coalesce(p_name, '')), '');
begin
  if public.current_staff_id() is null or not public.is_active_staff() then raise exception 'not_authorised' using errcode = '42501'; end if;
  if v_name is not null and char_length(v_name) > 40 then raise exception 'invalid_name' using errcode = '22023'; end if;
  update public.staff set display_name = v_name where id = public.current_staff_id();
end
$$;
revoke all on function public.set_my_display_name(text) from public, anon;
grant execute on function public.set_my_display_name(text) to authenticated;
notify pgrst, 'reload schema';
