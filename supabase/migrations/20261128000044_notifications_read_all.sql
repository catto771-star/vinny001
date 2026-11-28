-- "Mark all as read" nas Notificações: marca de uma vez todas as não lidas que ESTE usuário pode ver
-- (mesmas regras de my_notifications). Vale só para quem clicou; devolve quantas marcou; repetir devolve 0.
create or replace function public.mark_all_notifications_read()
returns integer
language sql
security definer
set search_path = public
as $$
  with ins as (
    insert into public.notification_reads (notification_id, staff_id)
    select n.id, public.current_staff_id()
    from public.notifications n
    where public.is_active_staff()
      and (n.audience = 'lodge' or public.is_management())
      and (n.lodge_id is null or public.can_see_lodge(n.lodge_id))
    on conflict do nothing
    returning 1
  )
  select count(*)::int from ins
$$;

revoke all on function public.mark_all_notifications_read() from public, anon;
grant execute on function public.mark_all_notifications_read() to authenticated;
