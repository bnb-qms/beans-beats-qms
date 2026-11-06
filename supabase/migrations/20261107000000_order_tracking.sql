-- Tracking credentials are independent of client-generated submission IDs.
alter table public.orders
  add column tracking_token text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  add column tracking_expires_at timestamptz,
  add constraint orders_tracking_token_key unique (tracking_token);

-- Do not retain the legacy public order-ID access path.
drop function public.guest_order_status(uuid);
create function public.guest_order_status(p_tracking_token text)
returns table (order_number integer, event_day date, status text)
language sql stable security definer set search_path = '' as $$
  select o.order_number, o.event_day, o.status
  from public.orders o
  where p_tracking_token ~ '^[0-9a-f]{64}$'
    and o.tracking_token = p_tracking_token
    and (o.tracking_expires_at is null or o.tracking_expires_at > now())
$$;
revoke all on function public.guest_order_status(text) from public;
grant execute on function public.guest_order_status(text) to anon, authenticated;

-- The existing submission transaction and its retry path both use this receipt.
create or replace function public.counter_receipt(p_order_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', o.id, 'order_number', o.order_number, 'event_day', o.event_day,
    'tracking_token', o.tracking_token,
    'customer_first_name', o.customer_first_name, 'total_amount', o.total_amount,
    'items', (select jsonb_agg(jsonb_build_object(
      'menu_item_name', i.menu_item_name, 'quantity', i.quantity, 'unit_price', i.unit_price,
      'order_item_add_ons', coalesce((select jsonb_agg(jsonb_build_object(
        'add_on_name', a.add_on_name, 'unit_price', a.unit_price
      ) order by a.add_on_name) from public.order_item_add_ons a where a.order_item_id = i.id), '[]'::jsonb)
    ) order by i.id) from public.order_items i where i.order_id = o.id)
  ) from public.orders o where o.id = p_order_id
$$;
revoke all on function public.counter_receipt(uuid) from public, anon, authenticated;
grant execute on function public.counter_receipt(uuid) to service_role;
