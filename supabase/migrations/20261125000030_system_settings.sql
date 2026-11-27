-- Revisão 10: Configurações do sistema — o Admin muda parâmetros reais, com validação e histórico (valid_from).
create or replace function public.set_system_parameter(p_key text, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
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
  elsif p_key in ('maintenance.reminder_hours', 'presence.no_show_monthly_alert', 'records.correction_window_hours', 'security.session_idle_minutes') then
    if jsonb_typeof(p_value) <> 'number' then raise exception 'invalid_parameter' using errcode = '22023'; end if;
    v_n := (p_value #>> '{}')::numeric;
    v_min := case p_key when 'security.session_idle_minutes' then 5 else 1 end;
    v_max := case p_key when 'maintenance.reminder_hours' then 168 when 'presence.no_show_monthly_alert' then 31
                        when 'records.correction_window_hours' then 720 else 240 end;
    if v_n <> trunc(v_n) or v_n < v_min or v_n > v_max then
      raise exception 'invalid_parameter' using errcode = '22023';
    end if;
    v_value := to_jsonb(v_n::int);
  else
    raise exception 'unknown_parameter' using errcode = '22023';
  end if;

  insert into public.parameters (key, value, valid_from, created_by) values (p_key, v_value, now(), public.current_staff_id());
end
$$;
revoke all on function public.set_system_parameter(text, jsonb) from public, anon;
grant execute on function public.set_system_parameter(text, jsonb) to authenticated;
notify pgrst, 'reload schema';
