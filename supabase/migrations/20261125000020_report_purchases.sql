-- Revisão 2, item 6: Reports por categoria — Compras (pedidos do Tesco no período, as duas casas juntas).
create or replace function public.report_purchases(p_from date, p_to date)
returns jsonb
language plpgsql stable
security definer
set search_path = public
as $$
begin
  if not public.is_management() then raise exception 'not_authorised' using errcode = '42501'; end if;
  perform public.check_period(array[gen_random_uuid()], p_from, p_to);
  return (
    with o as (select * from public.shop_orders where delivery_date >= p_from and delivery_date < p_to),
         l as (select l.*, i.name, i.category from public.shop_order_lines l join o on o.id = l.order_id join public.shop_items i on i.id = l.item_id where l.final_qty > 0)
    select jsonb_build_object(
      'orders', (select count(*) from o),
      'placed', (select count(*) from o where status = 'placed'),
      'items', (select coalesce(sum(final_qty), 0) from l),
      'total', (select coalesce(sum(final_qty * unit_price), 0) from l),
      'lines_without_price', (select count(*) from l where unit_price is null),
      'by_category', coalesce((select jsonb_agg(jsonb_build_object('category', category, 'total', total, 'items', items) order by total desc)
                                from (select category, coalesce(sum(final_qty * unit_price), 0) total, sum(final_qty) items from l group by category) x), '[]'::jsonb),
      'top_items', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'qty', qty, 'total', total) order by total desc, qty desc)
                              from (select name, sum(final_qty) qty, coalesce(sum(final_qty * unit_price), 0) total from l group by name order by 3 desc, 2 desc limit 8) x), '[]'::jsonb)
    ));
end
$$;
revoke all on function public.report_purchases(date, date) from public, anon;
grant execute on function public.report_purchases(date, date) to authenticated;
