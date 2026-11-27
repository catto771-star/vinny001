-- Correção: o modelo de tarefas carregado na instalação (migração 8) estava valendo desde
-- 01/01/2026 e criava centenas de "pendências" de dias em que o sistema ainda não era usado.
-- Passa a valer a partir de agora (instalação). Tarefas não feitas a partir daqui continuam
-- pendentes normalmente (s.7).
update public.task_templates
   set created_at = now()
 where created_by is null
   and created_at = '2026-01-01T00:00:00Z';
