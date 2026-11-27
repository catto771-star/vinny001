-- Beta — dois perfis (escopo 2): Staff = conta da casa (uma por Lodge), Admin = Manager, Owner e Developer.
-- Quem está trabalhando vem do Roster; no Handover dá para escolher quem está preenchendo.
-- Horas previstas × trabalhadas saem do Roster (escopo 4.3).

-- ---------------------------------------------------------------------------
-- Conta da casa: lança nas duas casas (o Float troca de casa sem sair), sem assumir posto.
-- ---------------------------------------------------------------------------
create or replace function public.can_write_lodge(p_lodge uuid)
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select public.is_management()
      or (public.current_staff_role() = 'station' and exists (select 1 from public.lodges where id = p_lodge and active))
      or exists (
        select 1 from public.duty_posts p
        where p.staff_id = public.current_staff_id()
          and p.ended_at is null
          and (p.function = 'float' or p.lodge_id = p_lodge)
      )
$$;

-- Pessoa escalada no Roster numa casa num instante: o Office da casa; sem Office, o Float.
create or replace function public.on_duty_staff(p_lodge uuid, p_at timestamptz)
returns uuid
language sql stable
security definer
set search_path = public
as $$
  select r.staff_id from public.rota_shifts r
  where r.status = 'published' and r.starts_at <= p_at and r.ends_at > p_at
    and ((r.function = 'office' and r.lodge_id = p_lodge) or r.function = 'float')
  order by (r.function = 'office') desc, r.starts_at desc
  limit 1
$$;

-- ---------------------------------------------------------------------------
-- Handover: quem está preenchendo (pessoa da equipe). Padrão: a pessoa escalada no Roster
-- quando quem digita é a conta da casa; senão, quem digita.
-- ---------------------------------------------------------------------------
alter table public.handover_entries add column filled_by uuid references public.staff(id);

create or replace function public.handover_fill_default()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chosen text := nullif(current_setting('app.filled_by', true), '');
begin
  if new.filled_by is null then
    new.filled_by := coalesce(
      v_chosen::uuid,
      case when public.current_staff_role() = 'station' then public.on_duty_staff(new.lodge_id, new.occurred_at)
           else public.current_staff_id() end);
  end if;
  return new;
end
$$;
create trigger handover_fill_default before insert on public.handover_entries
  for each row execute function public.handover_fill_default();

drop function if exists public.add_handover_note(uuid, text, timestamptz, jsonb, text);
create or replace function public.add_handover_note(
  p_lodge uuid, p_body text, p_occurred_at timestamptz, p_mentions jsonb, p_late_reason text, p_filled_by uuid default null
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
  if now() > public.shift_end(v_at) and not public.is_management() then
    if p_late_reason is null or not (v_reasons ? p_late_reason) then
      raise exception 'late_reason_required' using errcode = '22023';
    end if;
  end if;
  perform set_config('app.filled_by', coalesce(p_filled_by::text, ''), true);
  v_id := public.insert_handover_entry(p_lodge, 'note', p_body, v_at, p_mentions,
    case when now() > public.shift_end(v_at) then p_late_reason end);
  perform set_config('app.filled_by', '', true);
  return v_id;
end
$$;

revoke all on function public.add_handover_note(uuid, text, timestamptz, jsonb, text, uuid) from public, anon;
grant execute on function public.add_handover_note(uuid, text, timestamptz, jsonb, text, uuid) to authenticated;
revoke all on function public.on_duty_staff(uuid, timestamptz) from public, anon;
grant execute on function public.on_duty_staff(uuid, timestamptz) to authenticated;
revoke all on function public.handover_fill_default() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Roster: o publicado guarda o horário previsto; mudanças depois (saída antecipada,
-- cobertura) mexem no horário real. Previsto × trabalhado sai daí.
-- ---------------------------------------------------------------------------
alter table public.rota_shifts add column planned_starts_at timestamptz, add column planned_ends_at timestamptz;
update public.rota_shifts set planned_starts_at = starts_at, planned_ends_at = ends_at where status in ('published', 'cancelled') and published_at is not null;

create or replace function public.publish_rota(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_gaps integer;
begin
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  perform public.check_range(p_from, p_to);
  update public.rota_shifts
     set status = 'published', published_at = now(),
         planned_starts_at = coalesce(planned_starts_at, starts_at), planned_ends_at = coalesce(planned_ends_at, ends_at)
   where status = 'draft' and starts_at < p_to and ends_at > p_from;
  get diagnostics v_count = row_count;
  select count(*) into v_gaps from public.coverage_gaps(p_from, p_to);
  if v_gaps > 0 then
    insert into public.notifications (kind, audience, payload)
    values ('coverage_below_minimum', 'management', jsonb_build_object('gaps', v_gaps, 'from', p_from, 'to', p_to));
  end if;
  return jsonb_build_object('published', v_count, 'gaps', v_gaps);
end
$$;

-- Divide um turno: a pessoa sai em p_at e (opcional) outra cobre até o fim. A cobertura entra
-- já publicada e sem horário previsto (não estava na escala).
create or replace function public.split_rota_shift(p_shift uuid, p_at timestamptz, p_cover uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s public.rota_shifts;
  v_new uuid;
begin
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  select * into v_s from public.rota_shifts where id = p_shift and status <> 'cancelled' for update;
  if not found then raise exception 'shift_not_found' using errcode = 'P0002'; end if;
  if p_at is null or p_at <= v_s.starts_at or p_at >= v_s.ends_at then
    raise exception 'invalid_split_time' using errcode = '22023';
  end if;
  update public.rota_shifts set ends_at = p_at where id = p_shift;
  if p_cover is null then return null; end if;
  v_new := public.save_rota_shift(null, p_cover, v_s.lodge_id, v_s.function, p_at, v_s.ends_at);
  if v_s.status = 'published' then
    update public.rota_shifts set status = 'published', published_at = now() where id = v_new;
  end if;
  return v_new;
end
$$;
revoke all on function public.split_rota_shift(uuid, timestamptz, uuid) from public, anon;
grant execute on function public.split_rota_shift(uuid, timestamptz, uuid) to authenticated;

-- Previsto: horário previsto dos turnos publicados (inclusive os cancelados depois: falta).
-- Trabalhado: horário real dos turnos publicados e não cancelados, até agora, mais horas lançadas à parte.
create or replace function public.staff_hours(p_from timestamptz, p_to timestamptz)
returns table (staff_id uuid, full_name text, role public.staff_role, planned_minutes integer, effective_minutes integer)
language plpgsql stable
security definer
set search_path = public
as $$
declare
  v_until timestamptz;
begin
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  perform public.check_range(p_from, p_to);
  v_until := least(p_to, now());
  return query
  select s.id, s.full_name, s.role,
         coalesce((select sum(public.overlap_minutes(r.planned_starts_at, r.planned_ends_at, p_from, p_to))::int
                   from public.rota_shifts r where r.staff_id = s.id and r.planned_starts_at is not null), 0),
         coalesce((select sum(public.overlap_minutes(r.starts_at, r.ends_at, p_from, v_until))::int
                   from public.rota_shifts r where r.staff_id = s.id and r.status = 'published' and v_until > p_from), 0)
         + coalesce((select sum(public.overlap_minutes(w.starts_at, w.ends_at, p_from, p_to))::int
                     from public.work_intervals w where w.staff_id = s.id), 0)
  from public.staff s
  where s.role <> 'station'
    and (s.active or exists (select 1 from public.rota_shifts r where r.staff_id = s.id and r.starts_at < p_to and r.ends_at > p_from))
  order by s.full_name;
end
$$;

-- Detalhe das horas de uma pessoa: turnos do Roster (com o previsto) e horas lançadas à parte.
create or replace function public.staff_work_log(p_staff uuid, p_from timestamptz, p_to timestamptz)
returns table (source text, id uuid, lodge_id uuid, function text, starts_at timestamptz, ends_at timestamptz, note text)
language plpgsql stable
security definer
set search_path = public
as $$
begin
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  perform public.check_range(p_from, p_to);
  return query
    select case when r.status = 'cancelled' then 'cancelled' when r.planned_starts_at is null then 'cover' else 'roster' end,
           r.id, r.lodge_id, r.function, r.starts_at, r.ends_at,
           case when r.planned_starts_at is not null and (r.planned_starts_at, r.planned_ends_at) is distinct from (r.starts_at, r.ends_at)
                then 'planned ' || to_char(r.planned_starts_at at time zone 'Europe/Dublin', 'HH24:MI') || '–' || to_char(r.planned_ends_at at time zone 'Europe/Dublin', 'HH24:MI') end
    from public.rota_shifts r
    where r.staff_id = p_staff and (r.status = 'published' or (r.status = 'cancelled' and r.planned_starts_at is not null))
      and r.starts_at < p_to and r.ends_at > p_from
    union all
    select 'manual', w.id, w.lodge_id, null, w.starts_at, w.ends_at, w.note
    from public.work_intervals w where w.staff_id = p_staff and w.starts_at < p_to and w.ends_at > p_from
    order by 5;
end
$$;

-- ---------------------------------------------------------------------------
-- Correção: Food Delivery com temperatura absurda estourava o campo (achado pelo teste de varredura).
-- ---------------------------------------------------------------------------
create or replace function public.record_food_delivery(
  p_lodge uuid, p_product text, p_supplier text, p_batch text, p_expiry date, p_temperature numeric, p_note text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if public.current_staff_id() is null or not public.can_write_lodge(p_lodge) then
    raise exception 'not_authorised' using errcode = '42501';
  end if;
  if not exists (select 1 from public.lodges where id = p_lodge and has_dinner) then
    raise exception 'service_not_available' using errcode = '22023';
  end if;
  if coalesce(trim(p_product), '') = '' or coalesce(trim(p_supplier), '') = '' or coalesce(trim(p_batch), '') = ''
     or p_expiry is null then
    raise exception 'fields_required' using errcode = '22023';
  end if;
  if p_temperature is not null and (p_temperature < -40 or p_temperature > 99) then
    raise exception 'invalid_temperature' using errcode = '22023';
  end if;
  insert into public.food_deliveries (lodge_id, product, supplier, batch, expiry_date, temperature, note, received_by)
  values (p_lodge, trim(p_product), trim(p_supplier), trim(p_batch), p_expiry, round(p_temperature, 1), nullif(trim(p_note), ''), public.current_staff_id())
  returning id into v_id;
  return v_id;
end
$$;

grant select (filled_by) on public.handover_entries to authenticated;
