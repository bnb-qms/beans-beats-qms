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
  staff_id uuid := gen_random_uuid();
  disabled_id uuid := gen_random_uuid();
  latte uuid := gen_random_uuid();
  espresso uuid := gen_random_uuid();
  iced uuid := gen_random_uuid();
  oat uuid := gen_random_uuid();
  request_id uuid := gen_random_uuid();
  items jsonb;
  first_receipt jsonb;
  second_receipt jsonb;
  command text;
begin
  insert into public.staff (id, username, password_hash, role) values (staff_id, 'counter_test_' || staff_id, 'not-a-login-hash', 'barista');
  insert into public.staff (id, username, password_hash, role, is_active) values (disabled_id, 'disabled_test_' || disabled_id, 'not-a-login-hash', 'admin', false);
  insert into public.menu_items (id, name, base_price) values (latte, 'latte', 8), (espresso, 'espresso', 3);
  insert into public.add_ons (id, name, price) values (iced, 'iced', 1), (oat, 'oat milk', 1);
  items := jsonb_build_array(
    jsonb_build_object('menu_item_id', latte, 'quantity', 2, 'add_on_ids', jsonb_build_array(iced, oat)),
    jsonb_build_object('menu_item_id', espresso, 'quantity', 1, 'add_on_ids', '[]'::jsonb));
  first_receipt := public.counter_submit_order(staff_id, request_id, ' Bella ', null, false, items, 2300);
  second_receipt := public.counter_submit_order(staff_id, request_id, 'Bella', null, false, items, 2300);
  perform pg_temp.assert_true(first_receipt = second_receipt, 'retries return the original receipt');
  perform pg_temp.assert_true((select count(*) = 1 from public.orders where client_request_id = request_id), 'one order per request');
  perform pg_temp.assert_true((select status = 'queued' and total_amount = 23 and customer_first_name = 'Bella' from public.orders where id = request_id), 'queued, priced, trimmed');
  perform pg_temp.assert_true((first_receipt->>'event_day')::date = (now() at time zone 'Asia/Singapore')::date, 'Singapore business date');
  perform pg_temp.assert_true(jsonb_array_length(first_receipt->'items') = 2, 'receipt line snapshots');
  perform pg_temp.expect_error(format('select public.counter_submit_order(%L,%L,%L,null,false,%L,2300)', staff_id, request_id, 'Different', items), 'BB_INVALID');
  command := format('select public.counter_submit_order(%L,%L,%L,null,false,%L,2300)', staff_id, gen_random_uuid(), 'Guest', items);
  update public.menu_items set base_price = 9 where id = latte;
  perform pg_temp.expect_error(command, 'BB_PRICE_CHANGED');
  perform pg_temp.assert_true(public.counter_receipt(request_id) = first_receipt, 'menu changes preserve historic receipt');
  perform pg_temp.assert_true((select version = 2 from public.menu_items where id = latte), 'menu edits advance version');
  update public.menu_items set is_active = false where id = latte;
  perform pg_temp.expect_error(command, 'BB_UNAVAILABLE');
  update public.menu_items set is_active = true, is_available = false where id = latte;
  perform pg_temp.expect_error(command, 'BB_UNAVAILABLE');
  update public.menu_items set is_available = true, base_price = 8 where id = latte;
  update public.add_ons set is_available = false where id = oat;
  perform pg_temp.expect_error(command, 'BB_UNAVAILABLE');
  update public.add_ons set is_available = true where id = oat;
  perform pg_temp.expect_error(format('select public.counter_submit_order(%L,%L,%L,null,false,%L,2300)', disabled_id, gen_random_uuid(), 'Guest', items), 'BB_FORBIDDEN');
  perform pg_temp.expect_error(format('select public.counter_submit_order(null,%L,%L,null,false,%L,2300)', gen_random_uuid(), 'Guest', items), 'BB_FORBIDDEN');
  perform pg_temp.expect_error(format('select public.counter_submit_order(%L,%L,%L,null,false,%L,2300)', staff_id, gen_random_uuid(), repeat('a',21), items), 'BB_INVALID');
  perform pg_temp.expect_error(format('select public.counter_submit_order(%L,%L,%L,%L,false,%L,2300)', staff_id, gen_random_uuid(), 'Guest', '91234567', items), 'BB_INVALID');
  perform pg_temp.expect_error(format('select public.counter_submit_order(%L,%L,%L,null,false,%L,2300)', staff_id, gen_random_uuid(), 'Guest', jsonb_set(items, '{0,quantity}', '0')), 'BB_INVALID');
  perform pg_temp.expect_error(format('select public.counter_submit_order(%L,%L,%L,null,false,%L,500)', staff_id, gen_random_uuid(), 'Guest', jsonb_build_array(jsonb_build_object('menu_item_id', espresso, 'quantity', 1, 'add_on_ids', jsonb_build_array(oat)))), 'BB_INVALID');
  perform pg_temp.assert_true(not has_function_privilege('anon', 'public.counter_submit_order(uuid,uuid,text,text,boolean,jsonb,integer)', 'execute'), 'public cannot submit');
  perform pg_temp.assert_true(not has_function_privilege('authenticated', 'public.counter_receipt(uuid)', 'execute'), 'browser cannot fetch staff receipts');
  perform pg_temp.assert_true((select count(*) = 1 from public.orders where created_by = staff_id), 'failed requests roll back');
  for i in 1..10 loop perform pg_temp.assert_true(public.counter_login_attempt(staff_id::text), 'initial login attempts allowed'); end loop;
  perform pg_temp.assert_true(not public.counter_login_attempt(staff_id::text), 'login attempts throttled');
end $$;
rollback;
