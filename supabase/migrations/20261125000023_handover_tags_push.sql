-- Revisão 3: tags no Handover (no lugar dos atalhos), escolha de quem recebe cada notificação
-- (cada Admin escolhe as suas) e assinaturas de push do app PWA dos Admins.

create table public.handover_tags (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z_]+$'),
  label text not null,
  sort_order integer not null default 0,
  visible boolean not null default true,
  notify_default boolean not null default false
);
create trigger audit_handover_tags after insert or update or delete on public.handover_tags for each row execute function public.audit_row();
insert into public.handover_tags (code, label, sort_order, notify_default) values
  ('incident', 'Incident / Safety', 1, true), ('emergency', 'Gardaí / Ambulance', 2, true),
  ('health', 'Health / Medical', 3, true), ('damage', 'Damage / Property', 4, true),
  ('conduct', 'Resident conduct', 5, false), ('visitor', 'Visitor / External service', 6, false),
  ('delivery', 'Delivery', 7, false), ('general', 'General', 8, false);

create table public.handover_entry_tags (
  entry_id uuid not null references public.handover_entries(id) on delete cascade,
  tag_id uuid not null references public.handover_tags(id),
  primary key (entry_id, tag_id)
);

-- Preferência de cada Admin. Sem linha = padrão (tags com notify_default, Warnings e manutenção urgente).
create table public.push_prefs (
  staff_id uuid not null references public.staff(id),
  key text not null check (key ~ '^(tag:[a-z_]+|maintenance:(urgent|normal|low)|warning|shift_hours_review|fridge_out_of_range)$'),
  enabled boolean not null,
  primary key (staff_id, key)
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id),
  endpoint text not null unique check (endpoint ~ '^https://'),
  p256dh text not null,
  auth text not null,
  device text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

alter table public.handover_tags enable row level security;
alter table public.handover_entry_tags enable row level security;
alter table public.push_prefs enable row level security;
alter table public.push_subscriptions enable row level security;
revoke all on public.handover_tags, public.handover_entry_tags, public.push_prefs, public.push_subscriptions from anon, authenticated;
grant select on public.handover_tags, public.handover_entry_tags to authenticated;
create policy handover_tags_read on public.handover_tags for select to authenticated using (public.is_active_staff());
create policy handover_entry_tags_read on public.handover_entry_tags for select to authenticated using (public.is_active_staff());

create or replace function public.set_handover_tag(p_tag uuid, p_visible boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  update public.handover_tags set visible = coalesce(p_visible, true) where id = p_tag;
  if not found then raise exception 'invalid_tag' using errcode = '22023'; end if;
end
$$;

-- Anotação com tags. Tag com alerta gera uma notificação (quem recebe sai das preferências).
drop function if exists public.add_handover_note(uuid, text, timestamptz, jsonb, text, uuid);
create or replace function public.add_handover_note(
  p_lodge uuid, p_body text, p_occurred_at timestamptz, p_mentions jsonb, p_late_reason text, p_filled_by uuid default null, p_tags uuid[] default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_at timestamptz := coalesce(p_occurred_at, now());
  v_reasons jsonb := public.param_value('handover.late_reasons');
  v_id uuid;
  v_codes text[];
begin
  if public.current_staff_id() is null or not public.can_write_lodge(p_lodge) then
    raise exception 'not_authorised' using errcode = '42501';
  end if;
  if coalesce(trim(p_body), '') = '' then raise exception 'body_required' using errcode = '22023'; end if;
  if v_at > now() + interval '5 minutes' then raise exception 'invalid_time' using errcode = '22023'; end if;
  if p_filled_by is not null and not exists (
       select 1 from public.staff where id = p_filled_by and active and role in ('porter', 'manager', 'owner', 'developer')) then
    raise exception 'invalid_filled_by' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(coalesce(p_tags, '{}')) t(id) where not exists (select 1 from public.handover_tags g where g.id = t.id and g.visible)) then
    raise exception 'invalid_tag' using errcode = '22023';
  end if;
  if now() > public.shift_end(v_at) and not public.is_management() then
    if p_late_reason is null or not (v_reasons ? p_late_reason) then
      raise exception 'late_reason_required' using errcode = '22023';
    end if;
  end if;
  perform set_config('app.filled_by', coalesce(p_filled_by::text, ''), true);
  v_id := public.insert_handover_entry(p_lodge, 'note', p_body, v_at, p_mentions,
    case when now() > public.shift_end(v_at) then p_late_reason end);
  perform set_config('app.filled_by', '', true);
  insert into public.handover_entry_tags (entry_id, tag_id) select distinct v_id, t from unnest(coalesce(p_tags, '{}')) t;
  select array_agg(g.code order by g.sort_order) into v_codes from public.handover_tags g where g.id = any (coalesce(p_tags, '{}'));
  if v_codes is not null then
    insert into public.notifications (kind, audience, lodge_id, payload)
    values ('handover_tag', 'management', p_lodge,
            jsonb_build_object('entry_id', v_id, 'tags', to_jsonb(v_codes), 'excerpt', left(trim(p_body), 140)));
  end if;
  return v_id;
end
$$;

-- Warning também notifica.
create or replace function public.warning_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (kind, audience, lodge_id, resident_id, payload)
  values ('warning_recorded', 'management', new.lodge_id, new.resident_id,
          jsonb_build_object('warning_id', new.id, 'type', new.type,
                             'name', (select first_name || ' ' || last_name from public.residents where id = new.resident_id)));
  return new;
end
$$;
create trigger warnings_notify after insert on public.warnings for each row execute function public.warning_notify();

-- A chave de preferência de uma notificação (null = não vai para o celular).
create or replace function public.push_keys(p_kind text, p_payload jsonb)
returns text[]
language sql immutable
as $$
  select case p_kind
    when 'handover_tag' then array(select 'tag:' || jsonb_array_elements_text(p_payload -> 'tags'))
    when 'maintenance_opened' then array['maintenance:' || coalesce(p_payload ->> 'priority', 'normal')]
    when 'warning_recorded' then array['warning']
    when 'shift_hours_review' then array['shift_hours_review']
    when 'fridge_out_of_range' then array['fridge_out_of_range']
    else '{}'::text[] end
$$;

create or replace function public.push_default(p_key text)
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select case
    when p_key like 'tag:%' then coalesce((select notify_default from public.handover_tags where code = substr(p_key, 5)), false)
    when p_key in ('maintenance:urgent', 'warning', 'shift_hours_review', 'fridge_out_of_range') then true
    else false end
$$;

-- Admins que querem receber esta notificação (qualquer chave ligada).
create or replace function public.push_recipients(p_notification bigint)
returns uuid[]
language sql stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(s.id order by s.id), '{}')
  from public.notifications n
  join public.staff s on s.active and s.role in ('manager', 'owner', 'developer')
  where n.id = p_notification and n.audience = 'management'
    and exists (select 1 from unnest(public.push_keys(n.kind, n.payload)) k
                where coalesce((select p.enabled from public.push_prefs p where p.staff_id = s.id and p.key = k), public.push_default(k)))
$$;

create or replace function public.my_push_prefs()
returns jsonb
language plpgsql stable
security definer
set search_path = public
as $$
begin
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  return (select jsonb_agg(jsonb_build_object('key', k.key, 'label', k.label, 'group', k.grp,
            'enabled', coalesce((select p.enabled from public.push_prefs p where p.staff_id = public.current_staff_id() and p.key = k.key), public.push_default(k.key)))
            order by k.ord)
    from (select 'tag:' || code as key, label, 'handover' as grp, sort_order as ord from public.handover_tags
          union all select 'warning', 'Warnings', 'other', 100
          union all select 'maintenance:urgent', 'Urgent', 'maintenance', 200
          union all select 'maintenance:normal', 'Normal', 'maintenance', 201
          union all select 'maintenance:low', 'Low', 'maintenance', 202
          union all select 'shift_hours_review', 'Hours to confirm', 'other', 300
          union all select 'fridge_out_of_range', 'Fridge out of range', 'other', 301) k);
end
$$;

create or replace function public.set_push_pref(p_key text, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  insert into public.push_prefs (staff_id, key, enabled) values (public.current_staff_id(), p_key, coalesce(p_enabled, false))
  on conflict (staff_id, key) do update set enabled = excluded.enabled;
end
$$;

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_device text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  if coalesce(p_endpoint, '') !~ '^https://' or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'invalid_subscription' using errcode = '22023';
  end if;
  insert into public.push_subscriptions (staff_id, endpoint, p256dh, auth, device)
  values (public.current_staff_id(), p_endpoint, p_p256dh, p_auth, left(p_device, 80))
  on conflict (endpoint) do update set staff_id = excluded.staff_id, p256dh = excluded.p256dh, auth = excluded.auth, device = excluded.device;
end
$$;

create or replace function public.remove_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and staff_id = public.current_staff_id()
$$;

revoke all on function public.set_handover_tag(uuid, boolean), public.add_handover_note(uuid, text, timestamptz, jsonb, text, uuid, uuid[]),
  public.warning_notify(), public.push_keys(text, jsonb), public.push_default(text), public.push_recipients(bigint),
  public.my_push_prefs(), public.set_push_pref(text, boolean), public.save_push_subscription(text, text, text, text),
  public.remove_push_subscription(text) from public, anon;
revoke all on function public.warning_notify(), public.push_recipients(bigint) from authenticated;
grant execute on function public.set_handover_tag(uuid, boolean), public.add_handover_note(uuid, text, timestamptz, jsonb, text, uuid, uuid[]),
  public.my_push_prefs(), public.set_push_pref(text, boolean), public.save_push_subscription(text, text, text, text),
  public.remove_push_subscription(text) to authenticated;
