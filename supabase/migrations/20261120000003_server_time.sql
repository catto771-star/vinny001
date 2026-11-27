-- Hora do servidor para o relógio da tela (B56): o relógio mostra a hora do
-- servidor corrigida, e todos os registros usam now() no banco, nunca a hora do computador.
create or replace function public.server_now()
returns timestamptz
language sql volatile
as $$ select clock_timestamp() $$;

grant execute on function public.server_now() to authenticated, anon;
