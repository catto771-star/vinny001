-- Revisão 8: busca no Handover por período e filtros (texto, tipo, tags, pessoa, residente, função do turno).
-- Devolve só as colunas que a tela já pode ler; quem chama precisa ser equipe ativa.
create index if not exists handover_entries_filled_by_idx on public.handover_entries(filled_by, occurred_at desc);
create index if not exists handover_entry_tags_tag_idx on public.handover_entry_tags(tag_id, entry_id);

create or replace function public.search_handover(
  p_lodge uuid, p_from date, p_to date, p_q text default null, p_kinds text[] default null, p_tags uuid[] default null,
  p_staff uuid default null, p_resident uuid default null, p_function text default null, p_include_voided boolean default false,
  p_limit integer default 100
)
returns table (id uuid, lodge_id uuid, kind text, body text, occurred_at timestamptz, operational_day date, round_slot text,
               author_id uuid, filled_by uuid, late_reason text, status text, void_reason text, version integer)
language plpgsql stable
security definer
set search_path = public
as $$
declare
  v_q text := nullif(trim(coalesce(p_q, '')), '');
begin
  if not public.is_active_staff() then raise exception 'not_authorised' using errcode = '42501'; end if;
  if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to) or p_to < p_from then raise exception 'invalid_range' using errcode = '22023'; end if;
  if p_to - p_from > 92 then raise exception 'range_too_large' using errcode = '22023'; end if;
  return query
  select e.id, e.lodge_id, e.kind, e.body, e.occurred_at, e.operational_day, e.round_slot, e.author_id, e.filled_by, e.late_reason, e.status, e.void_reason, e.version
  from public.handover_entries e
  where e.lodge_id = p_lodge
    and e.occurred_at >= public.operational_day_start(p_from)
    and e.occurred_at < public.operational_day_start(p_to + 1)
    and (p_include_voided or e.status = 'active')
    and (v_q is null or e.body ilike '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\')
    and (p_kinds is null or cardinality(p_kinds) = 0 or e.kind = any (p_kinds))
    and (p_tags is null or cardinality(p_tags) = 0 or exists (select 1 from public.handover_entry_tags t where t.entry_id = e.id and t.tag_id = any (p_tags)))
    and (p_staff is null or e.filled_by = p_staff or e.author_id = p_staff
         or exists (select 1 from public.handover_entry_staff c where c.entry_id = e.id and c.staff_id = p_staff))
    and (p_resident is null or exists (select 1 from public.handover_mentions m where m.entry_id = e.id and m.resident_id = p_resident))
    and (p_function is null or exists (select 1 from public.handover_shifts s where s.id = e.shift_id and s.function = p_function))
  order by e.occurred_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 100);
end
$$;
revoke all on function public.search_handover(uuid, date, date, text, text[], uuid[], uuid, uuid, text, boolean, integer) from public, anon;
grant execute on function public.search_handover(uuid, date, date, text, text[], uuid[], uuid, uuid, text, boolean, integer) to authenticated;
notify pgrst, 'reload schema';
