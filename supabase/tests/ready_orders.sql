-- Run after migrations against a disposable database. Fixtures never persist.
begin;
create function pg_temp.assert_true(value boolean, message text) returns void
language plpgsql as $$ begin if value is distinct from true then raise exception 'Assertion failed: %', message; end if; end $$;

do $$
declare
  staff_id uuid := gen_random_uuid();
  ready_order uuid := gen_random_uuid();
  queued_order uuid := gen_random_uuid();
  preparing_order uuid := gen_random_uuid();
  collected_order uuid := gen_random_uuid();
  cancelled_order uuid := gen_random_uuid();
  today date := (now() at time zone 'Asia/Singapore')::date;
  result jsonb;
begin
  delete from public.order_item_add_ons;
  delete from public.order_items;
  delete from public.orders;

  insert into public.staff (id, username, password_hash, role)
  values (staff_id, 'board_staff_' || staff_id, 'not-a-login-hash', 'barista');

  -- Only the ready order belongs on the public board, even though the
  -- collected order also carries a ready_at timestamp.
  insert into public.orders (
    id, event_day, order_number, customer_first_name, customer_mobile,
    status, total_amount, created_by, client_request_id, created_at,
    ready_at, collected_at, version
  )
  values
    (ready_order, today, 101, 'Siti', '91234567', 'ready', 8, staff_id, ready_order, now() - interval '10 minutes', now() - interval '5 minutes', null, 3),
    (queued_order, today, 102, 'Mei', '81234567', 'queued', 8, staff_id, queued_order, now() - interval '8 minutes', null, null, 1),
    (preparing_order, today, 103, 'Arjun', null, 'preparing', 8, staff_id, preparing_order, now() - interval '7 minutes', null, null, 2),
    (collected_order, today, 104, 'Wei Ling', null, 'collected', 8, staff_id, collected_order, now() - interval '6 minutes', now() - interval '4 minutes', now() - interval '1 minute', 4),
    (cancelled_order, today, 105, 'Marcus', null, 'cancelled', 8, staff_id, cancelled_order, now() - interval '5 minutes', null, null, 2);

  result := (select jsonb_agg(r) from public.ready_orders() r);
  perform pg_temp.assert_true(jsonb_array_length(result) = 1, 'only ready orders appear on the public board');
  perform pg_temp.assert_true((result->0->>'order_number')::integer = 101, 'the ready order is the only row returned');
  perform pg_temp.assert_true(result->0->>'customer_first_name' = 'Siti', 'ready order name returned');
  perform pg_temp.assert_true((result->0->>'event_day')::date = today, 'ready order event day returned');
  perform pg_temp.assert_true(
    (select array_agg(k order by k) from jsonb_object_keys(result->0) as t(k)) =
      array['customer_first_name', 'event_day', 'order_number', 'ready_at'],
    'board rows expose exactly the public board columns'
  );
  perform pg_temp.assert_true(not (result->0 ? 'customer_mobile'), 'mobile number is not exposed on the board');
  perform pg_temp.assert_true(not (result->0 ? 'tracking_token'), 'tracking token is not exposed on the board');

  perform pg_temp.assert_true(has_function_privilege('anon', 'public.ready_orders()', 'execute'), 'anon may execute ready_orders');
  perform pg_temp.assert_true(has_function_privilege('authenticated', 'public.ready_orders()', 'execute'), 'authenticated may execute ready_orders');
  perform pg_temp.assert_true(not has_table_privilege('anon', 'public.orders', 'select'), 'anon cannot read the orders table directly');
end $$;

-- The board is polled by the public booth display, so the function must run for the anon role.
set role anon;
do $$
begin
  if (select count(*) from public.ready_orders()) <> 1 then
    raise exception 'Assertion failed: anon role does not see exactly the ready order';
  end if;
end $$;
reset role;

do $$
declare
  staff_id uuid := gen_random_uuid();
  boundary_order uuid := gen_random_uuid();
  yesterday_order uuid := gen_random_uuid();
  tomorrow_order uuid := gen_random_uuid();
  today date := (now() at time zone 'Asia/Singapore')::date;
  result jsonb;
begin
  delete from public.order_item_add_ons;
  delete from public.order_items;
  delete from public.orders;

  insert into public.staff (id, username, password_hash, role)
  values (staff_id, 'board_day_staff_' || staff_id, 'not-a-login-hash', 'barista');

  -- Singapore event day at 00:01, which is 16:01 UTC on the previous day.
  insert into public.orders (
    id, event_day, order_number, customer_first_name, status,
    total_amount, created_by, client_request_id, created_at, ready_at, version
  )
  values
    (boundary_order, today, 1, 'Dawn', 'ready', 8, staff_id, boundary_order,
     ((today + interval '1 minute') at time zone 'Asia/Singapore'),
     ((today + interval '2 minutes') at time zone 'Asia/Singapore'), 3),
    (yesterday_order, today - 1, 2, 'Yesterday', 'ready', 8, staff_id, yesterday_order,
     now() - interval '1 day', now() - interval '1 day' + interval '5 minutes', 3),
    (tomorrow_order, today + 1, 3, 'Tomorrow', 'ready', 8, staff_id, tomorrow_order,
     now() + interval '1 day', now() + interval '1 day' + interval '5 minutes', 3);

  perform pg_temp.assert_true(
    ((select created_at from public.orders where id = boundary_order) at time zone 'UTC')::date <> today,
    'boundary fixture was created in the previous UTC calendar day'
  );

  result := (select jsonb_agg(r) from public.ready_orders() r);
  perform pg_temp.assert_true(jsonb_array_length(result) = 1, 'only orders whose event day is today in Singapore are listed');
  perform pg_temp.assert_true((result->0->>'order_number')::integer = 1, 'boundary order returned by its Singapore event day, not its UTC day');
  perform pg_temp.assert_true((result->0->>'event_day')::date = today, 'boundary order keeps its event day');
end $$;

do $$
declare
  staff_id uuid := gen_random_uuid();
  first_order uuid := gen_random_uuid();
  second_order uuid := gen_random_uuid();
  third_order uuid := gen_random_uuid();
  today date := (now() at time zone 'Asia/Singapore')::date;
  result jsonb;
begin
  delete from public.order_item_add_ons;
  delete from public.order_items;
  delete from public.orders;

  insert into public.staff (id, username, password_hash, role)
  values (staff_id, 'board_order_staff_' || staff_id, 'not-a-login-hash', 'barista');

  -- Inserted out of ready-time order, with order numbers, creation times and
  -- ready times that do not line up, so only the ready-time sort is correct.
  insert into public.orders (
    id, event_day, order_number, customer_first_name, status,
    total_amount, created_by, client_request_id, created_at, ready_at, version
  )
  values
    (second_order, today, 302, 'Arjun', 'ready', 8, staff_id, second_order, now() - interval '9 minutes', now() - interval '6 minutes', 3),
    (third_order, today, 303, 'Wei', 'ready', 8, staff_id, third_order, now() - interval '8 minutes', now() - interval '2 minutes', 3),
    (first_order, today, 301, 'Mei', 'ready', 8, staff_id, first_order, now() - interval '10 minutes', now() - interval '4 minutes', 3);

  result := (select jsonb_agg(r) from public.ready_orders() r);
  perform pg_temp.assert_true(jsonb_array_length(result) = 3, 'all ready orders returned');
  perform pg_temp.assert_true((result->0->>'order_number')::integer = 302, 'earliest ready time is listed first');
  perform pg_temp.assert_true((result->1->>'order_number')::integer = 301, 'middle ready time is listed second');
  perform pg_temp.assert_true((result->2->>'order_number')::integer = 303, 'latest ready time is listed last');
end $$;
rollback;
