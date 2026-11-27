-- Revisão 2, item 5: o Handover (Livro Ata) é organizado por turno. Abertura: escolhe o Porter que assume.
-- Encerramento: para quem passa o serviço (abre o turno dessa pessoa). As anotações pertencem ao turno.
-- Horas: o turno fechado é cruzado com o Roster e o Manager confirma; o confirmado vira a hora trabalhada.

alter table public.handover_entries drop constraint handover_entries_kind_check;
alter table public.handover_entries add constraint handover_entries_kind_check
  check (kind in ('note', 'round', 'maintenance', 'warning', 'laundry', 'shift'));

create table public.handover_shifts (
  id uuid primary key default gen_random_uuid(),
  lodge_id uuid not null references public.lodges(id),
  staff_id uuid not null references public.staff(id),
  opened_at timestamptz not null default now(),
  opened_by uuid not null references public.staff(id),
  closed_at timestamptz,
  closed_by uuid references public.staff(id),
  handed_to uuid references public.staff(id),
  close_note text,
  rota_shift_id uuid references public.rota_shifts(id),
  hours_status text not null default 'open' check (hours_status in ('open', 'pending', 'confirmed')),
  confirmed_start timestamptz,
  confirmed_end timestamptz,
  confirmed_by uuid references public.staff(id),
  confirmed_at timestamptz,
  check (closed_at is null or closed_at >= opened_at)
);
create unique index handover_shifts_one_open on public.handover_shifts(lodge_id) where closed_at is null;
create index handover_shifts_time_idx on public.handover_shifts(lodge_id, opened_at desc);
create trigger audit_handover_shifts after insert or update or delete on public.handover_shifts for each row execute function public.audit_row();

alter table public.handover_entries add column shift_id uuid references public.handover_shifts(id);
create index handover_entries_shift_idx on public.handover_entries(shift_id);

alter table public.handover_shifts enable row level security;
revoke all on public.handover_shifts from anon, authenticated;
grant select on public.handover_shifts to authenticated;
create policy handover_shifts_read on public.handover_shifts for select to authenticated using (public.is_active_staff());
grant select (shift_id) on public.handover_entries to authenticated;

-- Turno do Roster que corresponde a quem abriu o turno (mais próximo do horário de abertura).
create or replace function public.match_rota_shift(p_staff uuid, p_lodge uuid, p_at timestamptz)
returns uuid
language sql stable
security definer
set search_path = public
as $$
  select r.id from public.rota_shifts r
  where r.staff_id = p_staff and r.status = 'published'
    and (r.lodge_id = p_lodge or r.lodge_id is null)
    and r.starts_at - interval '3 hours' <= p_at and r.ends_at > p_at
  order by abs(extract(epoch from r.starts_at - p_at))
  limit 1
$$;

-- A anotação entra no turno aberto da casa; quem preenche, por padrão, é quem está no turno.
create or replace function public.handover_fill_default()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chosen text := nullif(current_setting('app.filled_by', true), '');
  v_shift public.handover_shifts;
begin
  select * into v_shift from public.handover_shifts s
  where s.lodge_id = new.lodge_id and s.opened_at <= greatest(new.occurred_at, now() - interval '12 hours')
    and (s.closed_at is null or s.closed_at > new.occurred_at)
  order by s.opened_at desc limit 1;
  if new.shift_id is null and v_shift.id is not null and new.occurred_at >= v_shift.opened_at - interval '5 minutes' then
    new.shift_id := v_shift.id;
  end if;
  if new.filled_by is null then
    new.filled_by := coalesce(
      v_chosen::uuid,
      case when new.shift_id is not null then (select staff_id from public.handover_shifts where id = new.shift_id) end,
      case when public.current_staff_role() = 'station' then public.on_duty_staff(new.lodge_id, new.occurred_at)
           else public.current_staff_id() end);
  end if;
  return new;
end
$$;

create or replace function public.open_handover_shift(p_lodge uuid, p_staff uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_name text;
begin
  if public.current_staff_id() is null or not public.can_write_lodge(p_lodge) then
    raise exception 'not_authorised' using errcode = '42501';
  end if;
  select coalesce(display_name, full_name) into v_name from public.staff
  where id = p_staff and active and role in ('porter', 'manager', 'owner', 'developer');
  if v_name is null then raise exception 'invalid_filled_by' using errcode = '22023'; end if;
  if exists (select 1 from public.handover_shifts where lodge_id = p_lodge and closed_at is null) then
    raise exception 'shift_already_open' using errcode = '23505';
  end if;
  insert into public.handover_shifts (lodge_id, staff_id, opened_by, rota_shift_id)
  values (p_lodge, p_staff, public.current_staff_id(), public.match_rota_shift(p_staff, p_lodge, now()))
  returning id into v_id;
  insert into public.handover_entries (lodge_id, kind, body, occurred_at, operational_day, author_id, shift_id, filled_by)
  values (p_lodge, 'shift', 'Shift opened — ' || v_name, now(), public.operational_day(now()), public.current_staff_id(), v_id, p_staff);
  return v_id;
end
$$;

-- Encerra e (se informado) abre o turno de quem assume. Devolve o turno novo (ou null).
create or replace function public.close_handover_shift(p_shift uuid, p_handed_to uuid, p_note text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s public.handover_shifts;
  v_r public.rota_shifts;
  v_name text;
  v_to_name text;
  v_mismatch boolean;
begin
  select * into v_s from public.handover_shifts where id = p_shift for update;
  if not found then raise exception 'shift_not_found' using errcode = 'P0002'; end if;
  if public.current_staff_id() is null or not public.can_write_lodge(v_s.lodge_id) then
    raise exception 'not_authorised' using errcode = '42501';
  end if;
  if v_s.closed_at is not null then raise exception 'shift_already_closed' using errcode = '22023'; end if;
  if p_handed_to is not null then
    select coalesce(display_name, full_name) into v_to_name from public.staff
    where id = p_handed_to and active and role in ('porter', 'manager', 'owner', 'developer');
    if v_to_name is null then raise exception 'invalid_filled_by' using errcode = '22023'; end if;
  end if;
  select coalesce(display_name, full_name) into v_name from public.staff where id = v_s.staff_id;
  update public.handover_shifts
     set closed_at = now(), closed_by = public.current_staff_id(), handed_to = p_handed_to,
         close_note = nullif(trim(p_note), ''), hours_status = 'pending'
   where id = p_shift;
  insert into public.handover_entries (lodge_id, kind, body, occurred_at, operational_day, author_id, shift_id, filled_by)
  values (v_s.lodge_id, 'shift',
          'Shift closed — ' || v_name || coalesce(' handed over to ' || v_to_name, '') || coalesce('. ' || nullif(trim(p_note), ''), ''),
          now(), public.operational_day(now()), public.current_staff_id(), p_shift, v_s.staff_id);
  -- Cruzamento com o Roster: diferença de mais de 15 min em qualquer ponta (ou sem escala) pede atenção.
  select * into v_r from public.rota_shifts where id = v_s.rota_shift_id;
  v_mismatch := v_r.id is null or abs(extract(epoch from v_r.starts_at - v_s.opened_at)) > 900 or abs(extract(epoch from v_r.ends_at - now())) > 900;
  if v_mismatch then
    insert into public.notifications (kind, audience, lodge_id, payload)
    values ('shift_hours_review', 'management', v_s.lodge_id, jsonb_build_object('shift_id', p_shift, 'name', v_name));
  end if;
  if p_handed_to is not null then
    return public.open_handover_shift(v_s.lodge_id, p_handed_to);
  end if;
  return null;
end
$$;

-- Fila do Manager: turnos fechados com o previsto do Roster ao lado.
create or replace function public.shift_hours_review()
returns table (shift_id uuid, lodge_id uuid, staff_id uuid, full_name text, opened_at timestamptz, closed_at timestamptz,
               rota_shift_id uuid, rota_starts_at timestamptz, rota_ends_at timestamptz, mismatch boolean, hours_status text,
               confirmed_start timestamptz, confirmed_end timestamptz)
language plpgsql stable
security definer
set search_path = public
as $$
begin
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  return query
  select s.id, s.lodge_id, s.staff_id, st.full_name, s.opened_at, s.closed_at, s.rota_shift_id, r.starts_at, r.ends_at,
         r.id is null or abs(extract(epoch from r.starts_at - s.opened_at)) > 900 or abs(extract(epoch from r.ends_at - s.closed_at)) > 900,
         s.hours_status, s.confirmed_start, s.confirmed_end
  from public.handover_shifts s
  join public.staff st on st.id = s.staff_id
  left join public.rota_shifts r on r.id = s.rota_shift_id
  where s.closed_at is not null and s.opened_at > now() - interval '60 days'
  order by (s.hours_status = 'pending') desc, s.opened_at desc;
end
$$;

-- Confirmação do Manager: sem horários, vale abertura/encerramento. O confirmado vira o horário real
-- do turno do Roster (ou uma cobertura publicada, se não havia escala).
create or replace function public.confirm_shift_hours(p_shift uuid, p_start timestamptz, p_end timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s public.handover_shifts;
  v_start timestamptz;
  v_end timestamptz;
  v_fn text;
  v_new uuid;
begin
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  select * into v_s from public.handover_shifts where id = p_shift for update;
  if not found or v_s.closed_at is null then raise exception 'shift_not_found' using errcode = 'P0002'; end if;
  v_start := coalesce(p_start, v_s.opened_at);
  v_end := coalesce(p_end, v_s.closed_at);
  if v_end <= v_start or v_end - v_start > interval '24 hours' or v_end > now() + interval '5 minutes' then
    raise exception 'invalid_period' using errcode = '22023';
  end if;
  if v_s.rota_shift_id is not null then
    update public.rota_shifts set starts_at = v_start, ends_at = v_end where id = v_s.rota_shift_id;
  else
    select case when role = 'porter' then 'office' else 'manager' end into v_fn from public.staff where id = v_s.staff_id;
    insert into public.rota_shifts (staff_id, lodge_id, function, starts_at, ends_at, status, published_at, created_by)
    values (v_s.staff_id, v_s.lodge_id, v_fn, v_start, v_end, 'published', now(), public.current_staff_id())
    returning id into v_new;
  end if;
  update public.handover_shifts
     set hours_status = 'confirmed', confirmed_start = v_start, confirmed_end = v_end,
         confirmed_by = public.current_staff_id(), confirmed_at = now(), rota_shift_id = coalesce(rota_shift_id, v_new)
   where id = p_shift;
end
$$;

revoke all on function public.match_rota_shift(uuid, uuid, timestamptz), public.open_handover_shift(uuid, uuid),
  public.close_handover_shift(uuid, uuid, text), public.shift_hours_review(), public.confirm_shift_hours(uuid, timestamptz, timestamptz)
  from public, anon;
grant execute on function public.open_handover_shift(uuid, uuid), public.close_handover_shift(uuid, uuid, text),
  public.shift_hours_review(), public.confirm_shift_hours(uuid, timestamptz, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Correção (achada pela simulação em massa): só uma Final Written Warning ativa por estadia.
-- ---------------------------------------------------------------------------
create or replace function public.record_warning(p_stay uuid, p_type text, p_note text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stay public.stays;
  v_entry uuid;
  v_id uuid;
  v_label text := case p_type when 'verbal' then 'Verbal Warning' when 'written' then 'Written Warning' when 'final_written' then 'Final Written Warning (FW)' end;
begin
  select * into v_stay from public.stays where id = p_stay for update;
  if not found or v_stay.status = 'ended' then raise exception 'stay_not_open' using errcode = '22023'; end if;
  if public.current_staff_id() is null or not public.can_write_lodge(v_stay.lodge_id) then
    raise exception 'not_authorised' using errcode = '42501';
  end if;
  if v_label is null then raise exception 'invalid_warning_type' using errcode = '22023'; end if;
  if p_type = 'final_written' and exists (select 1 from public.warnings where stay_id = p_stay and type = 'final_written' and active) then
    raise exception 'final_warning_active' using errcode = '23505';
  end if;
  v_entry := public.insert_handover_entry(v_stay.lodge_id, 'warning',
    v_label || coalesce(': ' || nullif(trim(p_note), ''), ''), now(), jsonb_build_array(jsonb_build_object('resident_id', v_stay.resident_id)));
  insert into public.warnings (resident_id, stay_id, lodge_id, type, note, handover_entry_id, issued_by)
  values (v_stay.resident_id, p_stay, v_stay.lodge_id, p_type, nullif(trim(p_note), ''), v_entry, public.current_staff_id())
  returning id into v_id;
  return v_id;
end
$$;
