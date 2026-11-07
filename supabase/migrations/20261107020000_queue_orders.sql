-- List today's active queue orders (queued, preparing and ready) in creation sequence for authorised staff.
create function public.queue_orders(p_staff_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'Asia/Singapore')::date;
  v_orders jsonb;
begin
  if not exists (
    select 1 from public.staff
    where id = p_staff_id and is_active and role in ('barista', 'counter', 'admin')
  ) then
    raise exception 'BB_FORBIDDEN';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', o.id,
        'order_number', o.order_number,
        'event_day', o.event_day,
        'customer_first_name', o.customer_first_name,
        'status', o.status,
        'created_at', o.created_at,
        'version', o.version,
        'items', coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'id', i.id,
                'menu_item_name', i.menu_item_name,
                'quantity', i.quantity,
                'add_ons', coalesce(
                  (
                    select jsonb_agg(a.add_on_name order by a.add_on_name, a.id)
                    from public.order_item_add_ons a
                    where a.order_item_id = i.id
                  ),
                  '[]'::jsonb
                )
              )
              order by i.id
            )
            from public.order_items i
            where i.order_id = o.id
          ),
          '[]'::jsonb
        )
      )
      order by o.created_at asc, o.order_number asc, o.id asc
    ),
    '[]'::jsonb
  )
  into v_orders
  from public.orders o
  where o.event_day = v_day
    and o.status in ('queued', 'preparing', 'ready');

  return v_orders;
end;
$$;

revoke all on function public.queue_orders(uuid) from public, anon, authenticated;
grant execute on function public.queue_orders(uuid) to service_role;
