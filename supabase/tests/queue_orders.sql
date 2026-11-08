-- Run after migrations against a disposable database. Fixtures never persist.
begin;
create function pg_temp.assert_true(value boolean, message text) returns void
language plpgsql as $$ begin if value is distinct from true then raise exception 'Assertion failed: %', message; end if; end $$;
create function pg_temp.expect_error(command text, expected text) returns void
language plpgsql as $$
begin
  begin
    execute command;
  exception when others then
    if sqlerrm = expected then return; end if;
    raise exception 'Expected %, got %', expected, sqlerrm;
  end;
  raise exception 'Expected exception %', expected;
end $$;

do $$
declare
  barista_id uuid := gen_random_uuid();
  admin_id uuid := gen_random_uuid();
  counter_id uuid := gen_random_uuid();
  disabled_id uuid := gen_random_uuid();
  latte uuid := gen_random_uuid();
  espresso uuid := gen_random_uuid();
  iced uuid := gen_random_uuid();
  oat uuid := gen_random_uuid();
  older_order uuid := gen_random_uuid();
  newer_order uuid := gen_random_uuid();
  ready_order uuid := gen_random_uuid();
  collected_order uuid := gen_random_uuid();
  cancelled_order uuid := gen_random_uuid();
  yesterday_order uuid := gen_random_uuid();
  older_item uuid := gen_random_uuid();
  newer_item uuid := gen_random_uuid();
  today date := (now() at time zone 'Asia/Singapore')::date;
  result jsonb;
begin
  -- Clear any pre-existing today orders in the transaction snapshot so assertions are exact.
  delete from public.order_item_add_ons;
  delete from public.order_items;
  delete from public.orders;

  insert into public.staff (id, username, password_hash, role)
  values
    (barista_id, 'queue_barista_' || barista_id, 'not-a-login-hash', 'barista'),
    (admin_id, 'queue_admin_' || admin_id, 'not-a-login-hash', 'admin'),
    (counter_id, 'queue_counter_' || counter_id, 'not-a-login-hash', 'counter');
  insert into public.staff (id, username, password_hash, role, is_active)
  values (disabled_id, 'queue_disabled_' || disabled_id, 'not-a-login-hash', 'barista', false);

  insert into public.menu_items (id, name, base_price)
  values (latte, 'latte', 8), (espresso, 'espresso', 3);
  insert into public.add_ons (id, name, price)
  values (iced, 'iced', 1), (oat, 'oat milk', 1);

  insert into public.orders (
    id, event_day, order_number, customer_first_name, customer_mobile,
    status, total_amount, created_by, client_request_id, created_at, version
  )
  values
    (newer_order, today, 102, 'Arjun', '91234567', 'queued', 3, barista_id, newer_order, now() - interval '2 minutes', 1),
    (older_order, today, 101, 'Mei', '81234567', 'preparing', 20, barista_id, older_order, now() - interval '5 minutes', 2),
    (ready_order, today, 103, 'Siti', null, 'ready', 8, barista_id, ready_order, now() - interval '4 minutes', 3),
    (collected_order, today, 104, 'Wei Ling', null, 'collected', 8, barista_id, collected_order, now() - interval '6 minutes', 4),
    (cancelled_order, today, 105, 'Marcus', null, 'cancelled', 8, barista_id, cancelled_order, now() - interval '7 minutes', 2),
    (yesterday_order, today - 1, 1, 'Yesterday', null, 'queued', 8, barista_id, yesterday_order, now() - interval '1 day', 1);

  insert into public.order_items (id, order_id, menu_item_id, menu_item_name, quantity, unit_price)
  values
    (older_item, older_order, latte, 'latte', 2, 8),
    (newer_item, newer_order, espresso, 'espresso', 1, 3);

  insert into public.order_item_add_ons (order_item_id, add_on_id, add_on_name, unit_price)
  values
    (older_item, iced, 'iced', 1),
    (older_item, oat, 'oat milk', 1);

  result := public.queue_orders(barista_id);
  perform pg_temp.assert_true(jsonb_array_length(result) = 3, 'only today queued, preparing and ready orders are returned');
  perform pg_temp.assert_true((result->0->>'id')::uuid = older_order, 'oldest order is returned first');
  perform pg_temp.assert_true((result->0->>'order_number')::integer = 101, 'older order number preserved');
  perform pg_temp.assert_true(result->0->>'customer_first_name' = 'Mei', 'customer name returned');
  perform pg_temp.assert_true(result->0->>'status' = 'preparing', 'preparing status returned');
  perform pg_temp.assert_true((result->0->'items'->0->>'menu_item_name') = 'latte', 'drink name returned');
  perform pg_temp.assert_true((result->0->'items'->0->>'quantity')::integer = 2, 'drink quantity returned');
  perform pg_temp.assert_true((result->0->'items'->0->'add_ons') = jsonb_build_array('iced', 'oat milk'), 'add-ons sorted and returned');
  perform pg_temp.assert_true((result->1->>'id')::uuid = ready_order, 'ready order remains in active queue so it can be marked collected');
  perform pg_temp.assert_true(result->1->>'status' = 'ready', 'ready status returned');
  perform pg_temp.assert_true((result->2->>'id')::uuid = newer_order, 'newer order is returned third');
  perform pg_temp.assert_true(not (result->0 ? 'customer_mobile'), 'mobile number is not exposed in queue payload');
  perform pg_temp.assert_true(not (result->0 ? 'tracking_token'), 'tracking token is not exposed in queue payload');

  perform pg_temp.assert_true(public.queue_orders(admin_id) = result, 'admin can also read queue orders');
  perform pg_temp.assert_true(public.queue_orders(counter_id) = result, 'counter can also read queue orders');
  perform pg_temp.expect_error(format('select public.queue_orders(%L)', disabled_id), 'BB_FORBIDDEN');
  perform pg_temp.expect_error(format('select public.queue_orders(%L)', gen_random_uuid()), 'BB_FORBIDDEN');
  perform pg_temp.expect_error('select public.queue_orders(null)', 'BB_FORBIDDEN');
  perform pg_temp.assert_true(not has_function_privilege('anon', 'public.queue_orders(uuid)', 'execute'), 'anon cannot call queue_orders');
  perform pg_temp.assert_true(not has_function_privilege('authenticated', 'public.queue_orders(uuid)', 'execute'), 'authenticated cannot call queue_orders');
end $$;

do $$
declare
  barista_id uuid := gen_random_uuid();
  boundary_order uuid := gen_random_uuid();
  today date := (now() at time zone 'Asia/Singapore')::date;
  result jsonb;
begin
  delete from public.order_item_add_ons;
  delete from public.order_items;
  delete from public.orders;

  insert into public.staff (id, username, password_hash, role)
  values (barista_id, 'queue_day_barista_' || barista_id, 'not-a-login-hash', 'barista');
  -- Singapore event day at 00:01, which is 16:01 UTC on the previous day.
  insert into public.orders (
    id, event_day, order_number, customer_first_name, status,
    total_amount, created_by, client_request_id, created_at, version
  )
  values (
    boundary_order, today, 1, 'Dawn', 'queued', 8, barista_id, boundary_order,
    ((today + interval '1 minute') at time zone 'Asia/Singapore'), 1
  );

  perform pg_temp.assert_true(
    ((select created_at from public.orders where id = boundary_order) at time zone 'UTC')::date <> today,
    'fixture was created in the previous UTC calendar day'
  );

  result := public.queue_orders(barista_id);
  perform pg_temp.assert_true(jsonb_array_length(result) = 1, 'an order is listed by its Singapore event day, not its UTC created day');
  perform pg_temp.assert_true((result->0->>'id')::uuid = boundary_order, 'boundary order returned');
  perform pg_temp.assert_true(result->0->'items' = '[]'::jsonb, 'an order without items returns an empty items array');
end $$;
rollback;
