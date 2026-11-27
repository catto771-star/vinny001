-- Segunda etapa de Manager/Owner/Developer por código enviado por e-mail
-- (substitui o autenticador com QR Code — decisão da gestão em 20/11/2026).
--
-- Como funciona:
--   1. a pessoa entra com e-mail e senha (sessão com amr "password");
--   2. pede o código: begin_email_verification() registra o pedido;
--   3. o Supabase envia o código por e-mail (signInWithOtp) e a pessoa o digita
--      (verifyOtp), abrindo uma sessão com amr "otp";
--   4. mfa_satisfied() só aceita uma sessão "otp" se houver um pedido feito com senha
--      até 15 minutos antes. Quem só tem acesso ao e-mail, sem a senha, não entra.

create table public.mfa_email_challenges (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index mfa_email_challenges_user_idx on public.mfa_email_challenges(user_id, created_at desc);

alter table public.mfa_email_challenges enable row level security;
revoke all on public.mfa_email_challenges from anon, authenticated;

-- Momento em que a sessão atual foi aberta pelo código de e-mail (ou null).
create or replace function public.email_code_session_at()
returns timestamptz
language sql stable
set search_path = public
as $$
  select to_timestamp(max((a ->> 'timestamp')::bigint))
  from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) a
  where a ->> 'method' in ('otp', 'magiclink')
$$;

create or replace function public.mfa_satisfied()
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select
    coalesce(public.current_staff_role() not in ('manager', 'owner', 'developer'), true)
    or coalesce((public.param_value('security.require_mfa_management') #>> '{}')::boolean, true) = false
    or exists (
      select 1
      from public.mfa_email_challenges c
      where c.user_id = auth.uid()
        and public.email_code_session_at() is not null
        and c.created_at between public.email_code_session_at() - interval '15 minutes'
                             and public.email_code_session_at() + interval '1 minute'
    )
$$;

create or replace function public.begin_email_verification()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.staff_role := public.current_staff_role();
begin
  if v_role is null then
    raise exception 'not_authorised' using errcode = '42501';
  end if;
  if v_role not in ('manager', 'owner', 'developer') then
    raise exception 'not_required' using errcode = '22023';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) a
    where a ->> 'method' = 'password'
  ) then
    raise exception 'password_session_required' using errcode = '42501';
  end if;
  if (select count(*) from public.mfa_email_challenges
      where user_id = auth.uid() and created_at > now() - interval '15 minutes') >= 5 then
    raise exception 'too_many_code_requests' using errcode = '54000';
  end if;
  insert into public.mfa_email_challenges (user_id) values (auth.uid());
end
$$;

revoke all on function public.email_code_session_at(), public.begin_email_verification() from public, anon;
grant execute on function public.email_code_session_at(), public.begin_email_verification(), public.mfa_satisfied() to authenticated;

-- O idioma do cadastro vai para os dados do login, para o e-mail sair no idioma
-- de quem recebe (s.15.1, B54).
create or replace function public.staff_sync_locale()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is not null then
    update auth.users
       set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('locale', new.locale::text)
     where id = new.user_id;
  end if;
  return new;
end
$$;

create trigger staff_sync_locale
after insert or update of locale, user_id on public.staff
for each row execute function public.staff_sync_locale();

-- Copia o idioma das contas que já existem.
update auth.users u
   set raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('locale', s.locale::text)
  from public.staff s
 where s.user_id = u.id;

-- Funções de gatilho não são chamadas por ninguém diretamente.
revoke all on function public.staff_sync_locale() from public, anon, authenticated;

-- O Postgres concede EXECUTE a PUBLIC em toda função nova; a revogação por schema
-- (migração 4) não remove esse padrão global. Esta remove.
alter default privileges revoke execute on functions from public;
