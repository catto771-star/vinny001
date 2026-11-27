-- Revisão 18 — lote A: moradores e ocorrências.

-- 1. Check já lançado não pode ser remarcado (nem pela gestão).
do $$
declare d text; r oid;
begin
  select p.oid into r from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'mark_resident';
  d := pg_get_functiondef(r);
  d := replace(d, E'  if v_me is null or not public.can_write_lodge(v_run.lodge_id) then\n    raise exception ''not_authorised'' using errcode = ''42501'';\n  end if;\n',
                  E'  if v_me is null or not public.can_write_lodge(v_run.lodge_id) then\n    raise exception ''not_authorised'' using errcode = ''42501'';\n  end if;\n  if v_run.status = ''launched'' then raise exception ''run_launched'' using errcode = ''22023''; end if;\n');
  if position('run_launched' in d) = 0 then raise exception 'r18: patch de mark_resident não aplicado'; end if;
  execute d;
end $$;

-- 2. Corrigir nota: as menções acompanham a edição (opcional; sem o parâmetro nada muda).
drop function public.correct_handover_note(uuid, text);
create or replace function public.correct_handover_note(p_id uuid, p_body text, p_mentions jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_e public.handover_entries;
  v_m jsonb;
begin
  select * into v_e from public.handover_entries where id = p_id for update;
  if not found then raise exception 'entry_not_found' using errcode = 'P0002'; end if;
  perform public.check_entry_correction(v_e);
  if v_e.kind = 'round' then raise exception 'round_not_editable' using errcode = '22023'; end if;
  if coalesce(trim(p_body), '') = '' then raise exception 'body_required' using errcode = '22023'; end if;
  update public.handover_entries set body = trim(p_body) where id = p_id;
  if p_mentions is not null then
    delete from public.handover_mentions where entry_id = p_id;
    for v_m in select * from jsonb_array_elements(p_mentions) loop
      insert into public.handover_mentions (entry_id, resident_id, staff_id)
      values (p_id, nullif(v_m ->> 'resident_id', '')::uuid, nullif(v_m ->> 'staff_id', '')::uuid);
    end loop;
  end if;
end
$$;
revoke all on function public.correct_handover_note(uuid, text, jsonb) from public, anon;
grant execute on function public.correct_handover_note(uuid, text, jsonb) to authenticated;

-- 3. Frases rápidas: sem uso na interface.
drop table public.quick_phrases;

-- ---------- Lote B: serviços, compras e push ----------

-- 4. Relatório de compras: só pedidos já feitos (placed em diante); by_status.created continua informando os rascunhos.
do $$
declare d text; r oid;
begin
  select p.oid into r from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'report_purchases';
  d := pg_get_functiondef(r);
  d := replace(d, 'with o as (select * from public.shop_orders where delivery_date >= p_from and delivery_date < p_to)',
                  'with o as (select * from public.shop_orders where delivery_date >= p_from and delivery_date < p_to and status <> ''created'')');
  d := replace(d, '(select count(*) from o where status = ''created'')',
                  '(select count(*) from public.shop_orders where status = ''created'' and delivery_date >= p_from and delivery_date < p_to)');
  if position('status <> ''created''' in d) = 0 then raise exception 'r18: patch de report_purchases não aplicado'; end if;
  execute d;
end $$;

-- 5. Pedido entregue não aceita mais mudanças nas linhas.
do $$
declare d text; r oid;
begin
  select p.oid into r from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'set_shop_line';
  d := pg_get_functiondef(r);
  d := replace(d, E'  update public.shop_order_lines\n     set action',
                  E'  if exists (select 1 from public.shop_order_lines l join public.shop_orders o on o.id = l.order_id where l.id = p_line and o.status = ''delivered'') then\n    raise exception ''order_delivered'' using errcode = ''22023'';\n  end if;\n  update public.shop_order_lines\n     set action');
  if position('order_delivered' in d) = 0 then raise exception 'r18: patch de set_shop_line não aplicado'; end if;
  execute d;
end $$;

-- 6. Correções registradas: leitura de geladeira e entrega (motivo obrigatório; auditoria guarda o antes e o depois).
alter table public.fridge_readings add column corrected_at timestamptz, add column corrected_by uuid references public.staff(id), add column correction_reason text;
alter table public.food_deliveries add column corrected_at timestamptz, add column corrected_by uuid references public.staff(id), add column correction_reason text;

create or replace function public.correct_fridge_reading(p_id uuid, p_temperature numeric, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_r public.fridge_readings;
begin
  select * into v_r from public.fridge_readings where id = p_id for update;
  if not found then raise exception 'reading_not_found' using errcode = 'P0002'; end if;
  if public.current_staff_id() is null or not public.can_write_lodge(v_r.lodge_id) then raise exception 'not_authorised' using errcode = '42501'; end if;
  if not public.is_management() and (v_r.recorded_by <> public.current_staff_id() or v_r.recorded_at < now() - public.correction_window()) then
    raise exception 'correction_window_closed' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required' using errcode = '22023'; end if;
  if p_temperature is null then raise exception 'temperature_required' using errcode = '22023'; end if;
  if p_temperature < -40 or p_temperature > 40 then raise exception 'invalid_temperature' using errcode = '22023'; end if;
  update public.fridge_readings
     set temperature = round(p_temperature, 1),
         out_of_range = p_temperature < range_min or p_temperature > range_max,
         corrected_at = now(), corrected_by = public.current_staff_id(), correction_reason = trim(p_reason)
   where id = p_id;
end $$;
revoke all on function public.correct_fridge_reading(uuid, numeric, text) from public, anon;
grant execute on function public.correct_fridge_reading(uuid, numeric, text) to authenticated;

create or replace function public.correct_food_delivery(p_id uuid, p_batch text, p_expiry date, p_temperature numeric, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_d public.food_deliveries;
begin
  select * into v_d from public.food_deliveries where id = p_id for update;
  if not found then raise exception 'delivery_not_found' using errcode = 'P0002'; end if;
  if public.current_staff_id() is null or not public.can_write_lodge(v_d.lodge_id) then raise exception 'not_authorised' using errcode = '42501'; end if;
  if not public.is_management() and (v_d.received_by is distinct from public.current_staff_id() or v_d.received_at < now() - public.correction_window()) then
    raise exception 'correction_window_closed' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required' using errcode = '22023'; end if;
  if p_temperature is not null and (p_temperature < -40 or p_temperature > 99) then raise exception 'invalid_temperature' using errcode = '22023'; end if;
  update public.food_deliveries
     set batch = nullif(trim(p_batch), ''), expiry_date = p_expiry, temperature = p_temperature,
         corrected_at = now(), corrected_by = public.current_staff_id(), correction_reason = trim(p_reason)
   where id = p_id;
end $$;
revoke all on function public.correct_food_delivery(uuid, text, date, numeric, text) from public, anon;
grant execute on function public.correct_food_delivery(uuid, text, date, numeric, text) to authenticated;

-- 7. Desvincular entrega de pedido (gestão): o pedido volta a "awaiting".
create or replace function public.unlink_delivery_from_order(p_delivery uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_d public.food_deliveries;
begin
  if public.current_staff_id() is null or not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  select * into v_d from public.food_deliveries where id = p_delivery for update;
  if not found then raise exception 'delivery_not_found' using errcode = 'P0002'; end if;
  if v_d.order_id is null then raise exception 'not_linked' using errcode = '22023'; end if;
  update public.shop_orders set status = 'awaiting', delivered_at = null, delivered_by = null, delivery_id = null where id = v_d.order_id;
  update public.food_deliveries set order_id = null where id = p_delivery;
end $$;
revoke all on function public.unlink_delivery_from_order(uuid) from public, anon;
grant execute on function public.unlink_delivery_from_order(uuid) to authenticated;

-- 8. Push para todas as notificações da gestão.
create or replace function public.push_keys(p_kind text, p_payload jsonb)
returns text[] language sql immutable as $$
  select case p_kind
    when 'handover_tag' then array(select 'tag:' || jsonb_array_elements_text(p_payload -> 'tags'))
    when 'maintenance_opened' then array['maintenance:' || coalesce(p_payload ->> 'priority', 'normal')]
    when 'warning_recorded' then array['warning']
    when 'shift_hours_review' then array['shift_hours_review']
    when 'fridge_out_of_range' then array['fridge_out_of_range']
    when 'delivery_received' then array['delivery_received']
    when 'delivery_expiring' then array['delivery_expiring']
    when 'no_show_monthly_limit' then array['no_show_monthly_limit']
    when 'coverage_below_minimum' then array['coverage_below_minimum']
    when 'vacation_conflict' then array['vacation_conflict']
    else '{}'::text[] end
$$;

create or replace function public.push_default(p_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when p_key like 'tag:%' then coalesce((select notify_default from public.handover_tags where code = substr(p_key, 5)), false)
    when p_key in ('maintenance:urgent', 'warning', 'shift_hours_review', 'fridge_out_of_range',
                   'delivery_received', 'delivery_expiring', 'no_show_monthly_limit', 'coverage_below_minimum', 'vacation_conflict') then true
    else false end
$$;

do $$
declare d text; r oid;
begin
  select p.oid into r from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'my_push_prefs';
  d := pg_get_functiondef(r);
  d := replace(d, E'union all select ''fridge_out_of_range'', ''Fridge out of range'', ''other'', 301) k',
                  E'union all select ''fridge_out_of_range'', ''Fridge out of range'', ''other'', 301\n          union all select ''delivery_received'', ''Delivery received'', ''other'', 302\n          union all select ''delivery_expiring'', ''Delivery expiring'', ''other'', 303\n          union all select ''no_show_monthly_limit'', ''No Show monthly limit'', ''other'', 304\n          union all select ''coverage_below_minimum'', ''Coverage below minimum'', ''other'', 305\n          union all select ''vacation_conflict'', ''Holiday conflict'', ''other'', 306) k');
  if position('vacation_conflict' in d) = 0 then raise exception 'r18: patch de my_push_prefs não aplicado'; end if;
  execute d;
end $$;
