-- Beta: conta da casa (login institucional de cada Lodge). Fica numa migração própria porque
-- o novo valor do enum só pode ser usado depois de confirmado.
alter type public.staff_role add value if not exists 'station';
