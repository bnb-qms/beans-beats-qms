-- Run after all migrations against a disposable database; fixtures roll back.
begin;
create function pg_temp.assert_true(value boolean, message text) returns void
language plpgsql as $$ begin if value is distinct from true then raise exception 'Assertion failed: %', message; end if; end $$;

do $$
declare
  staff_id uuid := gen_random_uuid();
  drink_id uuid := gen_random_uuid();
  request_id uuid := gen_random_uuid();
  other_id uuid := gen_random_uuid();
  receipt jsonb;
  items jsonb;
  token text;
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
  update public.orders set tracking_expires_at = now() - interval '1 second' where id = request_id;
  perform pg_temp.assert_true(not exists(select from public.guest_order_status(token)), 'expired link reveals nothing');
  perform pg_temp.assert_true(to_regprocedure('public.guest_order_status(uuid)') is null, 'legacy ID access removed');
  perform pg_temp.assert_true(has_function_privilege('anon', 'public.guest_order_status(text)', 'execute'), 'guests can track');
  perform pg_temp.assert_true(not has_table_privilege('anon', 'public.orders', 'select'), 'guests cannot list orders or tokens');
  perform pg_temp.assert_true(not has_table_privilege('anon', 'public.orders', 'update'), 'guests cannot change orders');
  perform pg_temp.assert_true(not has_function_privilege('anon', 'public.counter_receipt(uuid)', 'execute'), 'guests cannot read receipts');
end $$;
rollback;
