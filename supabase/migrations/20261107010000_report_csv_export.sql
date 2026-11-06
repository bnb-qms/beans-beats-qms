-- Export recorded line snapshots and F13-compatible totals from one statement snapshot.
create function public.report_csv_export(p_staff_id uuid, p_date date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if not exists (select 1 from public.staff where id = p_staff_id and is_active and role = 'admin') then
    raise exception 'BB_FORBIDDEN';
  end if;
  if p_date is null or p_date < date '0001-01-01' or p_date > date '9999-12-31' then
    raise exception 'BB_INVALID';
  end if;
  with day_orders as (
    select o.id, o.order_number, o.created_at, o.status, o.total_amount
    from public.orders o
    where o.created_at >= (p_date::timestamp at time zone 'Asia/Singapore')
      and o.created_at < ((p_date + 1)::timestamp at time zone 'Asia/Singapore')
  ), line_options as (
    select a.order_item_id,
      coalesce(jsonb_agg(jsonb_build_object('name', a.add_on_name, 'price_cents', a.unit_price * 100)
        order by a.add_on_name, a.id), '[]'::jsonb) as entries,
      coalesce(sum(a.unit_price), 0) as amount
    from public.order_item_add_ons a
    join public.order_items i on i.id = a.order_item_id
    join day_orders o on o.id = i.order_id
    group by a.order_item_id
  ), lines as (
    select o.created_at, o.id as order_id, i.id as item_id, i.quantity, o.status,
      jsonb_build_object('order_id', o.id, 'order_number', o.order_number,
        'created_at', o.created_at, 'status', o.status, 'drink_name', i.menu_item_name,
        'quantity', i.quantity, 'base_price_cents', i.unit_price * 100,
        'options', coalesce(a.entries, '[]'::jsonb),
        'unit_total_cents', (i.unit_price + coalesce(a.amount, 0)) * 100,
        'line_total_cents', i.quantity * (i.unit_price + coalesce(a.amount, 0)) * 100) as detail
    from day_orders o join public.order_items i on i.order_id = o.id
    left join line_options a on a.order_item_id = i.id
  )
  select jsonb_build_object('date', p_date,
    'lines', coalesce((select jsonb_agg(detail order by created_at, order_id, item_id) from lines), '[]'::jsonb),
    'cups', coalesce((select sum(quantity) from lines where status <> 'cancelled'), 0),
    'sales_cents', coalesce((select sum(total_amount) * 100 from day_orders where status <> 'cancelled'), 0))
  into v_result;
  return v_result;
end;
$$;
revoke all on function public.report_csv_export(uuid, date) from public, anon, authenticated;
grant execute on function public.report_csv_export(uuid, date) to service_role;
