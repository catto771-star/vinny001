-- Enriquece a demonstração com o que veio depois do seed original: tags e colegas nas anotações do Handover.
create or replace function demo.enrich()
returns jsonb
language plpgsql
set search_path = public
as $$
declare v_tags integer; v_co integer;
begin
  with demo_staff as (select id from public.staff where email like '%@demo.ds-lodge.test' and role in ('porter', 'manager', 'owner')),
  ins as (
    insert into public.handover_entry_tags (entry_id, tag_id)
    select e.id, (select g.id from public.handover_tags g order by md5(e.id::text || t.n::text) limit 1)
    from public.handover_entries e cross join generate_series(1, 2) t(n)
    where e.kind = 'note' and e.author_id in (select id from demo_staff)
      and get_byte(decode(md5(e.id::text || t.n::text), 'hex'), 0) % 5 < 2
    on conflict do nothing returning 1)
  select count(*) into v_tags from ins;

  with demo_staff as (select id, row_number() over (order by id) as rn from public.staff where email like '%@demo.ds-lodge.test' and role in ('porter', 'manager', 'owner')),
  cnt as (select count(*) c from demo_staff),
  picks as (
    select e.id as entry_id, s.id as staff_id,
           row_number() over (partition by e.id order by md5(e.id::text || s.id::text)) as pos
    from public.handover_entries e
    join demo_staff s on s.id <> coalesce(e.filled_by, e.author_id)
    where e.kind = 'note' and e.author_id in (select id from demo_staff)
      and get_byte(decode(md5(e.id::text), 'hex'), 1) % 5 = 0),
  ins as (
    insert into public.handover_entry_staff (entry_id, staff_id, position)
    select entry_id, staff_id, pos from picks where pos <= 1 + (get_byte(decode(md5(entry_id::text), 'hex'), 2) % 3)
    on conflict do nothing returning 1)
  select count(*) into v_co from ins;
  return jsonb_build_object('tags', v_tags, 'colleagues', v_co);
end $$;
