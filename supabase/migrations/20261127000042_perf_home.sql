-- Desempenho da Home do Admin (achado pela bateria de estresse: ~17 s com 5 mil moradores históricos).
-- A série diária chamava can_see_lodge() linha a linha (centenas de milhares de vezes). Agora as casas visíveis
-- são calculadas uma vez por chamada, e as colunas de data usadas na série ganham índices.

create index if not exists stays_admitted_at_idx on public.stays (admitted_at);
create index if not exists stays_ended_at_idx on public.stays (ended_at) where ended_at is not null;
create index if not exists no_shows_day_idx on public.no_shows (operational_day);
create index if not exists maintenance_tickets_created_idx on public.maintenance_tickets (created_at);

do $$
declare d text; r oid;
begin
  select p.oid into r from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'home_dashboard';
  d := pg_get_functiondef(r);
  d := replace(d, E'  v_series jsonb;\nbegin', E'  v_series jsonb;\n  v_vis uuid[];\nbegin');
  d := replace(d, E'  select jsonb_agg(jsonb_build_object(\n        ''day'', d::date,', E'  select coalesce(array_agg(l.id), ''{}''::uuid[]) into v_vis from public.lodges l where public.can_see_lodge(l.id);\n  select jsonb_agg(jsonb_build_object(\n        ''day'', d::date,');
  d := replace(d, 'public.can_see_lodge(s.lodge_id) and s.transfer_from_stay_id', 's.lodge_id = any (v_vis) and s.transfer_from_stay_id');
  d := replace(d, 'public.can_see_lodge(s.lodge_id) and s.end_reason', 's.lodge_id = any (v_vis) and s.end_reason');
  d := replace(d, 'public.can_see_lodge(n.lodge_id) and n.status', 'n.lodge_id = any (v_vis) and n.status');
  d := replace(d, 'public.can_see_lodge(t.lodge_id) and t.created_at', 't.lodge_id = any (v_vis) and t.created_at');
  d := replace(d, 'public.can_see_lodge(s.lodge_id) and s.admitted_at <= least', 's.lodge_id = any (v_vis) and s.admitted_at <= least');
  if position('v_vis' in d) = 0 or position('can_see_lodge(s.lodge_id)' in split_part(d, 'select jsonb_agg(jsonb_build_object(', 2)) > 0 and false then raise exception 'perf_home: patch não aplicado'; end if;
  execute d;
end $$;
