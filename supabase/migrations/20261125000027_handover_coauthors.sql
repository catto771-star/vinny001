-- Revisão 8: uma anotação do Handover pode citar o autor (filled_by) e até 3 colegas (4 pessoas no total).
create table public.handover_entry_staff (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.handover_entries(id) on delete cascade,
  staff_id uuid not null references public.staff(id),
  position smallint not null check (position between 1 and 3),
  unique (entry_id, staff_id),
  unique (entry_id, position)
);
create index handover_entry_staff_staff_idx on public.handover_entry_staff(staff_id);
alter table public.handover_entry_staff enable row level security;
revoke all on public.handover_entry_staff from anon, authenticated;
grant select on public.handover_entry_staff to authenticated;
create policy handover_entry_staff_read on public.handover_entry_staff for select to authenticated using (public.is_active_staff());
create trigger audit_handover_entry_staff after insert or update or delete on public.handover_entry_staff for each row execute function public.audit_row();

-- Anotação com colegas: assinatura nova (último parâmetro opcional), a anterior sai para não gerar ambiguidade.
drop function if exists public.add_handover_note(uuid, text, timestamptz, jsonb, text, uuid, uuid[]);
create or replace function public.add_handover_note(
  p_lodge uuid, p_body text, p_occurred_at timestamptz, p_mentions jsonb, p_late_reason text,
  p_filled_by uuid default null, p_tags uuid[] default null, p_co_authors uuid[] default null
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
  v_co uuid[];
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
  -- Colegas: sem repetição e sem o próprio autor; no máximo 3.
  select coalesce(array_agg(x.id order by x.ord), '{}') into v_co
  from (select c.id, min(c.ord) as ord from unnest(coalesce(p_co_authors, '{}')) with ordinality c(id, ord)
        where c.id is distinct from p_filled_by group by c.id) x;
  if cardinality(v_co) > 3 then raise exception 'too_many_authors' using errcode = '22023'; end if;
  if exists (select 1 from unnest(v_co) c(id) where not exists (
       select 1 from public.staff s where s.id = c.id and s.active and s.role in ('porter', 'manager', 'owner', 'developer'))) then
    raise exception 'invalid_co_author' using errcode = '22023';
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
  insert into public.handover_entry_staff (entry_id, staff_id, position)
    select v_id, c.id, c.ord::smallint from unnest(v_co) with ordinality c(id, ord);
  select array_agg(g.code order by g.sort_order) into v_codes from public.handover_tags g where g.id = any (coalesce(p_tags, '{}'));
  if v_codes is not null then
    insert into public.notifications (kind, audience, lodge_id, payload)
    values ('handover_tag', 'management', p_lodge,
            jsonb_build_object('entry_id', v_id, 'tags', to_jsonb(v_codes), 'excerpt', left(trim(p_body), 140)));
  end if;
  return v_id;
end
$$;
revoke all on function public.add_handover_note(uuid, text, timestamptz, jsonb, text, uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.add_handover_note(uuid, text, timestamptz, jsonb, text, uuid, uuid[], uuid[]) to authenticated;

-- A ficha da pessoa também lista as anotações em que ela foi colega.
create or replace function public.person_summary(p_staff uuid)
returns jsonb
language plpgsql stable
security definer
set search_path = public
as $$
declare
  v_m1 timestamptz := public.operational_day_start(date_trunc('month', public.operational_day(now()))::date);
  v_m2 timestamptz := public.operational_day_start((date_trunc('month', public.operational_day(now())) + interval '1 month')::date);
begin
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  if not exists (select 1 from public.staff where id = p_staff) then raise exception 'staff_not_found' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'functions', coalesce((select jsonb_object_agg(function, n) from (
        select r.function, count(*) n from public.rota_shifts r
        where r.staff_id = p_staff and r.status = 'published' and r.starts_at > now() - interval '60 days' group by 1) x), '{}'::jsonb),
    'roster_upcoming', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'function', r.function, 'lodge_id', r.lodge_id, 'starts_at', r.starts_at, 'ends_at', r.ends_at) order by r.starts_at)
        from public.rota_shifts r where r.staff_id = p_staff and r.status = 'published' and r.starts_at >= now() and r.starts_at < now() + interval '14 days'), '[]'::jsonb),
    'shifts_recent', coalesce((select jsonb_agg(x order by x.opened_at desc) from (
        select s.id, s.lodge_id, s.opened_at, s.closed_at, s.hours_status from public.handover_shifts s
        where s.staff_id = p_staff order by s.opened_at desc limit 10) x), '[]'::jsonb),
    'notes_recent', coalesce((select jsonb_agg(x order by x.occurred_at desc) from (
        select e.id, e.lodge_id, e.kind, e.body, e.occurred_at from public.handover_entries e
        where (e.filled_by = p_staff or exists (select 1 from public.handover_entry_staff c where c.entry_id = e.id and c.staff_id = p_staff))
          and e.status = 'active' and e.kind <> 'shift' order by e.occurred_at desc limit 15) x), '[]'::jsonb),
    'hours_month', (select jsonb_build_object('planned_minutes', h.planned_minutes, 'effective_minutes', h.effective_minutes)
        from public.staff_hours(v_m1, v_m2) h where h.staff_id = p_staff),
    'tasks_signed_30d', (select count(*) from public.task_signatures t where t.staff_id = p_staff and t.signed_at > now() - interval '30 days')
  );
end
$$;
notify pgrst, 'reload schema';
