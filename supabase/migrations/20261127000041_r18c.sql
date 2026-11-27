-- Revisão 18 — lote C: horários dos turnos em Settings; criar e desativar casas.

do $$
declare d text; r oid;
begin
  select p.oid into r from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'set_system_parameter';
  d := pg_get_functiondef(r);
  d := replace(d, E'  elsif p_key = ''fridge.range_celsius'' then',
E'  elsif p_key in (''shift.day_start'', ''shift.night_start'') then
    if jsonb_typeof(p_value) <> ''string'' or (p_value #>> ''{}'') !~ ''^([01][0-9]|2[0-3]):[0-5][0-9]$'' then
      raise exception ''invalid_parameter'' using errcode = ''22023'';
    end if;
    if p_key = ''shift.day_start'' and (p_value #>> ''{}'')::time >= public.shift_start_param(''shift.night_start'', ''19:00'') then
      raise exception ''invalid_parameter'' using errcode = ''22023'';
    end if;
    if p_key = ''shift.night_start'' and (p_value #>> ''{}'')::time <= public.shift_start_param(''shift.day_start'', ''07:00'') then
      raise exception ''invalid_parameter'' using errcode = ''22023'';
    end if;
  elsif p_key = ''fridge.range_celsius'' then');
  if position('shift.day_start' in d) = 0 then raise exception 'r18c: patch de set_system_parameter não aplicado'; end if;
  execute d;
end $$;

create or replace function public.add_lodge(p_code text, p_name text, p_short text, p_has_dinner boolean, p_has_laundry boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if public.current_staff_id() is null or not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  if p_code is null or p_code !~ '^[A-Z_]{2,20}$' then raise exception 'invalid_code' using errcode = '22023'; end if;
  if coalesce(trim(p_name), '') = '' or char_length(p_name) > 60 or coalesce(trim(p_short), '') = '' or char_length(p_short) > 20 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if exists (select 1 from public.lodges where code = p_code) then raise exception 'lodge_exists' using errcode = '23505'; end if;
  insert into public.lodges (code, name, short_name, has_dinner, has_laundry)
  values (p_code, trim(p_name), trim(p_short), coalesce(p_has_dinner, false), coalesce(p_has_laundry, false))
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.add_lodge(text, text, text, boolean, boolean) from public, anon;
grant execute on function public.add_lodge(text, text, text, boolean, boolean) to authenticated;

create or replace function public.set_lodge_active(p_lodge uuid, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.current_staff_id() is null or not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  if not exists (select 1 from public.lodges where id = p_lodge) then raise exception 'lodge_not_found' using errcode = 'P0002'; end if;
  if not p_active and exists (select 1 from public.stays where lodge_id = p_lodge and status <> 'ended') then
    raise exception 'lodge_has_residents' using errcode = '22023';
  end if;
  update public.lodges set active = p_active where id = p_lodge;
end $$;
revoke all on function public.set_lodge_active(uuid, boolean) from public, anon;
grant execute on function public.set_lodge_active(uuid, boolean) to authenticated;
