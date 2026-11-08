-- #42: staff cancel an uncollected order (drink cannot be made, or the guest asked for a refund).
-- The POS refund stays on the organiser's POS. Cancelled orders leave the queue and board and are
-- excluded from daily totals; the CSV keeps them marked as cancelled.
create function public.queue_cancel_order(
  p_staff_id uuid,
  p_order_id uuid,
  p_expected_version integer
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_order public.orders;
begin
  if not exists (
    select 1 from public.staff
    where id = p_staff_id and is_active and role in ('barista', 'counter', 'admin')
  ) then
    raise exception 'BB_FORBIDDEN';
  end if;

  if p_order_id is null or p_expected_version is null or p_expected_version < 1 then
    raise exception 'BB_INVALID';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'BB_NOT_FOUND';
  end if;

  -- A retry of the same cancel is not an error.
  if v_order.status = 'cancelled' then
    return jsonb_build_object('id', v_order.id, 'order_number', v_order.order_number,
      'status', v_order.status, 'version', v_order.version);
  end if;

  if v_order.status = 'collected' then
    raise exception 'BB_INVALID_TRANSITION';
  end if;

  if v_order.version <> p_expected_version then
    raise exception 'BB_CONFLICT';
  end if;

  update public.orders
  set status = 'cancelled', version = version + 1, updated_at = now()
  where id = p_order_id
  returning * into v_order;

  return jsonb_build_object('id', v_order.id, 'order_number', v_order.order_number,
    'status', v_order.status, 'version', v_order.version);
end;
$$;

revoke all on function public.queue_cancel_order(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.queue_cancel_order(uuid, uuid, integer) to service_role;
