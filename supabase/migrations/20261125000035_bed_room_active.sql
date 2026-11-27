-- Revisão 13 (bug achado nos cenários): uma cama ativa dentro de um quarto REMOVIDO ainda aceitava residente.
create or replace function public.stays_check_bed()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.bed_lodge(new.bed_id) is distinct from new.lodge_id then
    raise exception 'bed_not_in_lodge' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' and exists (
       select 1 from public.beds b join public.rooms r on r.id = b.room_id
       where b.id = new.bed_id and (b.status <> 'in_use' or not b.active or not r.active)) then
    raise exception 'bed_out_of_service' using errcode = '23514';
  end if;
  return new;
end
$$;
