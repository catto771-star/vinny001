-- Revisão 12: Audit de verdade — busca com filtros e paginação (só Admin). Valores sensíveis já estão no log; o acesso é só gestão.
create index if not exists audit_log_actor_idx on public.audit_log(actor_staff_id, occurred_at desc);
create index if not exists audit_log_table_time_idx on public.audit_log(table_name, occurred_at desc);
create index if not exists access_log_actor_idx on public.access_log(actor_staff_id, occurred_at desc);

create or replace function public.search_audit(
  p_from timestamptz default null, p_to timestamptz default null, p_tables text[] default null, p_actions text[] default null,
  p_actor uuid default null, p_record text default null, p_q text default null, p_limit integer default 100, p_before bigint default null
)
returns table (id bigint, occurred_at timestamptz, actor_staff_id uuid, actor_name text, action text, table_name text, record_id text, old_data jsonb, new_data jsonb)
language plpgsql stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_q text := nullif(trim(coalesce(p_q, '')), '');
  v_from timestamptz;
  v_to timestamptz;
begin
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  if (p_from is not null and not isfinite(p_from)) or (p_to is not null and not isfinite(p_to)) then raise exception 'invalid_range' using errcode = '22023'; end if;
  v_from := coalesce(p_from, now() - interval '30 days');
  v_to := coalesce(p_to, now() + interval '1 minute');
  if v_to < v_from then raise exception 'invalid_range' using errcode = '22023'; end if;
  if v_to - v_from > interval '366 days' then raise exception 'range_too_large' using errcode = '22023'; end if;
  return query
  select a.id, a.occurred_at, a.actor_staff_id, coalesce(s.display_name, s.full_name), a.action, a.table_name, a.record_id, a.old_data, a.new_data
  from public.audit_log a
  left join public.staff s on s.id = a.actor_staff_id
  where a.occurred_at >= v_from and a.occurred_at < v_to
    and (p_before is null or a.id < p_before)
    and (p_tables is null or cardinality(p_tables) = 0 or a.table_name = any (p_tables))
    and (p_actions is null or cardinality(p_actions) = 0 or a.action = any (p_actions))
    and (p_actor is null or a.actor_staff_id = p_actor)
    and (p_record is null or a.record_id = p_record)
    and (v_q is null or (coalesce(a.old_data::text, '') || ' ' || coalesce(a.new_data::text, '')) ilike '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\')
  order by a.id desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
end
$$;

create or replace function public.search_access_log(
  p_from timestamptz default null, p_to timestamptz default null, p_actor uuid default null, p_q text default null,
  p_limit integer default 100, p_before bigint default null
)
returns table (id bigint, occurred_at timestamptz, actor_staff_id uuid, actor_name text, resident_id uuid, resident_name text, context text)
language plpgsql stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_q text := nullif(trim(coalesce(p_q, '')), '');
  v_from timestamptz;
  v_to timestamptz;
begin
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  if (p_from is not null and not isfinite(p_from)) or (p_to is not null and not isfinite(p_to)) then raise exception 'invalid_range' using errcode = '22023'; end if;
  v_from := coalesce(p_from, now() - interval '30 days');
  v_to := coalesce(p_to, now() + interval '1 minute');
  if v_to < v_from then raise exception 'invalid_range' using errcode = '22023'; end if;
  if v_to - v_from > interval '366 days' then raise exception 'range_too_large' using errcode = '22023'; end if;
  return query
  select a.id, a.occurred_at, a.actor_staff_id, coalesce(s.display_name, s.full_name), a.resident_id, r.first_name || ' ' || r.last_name, a.context
  from public.access_log a
  left join public.staff s on s.id = a.actor_staff_id
  left join public.residents r on r.id = a.resident_id
  where a.occurred_at >= v_from and a.occurred_at < v_to
    and (p_before is null or a.id < p_before)
    and (p_actor is null or a.actor_staff_id = p_actor)
    and (v_q is null or (r.first_name || ' ' || r.last_name) ilike '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\')
  order by a.id desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
end
$$;
revoke all on function public.search_audit(timestamptz, timestamptz, text[], text[], uuid, text, text, integer, bigint) from public, anon;
revoke all on function public.search_access_log(timestamptz, timestamptz, uuid, text, integer, bigint) from public, anon;
grant execute on function public.search_audit(timestamptz, timestamptz, text[], text[], uuid, text, text, integer, bigint) to authenticated;
grant execute on function public.search_access_log(timestamptz, timestamptz, uuid, text, integer, bigint) to authenticated;
notify pgrst, 'reload schema';
