-- F20: Mark collected on an order the pickup scanner already collected succeeds instead of conflicting.
create or replace function public.queue_update_status(
  p_staff_id uuid,
  p_order_id uuid,
  p_expected_version integer,
  p_status text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_current public.orders;
  v_updated public.orders;
begin
  if not exists (
    select 1 from public.staff
    where id = p_staff_id and is_active and role in ('barista', 'counter', 'admin')
  ) then
    raise exception 'BB_FORBIDDEN';
  end if;

  if p_order_id is null
     or p_expected_version is null
     or p_expected_version < 1
     or p_status is null
     or p_status not in ('preparing', 'ready', 'collected') then
    raise exception 'BB_INVALID';
  end if;

  select * into v_current
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'BB_NOT_FOUND';
  end if;

  -- F20: the pickup scanner may have collected it first. That is the outcome the barista wanted,
  -- so report the collected order instead of a version conflict.
  if p_status = 'collected' and v_current.status = 'collected' then
    return jsonb_build_object(
      'id', v_current.id,
      'order_number', v_current.order_number,
      'event_day', v_current.event_day,
      'status', v_current.status,
      'version', v_current.version,
      'updated_at', v_current.updated_at,
      'ready_at', v_current.ready_at,
      'collected_at', v_current.collected_at
    );
  end if;

  if v_current.version <> p_expected_version then
    raise exception 'BB_CONFLICT';
  end if;

  if not (
    (v_current.status = 'queued' and p_status = 'preparing') or
    (v_current.status = 'preparing' and p_status = 'ready') or
    (v_current.status = 'ready' and p_status = 'collected')
  ) then
    raise exception 'BB_INVALID_TRANSITION';
  end if;

  update public.orders
  set
    status = p_status,
    version = version + 1,
    updated_at = now(),
    ready_at = case when p_status = 'ready' then now() else ready_at end,
    collected_at = case when p_status = 'collected' then now() else collected_at end
  where id = p_order_id
  returning * into v_updated;

  return jsonb_build_object(
    'id', v_updated.id,
    'order_number', v_updated.order_number,
    'event_day', v_updated.event_day,
    'status', v_updated.status,
    'version', v_updated.version,
    'updated_at', v_updated.updated_at,
    'ready_at', v_updated.ready_at,
    'collected_at', v_updated.collected_at
  );
end;
$$;

revoke all on function public.queue_update_status(uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.queue_update_status(uuid, uuid, integer, text) to service_role;
