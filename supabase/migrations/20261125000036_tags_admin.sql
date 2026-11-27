-- Revisão 14: o Admin gere as tags do Handover (criar, renomear, cor, aviso padrão, ordem). Esconder continua em set_handover_tag.
alter table public.handover_tags add column color text not null default 'grey' check (color in ('red', 'amber', 'blue', 'green', 'violet', 'grey'));
update public.handover_tags set color = case code when 'incident' then 'red' when 'emergency' then 'red' when 'health' then 'amber' when 'damage' then 'amber' else 'grey' end;
revoke all on public.handover_tags from anon, authenticated;
grant select on public.handover_tags to authenticated;

create or replace function public.add_handover_tag(p_label text, p_color text default 'grey', p_notify boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_label text := trim(coalesce(p_label, '')); v_base text; v_code text; v_n integer := 0; v_id uuid; v_order integer;
begin
  if public.current_staff_id() is null or not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  if v_label = '' then raise exception 'name_required' using errcode = '22023'; end if;
  if char_length(v_label) > 30 then raise exception 'invalid_name' using errcode = '22023'; end if;
  if p_color not in ('red', 'amber', 'blue', 'green', 'violet', 'grey') then raise exception 'invalid_color' using errcode = '22023'; end if;
  if (select count(*) from public.handover_tags) >= 20 then raise exception 'too_many_tags' using errcode = '22023'; end if;
  if exists (select 1 from public.handover_tags where lower(label) = lower(v_label)) then raise exception 'tag_exists' using errcode = '23505'; end if;
  -- Código só com letras e _ (as preferências de aviso aceitam apenas esse formato).
  v_base := trim(both '_' from regexp_replace(lower(v_label), '[^a-z]+', '_', 'g'));
  if v_base = '' then v_base := 'tag'; end if;
  v_code := v_base;
  while exists (select 1 from public.handover_tags where code = v_code) loop
    v_n := v_n + 1;
    v_code := v_base || '_' || translate(v_n::text, '0123456789', 'abcdefghij');
  end loop;
  select coalesce(max(sort_order), 0) + 1 into v_order from public.handover_tags;
  insert into public.handover_tags (code, label, sort_order, visible, notify_default, color)
  values (v_code, v_label, v_order, true, coalesce(p_notify, false), p_color) returning id into v_id;
  return v_id;
end $$;

create or replace function public.update_handover_tag(p_tag uuid, p_label text, p_color text, p_notify boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_label text := trim(coalesce(p_label, ''));
begin
  if public.current_staff_id() is null or not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  if v_label = '' then raise exception 'name_required' using errcode = '22023'; end if;
  if char_length(v_label) > 30 then raise exception 'invalid_name' using errcode = '22023'; end if;
  if p_color not in ('red', 'amber', 'blue', 'green', 'violet', 'grey') then raise exception 'invalid_color' using errcode = '22023'; end if;
  if exists (select 1 from public.handover_tags where lower(label) = lower(v_label) and id <> p_tag) then raise exception 'tag_exists' using errcode = '23505'; end if;
  update public.handover_tags set label = v_label, color = p_color, notify_default = coalesce(p_notify, notify_default) where id = p_tag;
  if not found then raise exception 'invalid_tag' using errcode = '22023'; end if;
end $$;

create or replace function public.move_handover_tag(p_tag uuid, p_dir integer)
returns void language plpgsql security definer set search_path = public as $$
declare v_me public.handover_tags; v_other public.handover_tags;
begin
  if public.current_staff_id() is null or not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  select * into v_me from public.handover_tags where id = p_tag;
  if not found then raise exception 'invalid_tag' using errcode = '22023'; end if;
  if p_dir < 0 then
    select * into v_other from public.handover_tags where sort_order < v_me.sort_order order by sort_order desc limit 1;
  else
    select * into v_other from public.handover_tags where sort_order > v_me.sort_order order by sort_order asc limit 1;
  end if;
  if not found then return; end if;
  update public.handover_tags set sort_order = case id when v_me.id then v_other.sort_order else v_me.sort_order end where id in (v_me.id, v_other.id);
end $$;

do $$ declare f text; begin
  for f in select unnest(array['add_handover_tag(text, text, boolean)', 'update_handover_tag(uuid, text, text, boolean)', 'move_handover_tag(uuid, integer)']) loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
notify pgrst, 'reload schema';
