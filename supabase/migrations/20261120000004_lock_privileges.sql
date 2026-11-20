-- O Supabase concede por padrão ALL (inclusive DELETE e TRUNCATE) a anon e authenticated
-- em toda tabela nova. TRUNCATE ignora a RLS, e nada no DS Lodge é apagado (s.9):
-- correções são novos registros. Aqui ficam só os privilégios realmente usados.

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on public.lodges, public.rooms, public.beds, public.staff, public.parameters,
  public.duty_posts, public.residents, public.stays, public.audit_log, public.access_log,
  public.bed_occupancy to authenticated;
grant insert, update on public.lodges, public.rooms, public.beds, public.staff, public.residents to authenticated;
grant insert on public.parameters to authenticated;

-- Tabelas e funções criadas em migrações futuras não ganham nada automaticamente;
-- cada migração concede explicitamente o que precisa.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated, public;
