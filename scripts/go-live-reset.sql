-- Limpeza para entrar em operação real: apaga TODOS os dados operacionais fictícios e mantém só a estrutura.
-- MANTÉM: casas, quartos, camas, geladeiras, máquinas de lavar e secar, fornecedores, lista padrão do Tesco,
--         tags do Handover, parâmetros do sistema, modelos de tarefas diárias e as contas listadas em KEEP_EMAILS
--         (com o aparelho e as preferências de notificação delas).
-- NÃO MEXE em audit_log nem access_log (têm bloqueio de alteração de propósito).
-- Uso: substituir @@KEEP_EMAIL_1@@ e @@KEEP_EMAIL_2@@ (não ficam no repositório) e rodar numa transação.
-- Com MODE = 'dry' o resultado é devolvido numa exceção, que desfaz tudo (ensaio).
do $$
declare
  v_mode text := '@@MODE@@';
  v_keep uuid[];
  v_out jsonb;
begin
  select array_agg(id) into v_keep from public.staff where email in ('@@KEEP_EMAIL_1@@', '@@KEEP_EMAIL_2@@');
  if v_keep is null or cardinality(v_keep) <> 2 then
    raise exception 'esperava exatamente 2 contas para manter, achei %', coalesce(cardinality(v_keep), 0);
  end if;

  -- 1) dados operacionais
  truncate table
    public.absences, public.dinner_marks, public.dinner_services, public.duty_posts, public.food_deliveries,
    public.fridge_readings, public.handover_entries, public.handover_entry_staff, public.handover_entry_tags,
    public.handover_mentions, public.handover_shifts, public.holiday_locks, public.laundry_uses,
    public.maintenance_events, public.maintenance_reminder_snoozes, public.maintenance_tickets, public.no_shows,
    public.notification_reads, public.notifications, public.product_movements, public.products,
    public.purchase_lines, public.purchases, public.residents, public.room_check_marks, public.room_check_runs,
    public.rota_shifts, public.shop_order_lines, public.shop_orders, public.sightings, public.stays,
    public.task_extras, public.task_signatures, public.vacations, public.warnings, public.work_intervals,
    public.access_log;

  -- 2) sobras de teste na estrutura (por nome exato)
  delete from public.beds where room_id in (select r.id from public.rooms r join public.lodges l on l.id = r.lodge_id where l.code = 'AMIENS' and r.code = 'S1');
  delete from public.rooms where id in (select r.id from public.rooms r join public.lodges l on l.id = r.lodge_id where l.code = 'AMIENS' and r.code = 'S1');
  delete from public.fridges where name = 'Scenario cold room';
  delete from public.laundry_machines where code in ('M1-WASH', 'M2-WASH', 'M3-WASH');
  delete from public.suppliers where name like 'E2E Supplier %';

  -- 3) contas: só as 2 que ficam
  update public.task_templates set created_by = null where created_by is not null and created_by <> all (v_keep);
  delete from public.push_prefs where staff_id <> all (v_keep);
  delete from public.push_subscriptions where staff_id <> all (v_keep);
  update public.staff set created_by = null, deactivated_by = null where id = any (v_keep);
  delete from public.staff where id <> all (v_keep);

  select jsonb_build_object(
    'staff', (select jsonb_agg(role || ':' || full_name order by role) from public.staff),
    'residents', (select count(*) from public.residents), 'stays', (select count(*) from public.stays),
    'handover', (select count(*) from public.handover_entries), 'notifications', (select count(*) from public.notifications),
    'lodges', (select count(*) from public.lodges), 'rooms', (select count(*) from public.rooms), 'beds', (select count(*) from public.beds),
    'fridges', (select count(*) from public.fridges), 'laundry_machines', (select count(*) from public.laundry_machines),
    'suppliers', (select jsonb_agg(name order by sort_order) from public.suppliers),
    'shop_items', (select count(*) from public.shop_items), 'tags', (select count(*) from public.handover_tags),
    'parameters', (select count(*) from public.parameters), 'task_templates', (select count(*) from public.task_templates),
    'push_subscriptions', (select count(*) from public.push_subscriptions), 'push_prefs', (select count(*) from public.push_prefs),
    'audit_log', (select count(*) from public.audit_log), 'access_log', (select count(*) from public.access_log)
  ) into v_out;

  if v_mode = 'dry' then
    raise exception 'ENSAIO:%', v_out::text;
  end if;
  raise notice 'RESULT:%', v_out::text;
end $$;
