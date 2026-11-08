-- F20: a customer-facing scanner marks Ready orders Collected from the guest's tracking QR.

-- Today's Ready orders for the scanner's offline copy. Only a SHA-256 hash of each tracking
-- code leaves the database, so the laptop never stores codes that open a guest's page.
create function public.scan_ready_orders(p_staff_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.staff
    where id = p_staff_id and is_active and role in ('barista', 'counter', 'admin')
  ) then
    raise exception 'BB_FORBIDDEN';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'code_hash', encode(extensions.digest(o.tracking_token, 'sha256'), 'hex'),
      'order_number', o.order_number,
      'customer_first_name', o.customer_first_name
    ) order by o.order_number)
    from public.orders o
    where o.status = 'ready'
      and o.event_day = (now() at time zone 'Asia/Singapore')::date
  ), '[]'::jsonb);
end;
$$;

-- Mark the order behind a tracking code Collected. Not-ready and cancelled orders are reported,
-- not raised, so the scanner can say what to do. Any event day is accepted, because an offline
-- scan from before midnight may only sync after it.
create function public.scan_collect(p_staff_id uuid, p_tracking_token text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_order public.orders;
  v_result text;
begin
  if not exists (
    select 1 from public.staff
    where id = p_staff_id and is_active and role in ('barista', 'counter', 'admin')
  ) then
    raise exception 'BB_FORBIDDEN';
  end if;

  if p_tracking_token is null or p_tracking_token !~ '^[0-9a-f]{64}$' then
    raise exception 'BB_INVALID';
  end if;

  select * into v_order from public.orders
  where tracking_token = p_tracking_token
  for update;

  if not found then
    raise exception 'BB_NOT_FOUND';
  end if;

  if v_order.status = 'ready' then
    update public.orders
    set status = 'collected', version = version + 1, updated_at = now(), collected_at = now()
    where id = v_order.id;
    v_result := 'collected';
  elsif v_order.status = 'collected' then
    v_result := 'already_collected';
  elsif v_order.status = 'cancelled' then
    v_result := 'cancelled';
  else
    v_result := 'not_ready';
  end if;

  return jsonb_build_object(
    'result', v_result,
    'order_number', v_order.order_number,
    'customer_first_name', v_order.customer_first_name
  );
end;
$$;

revoke all on function public.scan_ready_orders(uuid) from public, anon, authenticated;
grant execute on function public.scan_ready_orders(uuid) to service_role;
revoke all on function public.scan_collect(uuid, text) from public, anon, authenticated;
grant execute on function public.scan_collect(uuid, text) to service_role;
