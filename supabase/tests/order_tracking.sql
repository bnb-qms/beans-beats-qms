-- Run after all migrations against a disposable database; fixtures roll back.
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
  staff_id uuid := gen_random_uuid();
  drink_id uuid := gen_random_uuid();
  request_id uuid := gen_random_uuid();
  other_id uuid := gen_random_uuid();
  second_request uuid := gen_random_uuid();
  mobile_request uuid := gen_random_uuid();
  receipt jsonb;
  second_receipt jsonb;
  mobile_receipt jsonb;
  items jsonb;
  token text;
  second_token text;
  mobile_token text;
  guest jsonb;
begin
  insert into public.staff (id, username, password_hash, role)
    values (staff_id, 'tracking_test_' || staff_id, 'not-a-login-hash', 'barista');
  insert into public.menu_items (id, name, base_price) values (drink_id, 'latte', 8);
  items := jsonb_build_array(jsonb_build_object('menu_item_id', drink_id, 'quantity', 1, 'add_on_ids', '[]'::jsonb));
  receipt := public.counter_submit_order(staff_id, request_id, 'Guest', null, false, items, 800);
  token := receipt->>'tracking_token';
  perform pg_temp.assert_true(token ~ '^[0-9a-f]{64}$', 'server generates 256-bit token');
  perform pg_temp.assert_true(receipt = public.counter_submit_order(staff_id, request_id, 'Guest', null, false, items, 800), 'retry keeps same token and receipt');
  select to_jsonb(g) into guest from public.guest_order_status(token) g;
  perform pg_temp.assert_true(guest = jsonb_build_object('order_number', (receipt->>'order_number')::int, 'event_day', receipt->>'event_day', 'status', 'queued'), 'guest sees only allowed fields');
  insert into public.orders (id, event_day, order_number, customer_first_name, total_amount, created_by, client_request_id)
    values (other_id, (receipt->>'event_day')::date + 1, (receipt->>'order_number')::int, 'Other', 8, staff_id, other_id);
  perform pg_temp.assert_true((select tracking_token <> token from public.orders where id = other_id), 'same number next day has different token');
  perform pg_temp.assert_true((select event_day = (receipt->>'event_day')::date from public.guest_order_status(token)), 'old link still resolves original day');
  perform pg_temp.assert_true(not exists(select from public.guest_order_status(null)), 'missing token reveals nothing');
  perform pg_temp.assert_true(not exists(select from public.guest_order_status('1')), 'pickup number reveals nothing');
  perform pg_temp.assert_true(not exists(select from public.guest_order_status(request_id::text)), 'order ID reveals nothing');
  perform pg_temp.assert_true(not exists(select from public.guest_order_status(repeat('f',64))), 'unknown token reveals nothing');
  update public.orders set status = 'ready' where id = request_id;
  perform pg_temp.assert_true((select status = 'ready' from public.guest_order_status(token)), 'reads confirmed status');
  perform pg_temp.assert_true((select status = 'ready' from public.orders where id = request_id), 'read never collects order');
  -- Status changes never change the tracking credential or the receipt.
  update public.orders set status = 'collected', version = version + 1 where id = request_id;
  perform pg_temp.assert_true((select status = 'collected' from public.guest_order_status(token)), 'same token tracks the collected status');
  perform pg_temp.assert_true((select tracking_token from public.orders where id = request_id) = token, 'token stable across the status journey');
  perform pg_temp.assert_true(public.counter_submit_order(staff_id, request_id, 'Guest', null, false, items, 800) = receipt, 'late retry keeps the same token and receipt');
  perform pg_temp.expect_error(format('insert into public.orders (id, event_day, order_number, customer_first_name, total_amount, created_by, client_request_id, tracking_token) values (%L, %L, 9999, %L, 8, %L, %L, %L)', gen_random_uuid(), (receipt->>'event_day')::date, 'Dup', staff_id, gen_random_uuid(), token), 'duplicate key value violates unique constraint "orders_tracking_token_key"');
  update public.orders set tracking_expires_at = now() - interval '1 second' where id = request_id;
  perform pg_temp.assert_true(not exists(select from public.guest_order_status(token)), 'expired link reveals nothing');
  perform pg_temp.assert_true(to_regprocedure('public.guest_order_status(uuid)') is null, 'legacy ID access removed');
  perform pg_temp.assert_true(has_function_privilege('anon', 'public.guest_order_status(text)', 'execute'), 'guests can track');
  perform pg_temp.assert_true(not has_table_privilege('anon', 'public.orders', 'select'), 'guests cannot list orders or tokens');
  perform pg_temp.assert_true(not has_table_privilege('anon', 'public.orders', 'update'), 'guests cannot change orders');
  perform pg_temp.assert_true(not has_function_privilege('anon', 'public.counter_receipt(uuid)', 'execute'), 'guests cannot read receipts');
  -- Random unique tokens: every order gets its own 256-bit credential.
  second_receipt := public.counter_submit_order(staff_id, second_request, 'Second', null, false, items, 800);
  second_token := second_receipt->>'tracking_token';
  perform pg_temp.assert_true(second_token ~ '^[0-9a-f]{64}$', 'second order gets a 256-bit token');
  perform pg_temp.assert_true(second_token <> token, 'tokens are unique per order');
  perform pg_temp.assert_true(second_token <> second_request::text, 'token is not derived from the request ID');
  -- Access isolation: each token resolves only its own order, one row.
  perform pg_temp.assert_true((select order_number = (second_receipt->>'order_number')::int from public.guest_order_status(second_token)), 'second token sees only its own order');
  perform pg_temp.assert_true((select count(*) from public.guest_order_status(second_token)) = 1, 'a token resolves exactly one row');
  perform pg_temp.assert_true((select count(*) from public.guest_order_status(token)) = 0, 'the expired token resolves nothing');
  -- Expiry: a future expiry keeps the link live and never hides a sibling order.
  update public.orders set tracking_expires_at = now() + interval '1 hour' where id = request_id;
  perform pg_temp.assert_true((select status = 'collected' from public.guest_order_status(token)), 'future expiry keeps the link live');
  perform pg_temp.assert_true((select status = 'queued' from public.guest_order_status(second_token)), 'expiring one order never hides another');
  update public.orders set tracking_expires_at = now() - interval '1 second' where id = request_id;
  perform pg_temp.assert_true(not exists(select from public.guest_order_status(token)), 'past expiry reveals nothing again');
  perform pg_temp.assert_true((select status = 'queued' from public.guest_order_status(second_token)), 'the other link survives the first expiry');
  -- No mobile or name in the guest response, even when both are recorded.
  mobile_receipt := public.counter_submit_order(staff_id, mobile_request, 'Priya', '91234567', true, items, 800);
  mobile_token := mobile_receipt->>'tracking_token';
  perform pg_temp.assert_true(mobile_token <> token and mobile_token <> second_token, 'every order gets a distinct token');
  select to_jsonb(g) into guest from public.guest_order_status(mobile_token) g;
  perform pg_temp.assert_true(guest = jsonb_build_object('order_number', (mobile_receipt->>'order_number')::int, 'event_day', mobile_receipt->>'event_day', 'status', 'queued'), 'guest response has exactly the allowed fields');
  perform pg_temp.assert_true(not (guest ? 'customer_first_name') and not (guest ? 'customer_mobile'), 'no name or mobile number in the guest response');
  -- Legacy order-ID access is gone, not just deprivileged.
  perform pg_temp.expect_error(format('select public.guest_order_status(%L::uuid)', request_id), 'function public.guest_order_status(uuid) does not exist');
end $$;
rollback;
