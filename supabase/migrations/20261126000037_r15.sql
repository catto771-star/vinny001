-- Revisão 15: Warning/Final Warning (só dois tipos), PASS ID obrigatório + re-admissão, fornecedores com campos obrigatórios,
-- alertas de validade, pedidos do Tesco por status com vínculo da entrega e nota automática no Handover.

-- ---------- 1. Warning e Final Warning ----------
alter table public.warnings drop constraint warnings_type_check;
-- A conversão passa pelos gatilhos (a auditoria registra a troca de tipo).
update public.warnings set type = case type when 'final_written' then 'final_warning' else 'warning' end;
alter table public.warnings add constraint warnings_type_check check (type in ('warning', 'final_warning'));

do $$ declare r record; d text; begin
  for r in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('has_final_warning', 'deactivate_final_warning') loop
    d := replace(pg_get_functiondef(r.oid), '''final_written''', '''final_warning''');
    execute d;
  end loop;
  -- Relatórios: duas contagens (warning, final_warning) no lugar de três.
  select p.oid into r from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'report_period';
  d := pg_get_functiondef(r.oid);
  d := regexp_replace(d, '''verbal'', \(select count\(\*\) from public\.report_details_period\(p_lodges, p_from, p_to, ''warnings\.verbal''\)\),\s*''written'', \(select count\(\*\) from public\.report_details_period\(p_lodges, p_from, p_to, ''warnings\.written''\)\),',
                      '''warning'', (select count(*) from public.report_details_period(p_lodges, p_from, p_to, ''warnings.warning'')),');
  d := replace(replace(d, '''final_written'', (select', '''final_warning'', (select'), 'warnings.final_written', 'warnings.final_warning');
  execute d;
end $$;

create or replace function public.record_warning(p_stay uuid, p_type text, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_stay public.stays;
  v_entry uuid;
  v_id uuid;
  v_label text := case p_type when 'warning' then 'Warning' when 'final_warning' then 'Final Warning' end;
begin
  select * into v_stay from public.stays where id = p_stay for update;
  if not found or v_stay.status = 'ended' then raise exception 'stay_not_open' using errcode = '22023'; end if;
  if public.current_staff_id() is null or not public.can_write_lodge(v_stay.lodge_id) then
    raise exception 'not_authorised' using errcode = '42501';
  end if;
  if v_label is null then raise exception 'invalid_warning_type' using errcode = '22023'; end if;
  if p_type = 'final_warning' and exists (select 1 from public.warnings where stay_id = p_stay and type = 'final_warning' and active) then
    raise exception 'final_warning_active' using errcode = '23505';
  end if;
  v_entry := public.insert_handover_entry(v_stay.lodge_id, 'warning',
    v_label || coalesce(': ' || nullif(trim(p_note), ''), ''), now(), jsonb_build_array(jsonb_build_object('resident_id', v_stay.resident_id)));
  insert into public.warnings (resident_id, stay_id, lodge_id, type, note, handover_entry_id, issued_by)
  values (v_stay.resident_id, p_stay, v_stay.lodge_id, p_type, nullif(trim(p_note), ''), v_entry, public.current_staff_id())
  returning id into v_id;
  return v_id;
end $$;

-- ---------- 2. PASS ID obrigatório e re-admissão ----------
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

  insert into public.stays (resident_id, lodge_id, bed_id, admitted_at, created_by)
  values (v_resident, p_lodge, p_bed, coalesce(p_admitted_at, now()), v_me)
  returning id into v_stay;
  return v_stay;
end $$;

create or replace function public.find_former_resident(p_pass_id text)
returns table (resident_id uuid, first_name text, last_name text, date_of_birth date, pass_id text, has_open_stay boolean, last_ended_at timestamptz, last_house text)
language sql stable security definer set search_path = public as $$
  select r.id, r.first_name, r.last_name, r.date_of_birth, r.pass_id,
         exists (select 1 from public.stays s where s.resident_id = r.id and s.status <> 'ended'),
         (select max(s.ended_at) from public.stays s where s.resident_id = r.id),
         (select l.name from public.stays s join public.lodges l on l.id = s.lodge_id where s.resident_id = r.id order by s.admitted_at desc limit 1)
  from public.residents r
  where public.current_staff_id() is not null and nullif(trim(coalesce(p_pass_id, '')), '') is not null
    and lower(r.pass_id) = lower(trim(p_pass_id))
  limit 1
$$;

-- ---------- 3. Fornecedores ----------
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0 and char_length(name) <= 40),
  active boolean not null default true,
  require_batch boolean not null default false,
  require_best_before boolean not null default false,
  require_temperature boolean not null default false,
  links_order boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  version integer not null default 1
);
create unique index suppliers_name_unique on public.suppliers (lower(name));
create trigger audit_suppliers after insert or update or delete on public.suppliers for each row execute function public.audit_row();
alter table public.suppliers enable row level security;
revoke all on public.suppliers from anon, authenticated;
grant select on public.suppliers to authenticated;
create policy suppliers_read on public.suppliers for select to authenticated using (public.is_active_staff());
insert into public.suppliers (name, require_batch, require_best_before, links_order, sort_order) values
  ('Tesco', false, false, true, 1),
  ('Ripley''s', true, true, false, 2);

alter table public.food_deliveries alter column batch drop not null, alter column expiry_date drop not null;
alter table public.food_deliveries add column supplier_id uuid references public.suppliers(id);
update public.food_deliveries d set supplier_id = s.id from public.suppliers s where lower(s.name) = lower(d.supplier);

create or replace function public.add_supplier(p_name text, p_batch boolean, p_best_before boolean, p_temperature boolean, p_links_order boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_name text := trim(coalesce(p_name, '')); v_id uuid;
begin
  if public.current_staff_id() is null or not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  if v_name = '' then raise exception 'name_required' using errcode = '22023'; end if;
  if char_length(v_name) > 40 then raise exception 'invalid_name' using errcode = '22023'; end if;
  if exists (select 1 from public.suppliers where lower(name) = lower(v_name)) then raise exception 'supplier_exists' using errcode = '23505'; end if;
  insert into public.suppliers (name, require_batch, require_best_before, require_temperature, links_order, sort_order)
  values (v_name, coalesce(p_batch, false), coalesce(p_best_before, false), coalesce(p_temperature, false), coalesce(p_links_order, false),
          (select coalesce(max(sort_order), 0) + 1 from public.suppliers))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.update_supplier(p_id uuid, p_name text, p_batch boolean, p_best_before boolean, p_temperature boolean, p_links_order boolean, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_name text := trim(coalesce(p_name, ''));
begin
  if public.current_staff_id() is null or not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  if v_name = '' then raise exception 'name_required' using errcode = '22023'; end if;
  if char_length(v_name) > 40 then raise exception 'invalid_name' using errcode = '22023'; end if;
  if exists (select 1 from public.suppliers where lower(name) = lower(v_name) and id <> p_id) then raise exception 'supplier_exists' using errcode = '23505'; end if;
  update public.suppliers
     set name = v_name, require_batch = coalesce(p_batch, require_batch), require_best_before = coalesce(p_best_before, require_best_before),
         require_temperature = coalesce(p_temperature, require_temperature), links_order = coalesce(p_links_order, links_order),
         active = coalesce(p_active, active), version = version + 1
   where id = p_id;
  if not found then raise exception 'supplier_not_found' using errcode = 'P0002'; end if;
  update public.food_deliveries set supplier = v_name where supplier_id = p_id and supplier is distinct from v_name;
end $$;

-- Parâmetro: quantos dias antes do Best before o Admin é avisado.
insert into public.parameters (key, value) values ('delivery.expiry_alert_days', '3');
do $$ declare r record; d text; begin
  select p.oid into r from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'set_system_parameter';
  d := pg_get_functiondef(r.oid);
  d := replace(d, '''presence.check_window_minutes'') then', '''presence.check_window_minutes'', ''delivery.expiry_alert_days'') then');
  d := replace(d, 'when ''presence.check_window_minutes'' then 5 else 1 end', 'when ''presence.check_window_minutes'' then 5 when ''delivery.expiry_alert_days'' then 0 else 1 end');
  d := replace(d, 'when ''presence.check_window_minutes'' then 180 else 240 end', 'when ''presence.check_window_minutes'' then 180 when ''delivery.expiry_alert_days'' then 60 else 240 end');
  execute d;
end $$;

-- ---------- 4. New Delivery ----------
drop function public.record_food_delivery(uuid, text, text, text, date, numeric, text);
create or replace function public.record_food_delivery(p_lodge uuid, p_product text, p_supplier uuid, p_batch text, p_expiry date, p_temperature numeric, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_sup public.suppliers;
  v_days integer := coalesce((public.param_value('delivery.expiry_alert_days') #>> '{}')::integer, 3);
  v_me text := (select full_name from public.staff where id = public.current_staff_id());
begin
  if not public.can_see_lodge(p_lodge) then raise exception 'not_authorised' using errcode = '42501'; end if;
  if public.current_staff_id() is null or not public.can_write_lodge(p_lodge) then
    raise exception 'not_authorised' using errcode = '42501';
  end if;
  if not exists (select 1 from public.lodges where id = p_lodge and has_dinner) then
    raise exception 'service_not_available' using errcode = '22023';
  end if;
  select * into v_sup from public.suppliers where id = p_supplier;
  if not found then raise exception 'fields_required' using errcode = '22023'; end if;
  if not v_sup.active then raise exception 'supplier_inactive' using errcode = '22023'; end if;
  if coalesce(trim(p_product), '') = '' then raise exception 'fields_required' using errcode = '22023'; end if;
  if v_sup.require_batch and coalesce(trim(p_batch), '') = '' then raise exception 'batch_required' using errcode = '22023'; end if;
  if v_sup.require_best_before and p_expiry is null then raise exception 'best_before_required' using errcode = '22023'; end if;
  if v_sup.require_temperature and p_temperature is null then raise exception 'temperature_required' using errcode = '22023'; end if;
  if p_temperature is not null and (p_temperature < -40 or p_temperature > 99) then
    raise exception 'invalid_temperature' using errcode = '22023';
  end if;
  insert into public.food_deliveries (lodge_id, product, supplier, supplier_id, batch, expiry_date, temperature, note, received_by)
  values (p_lodge, trim(p_product), v_sup.name, v_sup.id, nullif(trim(coalesce(p_batch, '')), ''), p_expiry, round(p_temperature, 1), nullif(trim(coalesce(p_note, '')), ''), public.current_staff_id())
  returning id into v_id;
  if v_sup.links_order then
    insert into public.notifications (kind, audience, lodge_id, payload)
    values ('delivery_received', 'management', p_lodge, jsonb_build_object('delivery_id', v_id, 'supplier', v_sup.name, 'product', trim(p_product), 'received_by', v_me));
  end if;
  if p_expiry is not null and p_expiry <= current_date + v_days then
    insert into public.notifications (kind, audience, lodge_id, payload)
    values ('delivery_expiring', 'management', p_lodge, jsonb_build_object('delivery_id', v_id, 'supplier', v_sup.name, 'product', trim(p_product), 'expiry', p_expiry));
  end if;
  return v_id;
end $$;

-- ---------- 5. Pedidos por status e vínculo ----------
alter table public.shop_orders drop constraint shop_orders_status_check;
update public.shop_orders set status = 'created' where status = 'draft';
alter table public.shop_orders alter column status set default 'created';
alter table public.shop_orders add constraint shop_orders_status_check check (status in ('created', 'placed', 'awaiting', 'delivered'));
alter table public.shop_orders add column delivered_at timestamptz, add column delivered_by uuid references public.staff(id), add column delivery_id uuid references public.food_deliveries(id);
alter table public.food_deliveries add column order_id uuid references public.shop_orders(id);

create or replace function public.set_shop_order(p_order uuid, p_delivery date, p_notes text, p_placed boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  if p_delivery is null or not isfinite(p_delivery) or p_delivery < current_date - 366 or p_delivery > current_date + 366 then
    raise exception 'invalid_date' using errcode = '22023';
  end if;
  update public.shop_orders
     set delivery_date = p_delivery, notes = nullif(trim(p_notes), ''),
         status = case when status in ('awaiting', 'delivered') then status when p_placed then 'placed' else 'created' end,
         placed_at = case when status in ('awaiting', 'delivered') then placed_at when p_placed then coalesce(placed_at, now()) end
   where id = p_order;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
end $$;

create or replace function public.set_shop_order_status(p_order uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare v_o public.shop_orders;
begin
  if public.current_staff_id() is null or not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  if p_status not in ('created', 'placed', 'awaiting') then raise exception 'invalid_status' using errcode = '22023'; end if;
  select * into v_o from public.shop_orders where id = p_order for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if v_o.status = 'delivered' then raise exception 'order_delivered' using errcode = '22023'; end if;
  update public.shop_orders
     set status = p_status, placed_at = case when p_status = 'created' then null else coalesce(placed_at, now()) end
   where id = p_order;
end $$;

create or replace function public.link_delivery_to_order(p_delivery uuid, p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_d public.food_deliveries;
  v_o public.shop_orders;
  v_who text;
  v_entry uuid;
  v_lines integer;
begin
  if public.current_staff_id() is null or not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  select * into v_d from public.food_deliveries where id = p_delivery for update;
  if not found then raise exception 'delivery_not_found' using errcode = 'P0002'; end if;
  if v_d.order_id is not null then raise exception 'already_linked' using errcode = '23505'; end if;
  if not exists (select 1 from public.suppliers s where s.id = v_d.supplier_id and s.links_order) then
    raise exception 'delivery_not_linkable' using errcode = '22023';
  end if;
  select * into v_o from public.shop_orders where id = p_order for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if v_o.status not in ('placed', 'awaiting') then raise exception 'order_not_open' using errcode = '22023'; end if;
  select full_name into v_who from public.staff where id = v_d.received_by;
  select count(*) into v_lines from public.shop_order_lines where order_id = v_o.id and action <> 'dont' and coalesce(final_qty, 0) > 0;
  update public.food_deliveries set order_id = v_o.id where id = v_d.id;
  update public.shop_orders set status = 'delivered', delivered_at = v_d.received_at, delivered_by = v_d.received_by, delivery_id = v_d.id where id = v_o.id;
  v_entry := public.insert_handover_entry(v_d.lodge_id, 'note',
    format('Tesco order for %s delivered: received by %s at %s.', to_char(v_o.delivery_date, 'DD/MM/YYYY'), coalesce(v_who, 'unknown'),
           to_char(v_d.received_at at time zone 'Europe/Dublin', 'DD/MM/YYYY HH24:MI')),
    v_d.received_at, case when v_d.received_by is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('staff_id', v_d.received_by)) end);
  insert into public.handover_entry_tags (entry_id, tag_id) select v_entry, id from public.handover_tags where code = 'delivery';
end $$;

-- Relatórios: pedidos por status.
do $$ declare r record; d text; begin
  select p.oid into r from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'report_purchases';
  d := pg_get_functiondef(r.oid);
  d := replace(d, '''placed'', (select count(*) from o where status = ''placed''),', '''placed'', (select count(*) from o where status = ''placed''),
      ''by_status'', jsonb_build_object(''created'', (select count(*) from o where status = ''created''), ''placed'', (select count(*) from o where status = ''placed''),
                                        ''awaiting'', (select count(*) from o where status = ''awaiting''), ''delivered'', (select count(*) from o where status = ''delivered'')),');
  execute d;
end $$;

do $$ declare f text; begin
  for f in select unnest(array['add_supplier(text, boolean, boolean, boolean, boolean)', 'update_supplier(uuid, text, boolean, boolean, boolean, boolean, boolean)',
      'record_food_delivery(uuid, text, uuid, text, date, numeric, text)', 'set_shop_order_status(uuid, text)', 'link_delivery_to_order(uuid, uuid)',
      'find_former_resident(text)', 'admit_resident(uuid, uuid, uuid, text, text, date, text, timestamptz)', 'record_warning(uuid, text, text)']) loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
notify pgrst, 'reload schema';
