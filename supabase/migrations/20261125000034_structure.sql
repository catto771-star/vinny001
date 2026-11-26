-- Revisão 13: Admin gere a estrutura — quartos, camas, geladeiras, máquinas de lavar e dados da casa.
-- Nada é apagado de vez: "remover" desativa (histórico e Audit ficam); o que está em uso não sai.

create or replace function public.structure_guard()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if public.current_staff_id() is null or not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
end $$;

create or replace function public.add_room(p_lodge uuid, p_code text, p_kind text default 'room', p_beds integer default 1)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_code text := trim(coalesce(p_code, '')); v_id uuid; v_order integer;
begin
  perform public.structure_guard();
  if v_code = '' then raise exception 'name_required' using errcode = '22023'; end if;
  if char_length(v_code) > 20 then raise exception 'invalid_name' using errcode = '22023'; end if;
  if p_kind not in ('room', 'apartment') then raise exception 'invalid_kind' using errcode = '22023'; end if;
  if coalesce(p_beds, 0) < 1 or p_beds > 12 then raise exception 'too_many_beds' using errcode = '22023'; end if;
  if not exists (select 1 from public.lodges where id = p_lodge and active) then raise exception 'lodge_not_found' using errcode = 'P0002'; end if;
  if exists (select 1 from public.rooms where lodge_id = p_lodge and kind = p_kind::public.room_kind and lower(code) = lower(v_code)) then
    raise exception 'room_exists' using errcode = '23505';
  end if;
  select coalesce(max(sort_order), 0) + 1 into v_order from public.rooms where lodge_id = p_lodge;
  insert into public.rooms (lodge_id, kind, code, sort_order) values (p_lodge, p_kind::public.room_kind, v_code, v_order) returning id into v_id;
  insert into public.beds (room_id, number) select v_id, n from generate_series(1, p_beds) n;
  return v_id;
end $$;

create or replace function public.rename_room(p_room uuid, p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare v_code text := trim(coalesce(p_code, '')); v_r public.rooms;
begin
  perform public.structure_guard();
  if v_code = '' then raise exception 'name_required' using errcode = '22023'; end if;
  if char_length(v_code) > 20 then raise exception 'invalid_name' using errcode = '22023'; end if;
  select * into v_r from public.rooms where id = p_room;
  if not found then raise exception 'room_not_found' using errcode = 'P0002'; end if;
  if exists (select 1 from public.rooms where lodge_id = v_r.lodge_id and kind = v_r.kind and lower(code) = lower(v_code) and id <> p_room) then
    raise exception 'room_exists' using errcode = '23505';
  end if;
  update public.rooms set code = v_code where id = p_room;
end $$;

create or replace function public.add_bed(p_room uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_n integer; v_id uuid;
begin
  perform public.structure_guard();
  if not exists (select 1 from public.rooms where id = p_room) then raise exception 'room_not_found' using errcode = 'P0002'; end if;
  select coalesce(max(number), 0) + 1 into v_n from public.beds where room_id = p_room;
  if v_n > 12 then raise exception 'too_many_beds' using errcode = '22023'; end if;
  insert into public.beds (room_id, number) values (p_room, v_n) returning id into v_id;
  return v_id;
end $$;

create or replace function public.set_room_active(p_room uuid, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.structure_guard();
  if not exists (select 1 from public.rooms where id = p_room) then raise exception 'room_not_found' using errcode = 'P0002'; end if;
  if not coalesce(p_active, true) and exists (select 1 from public.stays s join public.beds b on b.id = s.bed_id where b.room_id = p_room and s.status <> 'ended') then
    raise exception 'room_occupied' using errcode = '23514';
  end if;
  update public.rooms set active = coalesce(p_active, true) where id = p_room;
end $$;

create or replace function public.set_bed_active(p_bed uuid, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.structure_guard();
  if not exists (select 1 from public.beds where id = p_bed) then raise exception 'bed_not_found' using errcode = 'P0002'; end if;
  if not coalesce(p_active, true) and exists (select 1 from public.stays where bed_id = p_bed and status <> 'ended') then
    raise exception 'bed_occupied' using errcode = '23514';
  end if;
  update public.beds set active = coalesce(p_active, true) where id = p_bed;
end $$;

create or replace function public.add_fridge(p_lodge uuid, p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_name text := trim(coalesce(p_name, '')); v_n integer; v_id uuid;
begin
  perform public.structure_guard();
  if v_name = '' then raise exception 'name_required' using errcode = '22023'; end if;
  if char_length(v_name) > 40 then raise exception 'invalid_name' using errcode = '22023'; end if;
  if not exists (select 1 from public.lodges where id = p_lodge and active) then raise exception 'lodge_not_found' using errcode = 'P0002'; end if;
  select coalesce(max(nullif(regexp_replace(code, '\D', '', 'g'), '')::int), 0) + 1 into v_n from public.fridges where lodge_id = p_lodge;
  insert into public.fridges (lodge_id, code, name, sort_order) values (p_lodge, 'F' || v_n, v_name, v_n) returning id into v_id;
  return v_id;
end $$;

create or replace function public.rename_fridge(p_fridge uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare v_name text := trim(coalesce(p_name, ''));
begin
  perform public.structure_guard();
  if v_name = '' then raise exception 'name_required' using errcode = '22023'; end if;
  if char_length(v_name) > 40 then raise exception 'invalid_name' using errcode = '22023'; end if;
  update public.fridges set name = v_name where id = p_fridge;
  if not found then raise exception 'fridge_not_found' using errcode = 'P0002'; end if;
end $$;

create or replace function public.set_fridge_active(p_fridge uuid, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.structure_guard();
  update public.fridges set active = coalesce(p_active, true) where id = p_fridge;
  if not found then raise exception 'fridge_not_found' using errcode = 'P0002'; end if;
end $$;

create or replace function public.add_laundry_machine(p_lodge uuid, p_kind text, p_label text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_label text := trim(coalesce(p_label, '')); v_n integer; v_id uuid;
begin
  perform public.structure_guard();
  if v_label = '' then raise exception 'name_required' using errcode = '22023'; end if;
  if char_length(v_label) > 40 then raise exception 'invalid_name' using errcode = '22023'; end if;
  if p_kind not in ('wash', 'dry') then raise exception 'invalid_kind' using errcode = '22023'; end if;
  if not exists (select 1 from public.lodges where id = p_lodge and active) then raise exception 'lodge_not_found' using errcode = 'P0002'; end if;
  select count(*) + 1 into v_n from public.laundry_machines where lodge_id = p_lodge;
  while exists (select 1 from public.laundry_machines where lodge_id = p_lodge and code = 'M' || v_n || '-' || upper(p_kind)) loop v_n := v_n + 1; end loop;
  insert into public.laundry_machines (lodge_id, code, label, kind, sort_order) values (p_lodge, 'M' || v_n || '-' || upper(p_kind), v_label, p_kind, 100 + v_n) returning id into v_id;
  return v_id;
end $$;

create or replace function public.rename_laundry_machine(p_machine uuid, p_label text)
returns void language plpgsql security definer set search_path = public as $$
declare v_label text := trim(coalesce(p_label, ''));
begin
  perform public.structure_guard();
  if v_label = '' then raise exception 'name_required' using errcode = '22023'; end if;
  if char_length(v_label) > 40 then raise exception 'invalid_name' using errcode = '22023'; end if;
  update public.laundry_machines set label = v_label where id = p_machine;
  if not found then raise exception 'machine_not_found' using errcode = 'P0002'; end if;
end $$;

create or replace function public.set_laundry_machine_active(p_machine uuid, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.structure_guard();
  if not exists (select 1 from public.laundry_machines where id = p_machine) then raise exception 'machine_not_found' using errcode = 'P0002'; end if;
  if not coalesce(p_active, true) and exists (select 1 from public.laundry_uses where machine_id = p_machine and finished_at is null) then
    raise exception 'machine_busy' using errcode = '23514';
  end if;
  update public.laundry_machines set active = coalesce(p_active, true) where id = p_machine;
end $$;

create or replace function public.update_lodge(p_lodge uuid, p_name text, p_short_name text, p_has_dinner boolean, p_has_laundry boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_name text := trim(coalesce(p_name, '')); v_short text := trim(coalesce(p_short_name, ''));
begin
  perform public.structure_guard();
  if v_name = '' or v_short = '' then raise exception 'name_required' using errcode = '22023'; end if;
  if char_length(v_name) > 60 or char_length(v_short) > 30 then raise exception 'invalid_name' using errcode = '22023'; end if;
  update public.lodges set name = v_name, short_name = v_short, has_dinner = coalesce(p_has_dinner, has_dinner), has_laundry = coalesce(p_has_laundry, has_laundry) where id = p_lodge;
  if not found then raise exception 'lodge_not_found' using errcode = 'P0002'; end if;
end $$;

do $$
declare f text;
begin
  for f in select unnest(array[
    'add_room(uuid, text, text, integer)', 'rename_room(uuid, text)', 'add_bed(uuid)', 'set_room_active(uuid, boolean)', 'set_bed_active(uuid, boolean)',
    'add_fridge(uuid, text)', 'rename_fridge(uuid, text)', 'set_fridge_active(uuid, boolean)',
    'add_laundry_machine(uuid, text, text)', 'rename_laundry_machine(uuid, text)', 'set_laundry_machine_active(uuid, boolean)',
    'update_lodge(uuid, text, text, boolean, boolean)'])
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke all on function public.structure_guard() from public, anon, authenticated;
create trigger audit_laundry_machines after insert or update or delete on public.laundry_machines for each row execute function public.audit_row();
notify pgrst, 'reload schema';
