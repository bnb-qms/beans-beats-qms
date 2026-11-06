begin;
create function pg_temp.assert_true(value boolean, message text) returns void language plpgsql as $$ begin if value is distinct from true then raise exception 'Assertion failed: %', message; end if; end $$;
create function pg_temp.expect_error(command text, expected text) returns void language plpgsql as $$ begin begin execute command; exception when others then if sqlerrm = expected then return; end if; raise; end; raise exception 'Expected exception %', expected; end $$;
do $$
declare
  admin_id uuid := gen_random_uuid();
  barista_id uuid := gen_random_uuid();
  inactive_id uuid := gen_random_uuid();
  drink_id uuid := gen_random_uuid();
  order_id uuid := gen_random_uuid();
  item_id uuid := gen_random_uuid();
  result jsonb;
begin
  insert into public.staff(id, username, password_hash, role, is_active) values
    (admin_id, admin_id::text, 'test-only', 'admin', true),
    (barista_id, barista_id::text, 'test-only', 'barista', true),
    (inactive_id, inactive_id::text, 'test-only', 'admin', false);
  insert into public.menu_items(id, name, base_price) values (drink_id, 'latte', 8);
  result := public.report_daily_totals(admin_id, date '2026-11-26');
  perform pg_temp.assert_true((result->>'cups')::bigint = 0 and (result->>'sales_cents')::numeric = 0, 'empty day');
  insert into public.orders(id, event_day, order_number, customer_first_name, total_amount, created_by, client_request_id, created_at)
    values(order_id, date '2026-11-26', 1, 'test', 18, admin_id, gen_random_uuid(), timestamptz '2026-11-25 16:00:00+00');
  insert into public.order_items(id, order_id, menu_item_id, menu_item_name, quantity, unit_price)
    values(item_id, order_id, drink_id, 'latte', 2, 8);
  result := public.report_daily_totals(admin_id, date '2026-11-26');
  perform pg_temp.assert_true((result->>'cups')::bigint = 2 and (result->>'sales_cents')::numeric = 1800, 'cups and option-inclusive order snapshot');
  update public.menu_items set base_price = 12 where id = drink_id;
  perform pg_temp.assert_true(public.report_daily_totals(admin_id, date '2026-11-26') = result, 'menu changes preserve sales');
  update public.orders set status = 'cancelled' where id = order_id;
  result := public.report_daily_totals(admin_id, date '2026-11-26');
  perform pg_temp.assert_true((result->>'cups')::bigint = 0 and (result->>'sales_cents')::numeric = 0, 'cancelled excluded');
  perform pg_temp.expect_error(format('select public.report_daily_totals(%L, %L)', barista_id, date '2026-11-26'), 'BB_FORBIDDEN');
  perform pg_temp.expect_error(format('select public.report_daily_totals(%L, %L)', inactive_id, date '2026-11-26'), 'BB_FORBIDDEN');
  perform pg_temp.expect_error(format('select public.report_daily_totals(%L, null)', admin_id), 'BB_INVALID');
  perform pg_temp.assert_true(not has_function_privilege('anon', 'public.report_daily_totals(uuid,date)', 'execute'), 'anon denied');
  perform pg_temp.assert_true(not has_function_privilege('authenticated', 'public.report_daily_totals(uuid,date)', 'execute'), 'browser role denied');
end $$;
rollback;
