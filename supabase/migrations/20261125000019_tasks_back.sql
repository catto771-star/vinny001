-- Revisão 2, item 10: Daily Tasks de volta. A conta da casa assina em nome de quem está no turno
-- (turno aberto no Handover) ou de quem for escolhido; Admin assina por si.
drop function if exists public.sign_task(text, uuid, uuid, date, text);
create or replace function public.sign_task(p_kind text, p_task uuid, p_lodge uuid, p_day date, p_shift text, p_signed_by uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_staff_id();
  v_post public.duty_posts := public.my_open_post();
  v_signer uuid;
begin
  if v_me is null or not public.can_write_lodge(p_lodge) then raise exception 'not_authorised' using errcode = '42501'; end if;
  if public.shift_start_of(p_day, p_shift) > now() + interval '5 minutes' then
    raise exception 'shift_not_started' using errcode = '22023';
  end if;
  if not exists (select 1 from public.shift_tasks(p_lodge, p_day, p_shift) t where t.kind = p_kind and t.task_id = p_task) then
    raise exception 'task_not_in_shift' using errcode = '22023';
  end if;
  v_signer := coalesce(p_signed_by,
    case when public.current_staff_role() = 'station'
         then (select s.staff_id from public.handover_shifts s where s.lodge_id = p_lodge and s.closed_at is null limit 1)
         else v_me end);
  if v_signer is null or not exists (
       select 1 from public.staff where id = v_signer and active and role in ('porter', 'manager', 'owner', 'developer')) then
    raise exception 'invalid_filled_by' using errcode = '22023';
  end if;
  insert into public.task_signatures (lodge_id, operational_day, shift, template_id, extra_id, staff_id, duty_function)
  values (p_lodge, p_day, p_shift,
          case when p_kind = 'template' then p_task end, case when p_kind = 'extra' then p_task end,
          v_signer, coalesce(v_post.function::text, case when public.current_staff_role() = 'station' then 'office' else public.current_staff_role()::text end))
  on conflict do nothing;
end
$$;
revoke all on function public.sign_task(text, uuid, uuid, date, text, uuid) from public, anon;
grant execute on function public.sign_task(text, uuid, uuid, date, text, uuid) to authenticated;

-- Admin desativa um modelo recorrente (some dos próximos turnos; o histórico fica).
create or replace function public.set_task_template_active(p_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  update public.task_templates set active = coalesce(p_active, false) where id = p_id;
  if not found then raise exception 'task_not_found' using errcode = 'P0002'; end if;
end
$$;
revoke all on function public.set_task_template_active(uuid, boolean) from public, anon;
grant execute on function public.set_task_template_active(uuid, boolean) to authenticated;
