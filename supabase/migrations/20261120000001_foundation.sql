-- DS Lodge — Fase 0 (Fundação)
-- Spec: DS Lodge — Especificação Funcional v1.1
--   s.4  Perfis, login e permissões (verificadas no servidor)
--   s.9  Fatos guardados uma vez; nada é apagado; regras com vigência; UTC
--   s.10 Segurança, auditoria, log de leitura
--   s.12 Fase 0: usuários e permissões, Lodges, quartos e camas, residentes e estadias, auditoria
--
-- Todos os horários são timestamptz (UTC no banco) e exibidos em Europe/Dublin.
-- Os horários gravados vêm sempre do servidor (now()), nunca do computador da recepção (B56).

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type public.staff_role as enum ('porter', 'cleaner', 'manager', 'owner', 'developer');
create type public.duty_function as enum ('office', 'float');
create type public.app_locale as enum ('pt-PT', 'en-IE', 'pl-PL');
create type public.room_kind as enum ('room', 'apartment');
create type public.bed_status as enum ('in_use', 'out_of_service');
create type public.stay_status as enum ('active', 'out_pending', 'ended');
create type public.stay_end_reason as enum ('out', 'transfer');

-- ---------------------------------------------------------------------------
-- Tempo: dia operacional (07h de um dia até 07h do seguinte, horário de Dublin)
-- Nas noites de mudança de horário o dia dura 23 ou 25 horas (s.9, B18).
-- ---------------------------------------------------------------------------
create or replace function public.operational_day(ts timestamptz)
returns date
language sql immutable parallel safe
as $$
  select ((ts at time zone 'Europe/Dublin') - interval '7 hours')::date
$$;

create or replace function public.operational_day_start(d date)
returns timestamptz
language sql immutable parallel safe
as $$
  select (d + time '07:00') at time zone 'Europe/Dublin'
$$;

create or replace function public.operational_day_end(d date)
returns timestamptz
language sql immutable parallel safe
as $$
  select ((d + 1) + time '07:00') at time zone 'Europe/Dublin'
$$;

-- ---------------------------------------------------------------------------
-- Estrutura física
-- ---------------------------------------------------------------------------
create table public.lodges (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z_]+$'),
  name text not null,
  short_name text not null,
  address text,
  has_dinner boolean not null default false,
  has_laundry boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  lodge_id uuid not null references public.lodges(id),
  kind public.room_kind not null default 'room',
  code text not null check (length(trim(code)) > 0),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (lodge_id, kind, code)
);

create table public.beds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id),
  number integer not null check (number > 0),
  status public.bed_status not null default 'in_use',
  status_note text,
  active boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  unique (room_id, number)
);

create index beds_room_idx on public.beds(room_id);
create index rooms_lodge_idx on public.rooms(lodge_id);

-- ---------------------------------------------------------------------------
-- Equipe
-- Cleaners não têm login (user_id nulo). Só pode existir uma conta Developer.
-- ---------------------------------------------------------------------------
create table public.staff (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  full_name text not null check (length(trim(full_name)) > 0),
  display_name text,
  role public.staff_role not null,
  email text,
  locale public.app_locale not null default 'en-IE',
  home_lodge_id uuid references public.lodges(id),
  active boolean not null default true,
  must_change_password boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid,
  deactivated_at timestamptz,
  deactivated_by uuid,
  check (role <> 'cleaner' or user_id is null)
);

create unique index staff_single_developer on public.staff(role) where role = 'developer';
create unique index staff_email_unique on public.staff(lower(email)) where email is not null;

-- ---------------------------------------------------------------------------
-- Parâmetros com vigência (s.9 "Regras ajustáveis"): nunca se edita uma linha;
-- grava-se uma nova com valid_from. O passado não é reescrito (B22).
-- lodge_id nulo = vale para os dois Lodges.
-- ---------------------------------------------------------------------------
create table public.parameters (
  id bigint generated always as identity primary key,
  key text not null check (key ~ '^[a-z0-9_.]+$'),
  lodge_id uuid references public.lodges(id),
  value jsonb not null,
  valid_from timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid
);

create index parameters_lookup on public.parameters(key, lodge_id, valid_from desc);

create or replace function public.param_value(p_key text, p_lodge uuid default null, p_at timestamptz default now())
returns jsonb
language sql stable
security definer
set search_path = public
as $$
  select value
  from public.parameters
  where key = p_key
    and (lodge_id = p_lodge or lodge_id is null)
    and valid_from <= p_at
  order by (lodge_id is not null) desc, valid_from desc, id desc
  limit 1
$$;

-- ---------------------------------------------------------------------------
-- Quem é o usuário da requisição e o que pode fazer
-- ---------------------------------------------------------------------------
create or replace function public.current_staff_id()
returns uuid
language sql stable
security definer
set search_path = public
as $$
  select s.id from public.staff s
  where s.user_id = auth.uid() and s.active
$$;

create or replace function public.current_staff_role()
returns public.staff_role
language sql stable
security definer
set search_path = public
as $$
  select s.role from public.staff s
  where s.user_id = auth.uid() and s.active
$$;

-- Verificação em duas etapas obrigatória para Manager, Owner e Developer (s.4).
-- Pode ser desligada por parâmetro só para desenvolvimento local.
create or replace function public.mfa_satisfied()
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select coalesce((public.param_value('security.require_mfa_management') #>> '{}')::boolean, true) = false
      or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
$$;

create or replace function public.is_management()
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select coalesce(public.current_staff_role() in ('manager', 'owner', 'developer'), false)
     and public.mfa_satisfied()
$$;

create or replace function public.is_active_staff()
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select public.current_staff_id() is not null
$$;

-- ---------------------------------------------------------------------------
-- Assumir Posto (s.4, B42–B44, B12)
-- Um Office On Duty por Lodge, um Float ativo por vez, uma pessoa num posto só.
-- ---------------------------------------------------------------------------
create table public.duty_posts (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id),
  function public.duty_function not null,
  lodge_id uuid references public.lodges(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  ended_by uuid references public.staff(id),
  end_reason text check (end_reason in ('ended', 'taken_over', 'deactivated', 'switched')),
  check ((function = 'office') = (lodge_id is not null)),
  check (ended_at is null or ended_at >= started_at)
);

create unique index duty_posts_one_per_person on public.duty_posts(staff_id) where ended_at is null;
create unique index duty_posts_one_office_per_lodge on public.duty_posts(lodge_id) where function = 'office' and ended_at is null;
create unique index duty_posts_one_float on public.duty_posts(function) where function = 'float' and ended_at is null;
create index duty_posts_started_idx on public.duty_posts(started_at);

-- Office só cria e altera registros no próprio Lodge; Float nos dois;
-- Manager, Owner e Developer nos dois (s.4, B40, B41).
create or replace function public.can_write_lodge(p_lodge uuid)
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select public.is_management()
      or exists (
        select 1 from public.duty_posts p
        where p.staff_id = public.current_staff_id()
          and p.ended_at is null
          and (p.function = 'float' or p.lodge_id = p_lodge)
      )
$$;

create or replace function public.my_open_post()
returns public.duty_posts
language sql stable
security definer
set search_path = public
as $$
  select p.* from public.duty_posts p
  where p.staff_id = public.current_staff_id() and p.ended_at is null
$$;

create or replace function public.has_open_post()
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.duty_posts p
    where p.staff_id = public.current_staff_id() and p.ended_at is null
  )
$$;

create or replace function public.assume_post(
  p_function public.duty_function,
  p_lodge uuid default null,
  p_confirm_takeover boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_staff_id();
  v_role public.staff_role := public.current_staff_role();
  v_occupant public.duty_posts;
  v_occupant_name text;
  v_mine public.duty_posts;
  v_new public.duty_posts;
begin
  if v_me is null then
    raise exception 'not_authorised' using errcode = '42501';
  end if;

  -- Office: Porter. Float: Porter ou Manager (o Manager mantém as permissões de Manager).
  if p_function = 'office' and v_role <> 'porter' then
    raise exception 'role_cannot_take_office' using errcode = '42501';
  end if;
  if p_function = 'float' and v_role not in ('porter', 'manager') then
    raise exception 'role_cannot_take_float' using errcode = '42501';
  end if;

  if p_function = 'office' then
    if p_lodge is null or not exists (select 1 from public.lodges where id = p_lodge and active) then
      raise exception 'lodge_required' using errcode = '22023';
    end if;
  else
    p_lodge := null; -- Float cobre os dois Lodges
  end if;

  -- Serializa a troca de postos para não haver duas pessoas no mesmo posto.
  perform pg_advisory_xact_lock(hashtext('duty_posts'));

  select * into v_occupant from public.duty_posts p
  where p.ended_at is null
    and p.staff_id <> v_me
    and p.function = p_function
    and (p_function = 'float' or p.lodge_id = p_lodge);

  if found then
    if not p_confirm_takeover then
      select coalesce(s.display_name, s.full_name) into v_occupant_name
      from public.staff s where s.id = v_occupant.staff_id;
      return jsonb_build_object(
        'status', 'occupied',
        'occupant_staff_id', v_occupant.staff_id,
        'occupant_name', v_occupant_name,
        'since', v_occupant.started_at
      );
    end if;

    update public.duty_posts
       set ended_at = now(), ended_by = v_me, end_reason = 'taken_over'
     where id = v_occupant.id;
  end if;

  select * into v_mine from public.duty_posts p
  where p.staff_id = v_me and p.ended_at is null;

  if found then
    if v_mine.function = p_function and v_mine.lodge_id is not distinct from p_lodge then
      return jsonb_build_object('status', 'already_on_post', 'post_id', v_mine.id, 'since', v_mine.started_at);
    end if;
    update public.duty_posts
       set ended_at = now(), ended_by = v_me, end_reason = 'switched'
     where id = v_mine.id;
  end if;

  insert into public.duty_posts (staff_id, function, lodge_id)
  values (v_me, p_function, p_lodge)
  returning * into v_new;

  return jsonb_build_object(
    'status', 'assumed',
    'post_id', v_new.id,
    'since', v_new.started_at,
    'took_over_staff_id', v_occupant.staff_id
  );
end
$$;

create or replace function public.end_my_post()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_staff_id();
begin
  if v_me is null then
    raise exception 'not_authorised' using errcode = '42501';
  end if;
  update public.duty_posts
     set ended_at = now(), ended_by = v_me, end_reason = 'ended'
   where staff_id = v_me and ended_at is null;
end
$$;

-- Desativar um usuário corta o acesso na hora (RLS deixa de reconhecê-lo) e
-- encerra o posto aberto. O histórico fica preservado (B02).
create or replace function public.staff_on_deactivate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.active and not new.active then
    new.deactivated_at := now();
    new.deactivated_by := public.current_staff_id();
    update public.duty_posts
       set ended_at = now(), ended_by = public.current_staff_id(), end_reason = 'deactivated'
     where staff_id = new.id and ended_at is null;
  elsif not old.active and new.active then
    new.deactivated_at := null;
    new.deactivated_by := null;
  end if;
  return new;
end
$$;

create trigger staff_on_deactivate
before update of active on public.staff
for each row execute function public.staff_on_deactivate();

-- Conta própria: só o idioma e a marca de senha trocada.
create or replace function public.set_my_locale(p_locale public.app_locale)
returns void
language sql
security definer
set search_path = public
as $$
  update public.staff set locale = p_locale where id = public.current_staff_id()
$$;

create or replace function public.mark_password_changed()
returns void
language sql
security definer
set search_path = public
as $$
  update public.staff set must_change_password = false where id = public.current_staff_id()
$$;

-- ---------------------------------------------------------------------------
-- Residentes e estadias (s.2 Glossário)
-- Sair (Out) encerra a estadia, não apaga a pessoa.
-- ---------------------------------------------------------------------------
create table public.residents (
  id uuid primary key default gen_random_uuid(),
  pass_id text,
  first_name text not null check (length(trim(first_name)) > 0),
  last_name text not null default '',
  date_of_birth date,
  notes text,
  is_demo boolean not null default false,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references public.staff(id)
);

create unique index residents_pass_id_unique on public.residents(lower(pass_id)) where pass_id is not null and pass_id <> '';
create index residents_name_idx on public.residents(lower(last_name), lower(first_name));

create table public.stays (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.residents(id),
  lodge_id uuid not null references public.lodges(id),
  bed_id uuid not null references public.beds(id),
  admitted_at timestamptz not null default now(),
  status public.stay_status not null default 'active',
  transfer_from_stay_id uuid references public.stays(id),
  out_decided_at timestamptz,
  out_decided_by uuid references public.staff(id),
  out_reason text,
  ended_at timestamptz,
  ended_by uuid references public.staff(id),
  end_reason public.stay_end_reason,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references public.staff(id),
  check ((status = 'ended') = (ended_at is not null)),
  check (ended_at is null or ended_at >= admitted_at)
);

-- Uma estadia aberta por residente, um residente por cama.
create unique index stays_one_open_per_resident on public.stays(resident_id) where status <> 'ended';
create unique index stays_one_open_per_bed on public.stays(bed_id) where status <> 'ended';
create index stays_lodge_idx on public.stays(lodge_id, status);

create or replace function public.bed_lodge(p_bed uuid)
returns uuid
language sql stable
set search_path = public
as $$
  select r.lodge_id from public.beds b join public.rooms r on r.id = b.room_id where b.id = p_bed
$$;

create or replace function public.stays_check_bed()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.bed_lodge(new.bed_id) is distinct from new.lodge_id then
    raise exception 'bed_not_in_lodge' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' and exists (select 1 from public.beds where id = new.bed_id and (status <> 'in_use' or not active)) then
    raise exception 'bed_out_of_service' using errcode = '23514';
  end if;
  return new;
end
$$;

create trigger stays_check_bed
before insert or update of bed_id, lodge_id on public.stays
for each row execute function public.stays_check_bed();

-- Admissão: cria (ou reaproveita) o residente e abre a estadia.
create or replace function public.admit_resident(
  p_lodge uuid,
  p_bed uuid,
  p_resident_id uuid default null,
  p_first_name text default null,
  p_last_name text default null,
  p_date_of_birth date default null,
  p_pass_id text default null,
  p_admitted_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_staff_id();
  v_resident uuid := p_resident_id;
  v_stay uuid;
begin
  if v_me is null or not public.can_write_lodge(p_lodge) then
    raise exception 'not_authorised' using errcode = '42501';
  end if;
  if p_admitted_at is not null and p_admitted_at > now() + interval '5 minutes' then
    raise exception 'admitted_in_future' using errcode = '22023';
  end if;

  if v_resident is null then
    insert into public.residents (first_name, last_name, date_of_birth, pass_id, created_by)
    values (trim(p_first_name), coalesce(trim(p_last_name), ''), p_date_of_birth, nullif(trim(p_pass_id), ''), v_me)
    returning id into v_resident;
  end if;

  insert into public.stays (resident_id, lodge_id, bed_id, admitted_at, created_by)
  values (v_resident, p_lodge, p_bed, coalesce(p_admitted_at, now()), v_me)
  returning id into v_stay;

  return v_stay;
end
$$;

-- Transferência (de cama ou de Lodge): encerra a estadia atual e abre outra.
-- Quem pode: quem escreve no Lodge de origem ou no de destino.
create or replace function public.transfer_resident(
  p_stay uuid,
  p_new_bed uuid,
  p_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_staff_id();
  v_old public.stays;
  v_new_lodge uuid := public.bed_lodge(p_new_bed);
  v_at timestamptz := coalesce(p_at, now());
  v_new uuid;
begin
  select * into v_old from public.stays where id = p_stay for update;
  if not found or v_old.status <> 'active' then
    raise exception 'stay_not_active' using errcode = '22023';
  end if;
  if v_me is null or not (public.can_write_lodge(v_old.lodge_id) or public.can_write_lodge(v_new_lodge)) then
    raise exception 'not_authorised' using errcode = '42501';
  end if;
  if v_at < v_old.admitted_at or v_at > now() + interval '5 minutes' then
    raise exception 'invalid_transfer_time' using errcode = '22023';
  end if;

  update public.stays
     set status = 'ended', ended_at = v_at, ended_by = v_me, end_reason = 'transfer'
   where id = p_stay;

  insert into public.stays (resident_id, lodge_id, bed_id, admitted_at, transfer_from_stay_id, created_by)
  values (v_old.resident_id, v_new_lodge, p_new_bed, v_at, p_stay, v_me)
  returning id into v_new;

  return v_new;
end
$$;

-- Out: Office/Float decidem; Manager/Owner efetivam (s.5, B11).
create or replace function public.decide_out(p_stay uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stay public.stays;
begin
  select * into v_stay from public.stays where id = p_stay for update;
  if not found or v_stay.status <> 'active' then
    raise exception 'stay_not_active' using errcode = '22023';
  end if;
  if not public.can_write_lodge(v_stay.lodge_id) then
    raise exception 'not_authorised' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  update public.stays
     set status = 'out_pending', out_decided_at = now(),
         out_decided_by = public.current_staff_id(), out_reason = trim(p_reason)
   where id = p_stay;
end
$$;

create or replace function public.withdraw_out(p_stay uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stay public.stays;
begin
  select * into v_stay from public.stays where id = p_stay for update;
  if not found or v_stay.status <> 'out_pending' then
    raise exception 'stay_not_out_pending' using errcode = '22023';
  end if;
  if not (public.is_management() or v_stay.out_decided_by = public.current_staff_id()) then
    raise exception 'not_authorised' using errcode = '42501';
  end if;
  update public.stays
     set status = 'active', out_decided_at = null, out_decided_by = null, out_reason = null
   where id = p_stay;
end
$$;

create or replace function public.effect_out(p_stay uuid, p_ended_at timestamptz default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stay public.stays;
  v_at timestamptz := coalesce(p_ended_at, now());
begin
  if not public.is_management() then
    raise exception 'not_authorised' using errcode = '42501';
  end if;
  select * into v_stay from public.stays where id = p_stay for update;
  if not found or v_stay.status = 'ended' then
    raise exception 'stay_not_open' using errcode = '22023';
  end if;
  if v_at < v_stay.admitted_at or v_at > now() + interval '5 minutes' then
    raise exception 'invalid_out_time' using errcode = '22023';
  end if;
  update public.stays
     set status = 'ended', ended_at = v_at, ended_by = public.current_staff_id(), end_reason = 'out',
         out_decided_at = coalesce(out_decided_at, now()),
         out_decided_by = coalesce(out_decided_by, public.current_staff_id()),
         out_reason = coalesce(out_reason, 'Out')
   where id = p_stay;
end
$$;

-- Ocupação atual de cada cama (mapa de camas, Folha do dia).
create or replace view public.bed_occupancy
with (security_invoker = true)
as
select
  l.id as lodge_id,
  l.code as lodge_code,
  r.id as room_id,
  r.kind as room_kind,
  r.code as room_code,
  r.sort_order as room_sort,
  b.id as bed_id,
  b.number as bed_number,
  b.status as bed_status,
  s.id as stay_id,
  s.status as stay_status,
  s.admitted_at,
  res.id as resident_id,
  res.first_name,
  res.last_name,
  res.date_of_birth,
  res.pass_id
from public.beds b
join public.rooms r on r.id = b.room_id
join public.lodges l on l.id = r.lodge_id
left join public.stays s on s.bed_id = b.id and s.status <> 'ended'
left join public.residents res on res.id = s.resident_id
where b.active and r.active and l.active;

-- ---------------------------------------------------------------------------
-- Controle de versão para edição simultânea (s.9): cada update incrementa
-- "version"; o cliente envia a versão que leu e o banco recusa se mudou.
-- ---------------------------------------------------------------------------
create or replace function public.bump_version()
returns trigger
language plpgsql
as $$
begin
  if new.version is distinct from old.version then
    raise exception 'stale_version' using errcode = '40001',
      hint = 'O registro foi alterado por outra pessoa. Recarregue antes de salvar.';
  end if;
  new.version := old.version + 1;
  return new;
end
$$;

create trigger staff_bump_version before update on public.staff for each row execute function public.bump_version();
create trigger residents_bump_version before update on public.residents for each row execute function public.bump_version();
create trigger beds_bump_version before update on public.beds for each row execute function public.bump_version();
create trigger stays_bump_version before update on public.stays for each row execute function public.bump_version();

-- ---------------------------------------------------------------------------
-- Auditoria (s.10): quem, o quê, quando, valor anterior e novo; imutável.
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_user_id uuid,
  actor_staff_id uuid,
  action text not null,
  table_name text not null,
  record_id text,
  old_data jsonb,
  new_data jsonb
);

create index audit_log_record_idx on public.audit_log(table_name, record_id, occurred_at desc);
create index audit_log_time_idx on public.audit_log(occurred_at desc);

create or replace function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
begin
  if tg_op = 'UPDATE' and (v_old - 'version') = (v_new - 'version') then
    return new;
  end if;
  insert into public.audit_log (actor_user_id, actor_staff_id, action, table_name, record_id, old_data, new_data)
  values (
    auth.uid(),
    public.current_staff_id(),
    tg_op,
    tg_table_name,
    coalesce(v_new ->> 'id', v_old ->> 'id'),
    v_old,
    v_new
  );
  return coalesce(new, old);
end
$$;

create or replace function public.audit_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_log_is_immutable' using errcode = '42501';
end
$$;

create trigger audit_log_immutable
before update or delete on public.audit_log
for each row execute function public.audit_immutable();

create trigger audit_lodges after insert or update or delete on public.lodges for each row execute function public.audit_row();
create trigger audit_rooms after insert or update or delete on public.rooms for each row execute function public.audit_row();
create trigger audit_beds after insert or update or delete on public.beds for each row execute function public.audit_row();
create trigger audit_staff after insert or update or delete on public.staff for each row execute function public.audit_row();
create trigger audit_parameters after insert or update or delete on public.parameters for each row execute function public.audit_row();
create trigger audit_duty_posts after insert or update or delete on public.duty_posts for each row execute function public.audit_row();
create trigger audit_residents after insert or update or delete on public.residents for each row execute function public.audit_row();
create trigger audit_stays after insert or update or delete on public.stays for each row execute function public.audit_row();

-- Log de leitura: quem abriu o perfil de um residente (s.10, B19).
create table public.access_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_user_id uuid,
  actor_staff_id uuid,
  resident_id uuid not null references public.residents(id),
  context text not null default 'profile'
);

create index access_log_resident_idx on public.access_log(resident_id, occurred_at desc);

create trigger access_log_immutable
before update or delete on public.access_log
for each row execute function public.audit_immutable();

-- O perfil do residente só é entregue por esta função, que registra a leitura.
create or replace function public.open_resident_profile(p_resident uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile jsonb;
begin
  if not public.is_active_staff() then
    raise exception 'not_authorised' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'resident', to_jsonb(r),
    'stays', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'lodge_id', s.lodge_id, 'lodge_code', l.code,
        'room_code', rm.code, 'room_kind', rm.kind, 'bed_number', b.number,
        'status', s.status, 'admitted_at', s.admitted_at, 'ended_at', s.ended_at,
        'end_reason', s.end_reason, 'out_reason', s.out_reason,
        'out_decided_at', s.out_decided_at, 'version', s.version
      ) order by s.admitted_at desc)
      from public.stays s
      join public.lodges l on l.id = s.lodge_id
      join public.beds b on b.id = s.bed_id
      join public.rooms rm on rm.id = b.room_id
      where s.resident_id = r.id
    ), '[]'::jsonb)
  )
  into v_profile
  from public.residents r
  where r.id = p_resident;

  if v_profile is null then
    raise exception 'resident_not_found' using errcode = 'P0002';
  end if;

  insert into public.access_log (actor_user_id, actor_staff_id, resident_id)
  values (auth.uid(), public.current_staff_id(), p_resident);

  return v_profile;
end
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.lodges enable row level security;
alter table public.rooms enable row level security;
alter table public.beds enable row level security;
alter table public.staff enable row level security;
alter table public.parameters enable row level security;
alter table public.duty_posts enable row level security;
alter table public.residents enable row level security;
alter table public.stays enable row level security;
alter table public.audit_log enable row level security;
alter table public.access_log enable row level security;

revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon, public;

grant select on public.lodges, public.rooms, public.beds, public.staff, public.parameters,
  public.duty_posts, public.residents, public.stays, public.audit_log, public.access_log,
  public.bed_occupancy to authenticated;
grant insert, update on public.lodges, public.rooms, public.beds, public.staff, public.residents to authenticated;
grant insert on public.parameters to authenticated;

grant execute on function
  public.operational_day(timestamptz), public.operational_day_start(date), public.operational_day_end(date),
  public.param_value(text, uuid, timestamptz), public.current_staff_id(), public.current_staff_role(),
  public.mfa_satisfied(), public.is_management(), public.is_active_staff(), public.can_write_lodge(uuid),
  public.my_open_post(), public.has_open_post(), public.assume_post(public.duty_function, uuid, boolean), public.end_my_post(),
  public.set_my_locale(public.app_locale), public.mark_password_changed(),
  public.admit_resident(uuid, uuid, uuid, text, text, date, text, timestamptz),
  public.transfer_resident(uuid, uuid, timestamptz),
  public.decide_out(uuid, text), public.withdraw_out(uuid), public.effect_out(uuid, timestamptz),
  public.open_resident_profile(uuid), public.bed_lodge(uuid)
to authenticated;

-- Estrutura: todos da equipe leem; só a gestão altera.
create policy lodges_read on public.lodges for select to authenticated using (public.is_active_staff());
create policy lodges_write on public.lodges for insert to authenticated with check (public.is_management());
create policy lodges_update on public.lodges for update to authenticated using (public.is_management()) with check (public.is_management());

create policy rooms_read on public.rooms for select to authenticated using (public.is_active_staff());
create policy rooms_write on public.rooms for insert to authenticated with check (public.is_management());
create policy rooms_update on public.rooms for update to authenticated using (public.is_management()) with check (public.is_management());

create policy beds_read on public.beds for select to authenticated using (public.is_active_staff());
create policy beds_write on public.beds for insert to authenticated with check (public.is_management());
create policy beds_update on public.beds for update to authenticated using (public.is_management()) with check (public.is_management());

-- Equipe: todos veem os colegas (nomes na escala, "quem fez a ronda");
-- só Manager/Owner/Developer criam e editam (B01). A conta Developer não é criada pelo app.
create policy staff_read on public.staff for select to authenticated using (public.is_active_staff());
create policy staff_insert on public.staff for insert to authenticated
  with check (public.is_management() and role <> 'developer');
create policy staff_update on public.staff for update to authenticated
  using (public.is_management())
  with check (public.is_management() and (role <> 'developer' or public.current_staff_role() = 'developer'));

-- Parâmetros: leitura para a equipe; nova vigência só pela gestão.
create policy parameters_read on public.parameters for select to authenticated using (public.is_active_staff());
create policy parameters_insert on public.parameters for insert to authenticated
  with check (public.is_management() and valid_from >= now() - interval '1 minute');

-- Postos: leitura para todos (quem está de serviço); escrita só pelas funções.
create policy duty_posts_read on public.duty_posts for select to authenticated using (public.is_active_staff());

-- Residentes: leitura para todos (Office e Float consultam os dois Lodges).
-- Edição do cadastro por quem está num posto ou pela gestão.
create policy residents_read on public.residents for select to authenticated using (public.is_active_staff());
create policy residents_update on public.residents for update to authenticated
  using (public.is_management() or public.has_open_post())
  with check (public.is_management() or public.has_open_post());

create policy stays_read on public.stays for select to authenticated using (public.is_active_staff());

-- Auditoria e log de leitura: só a gestão consulta.
create policy audit_read on public.audit_log for select to authenticated using (public.is_management());
create policy access_log_read on public.access_log for select to authenticated using (public.is_management());
