-- Desempenho do isolamento por casa (achado pela bateria de estresse: lista de ex-moradores ~3 s com 5 mil registros).
-- A política house_scope chamava can_see_lodge() linha a linha. Quem não é conta de casa (Admin, Float...) vê tudo,
-- então isso é decidido UMA vez por consulta (initplan) e só a conta de casa paga o teste por linha.
-- Mesma regra de antes: auth.uid() nulo ou equipe ativa que não seja conta de casa vê todas as casas.

create or replace function public.sees_all_lodges()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is null or (public.is_active_staff() and public.current_staff_role() is distinct from 'station')
$$;
grant execute on function public.sees_all_lodges() to authenticated;

do $$
declare r record;
begin
  for r in select schemaname, tablename, qual from pg_policies where policyname = 'house_scope' and qual like '%can_see_lodge%' and qual not like '%sees_all_lodges%' loop
    execute format('alter policy house_scope on %I.%I using ((select public.sees_all_lodges()) or (%s))', r.schemaname, r.tablename, r.qual);
  end loop;
end $$;
