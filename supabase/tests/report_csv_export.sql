begin;
create function pg_temp.assert_true(value boolean, message text) returns void language plpgsql as $$ begin if value is distinct from true then raise exception 'Assertion failed: %', message; end if; end $$;
create function pg_temp.expect_error(command text, expected text) returns void language plpgsql as $$ begin begin execute command; exception when others then if sqlerrm = expected then return; end if; raise; end; raise exception 'Expected exception %', expected; end $$;
do $$
declare
  admin_id uuid := gen_random_uuid();
  barista_id uuid := gen_random_uuid();
  drink_id uuid := gen_random_uuid();
  option_id uuid := gen_random_uuid();
  order_id uuid := gen_random_uuid();
  item_id uuid := gen_random_uuid();
  result jsonb;
begin
  insert into public.staff(id, username, password_hash, role) values
    (admin_id, admin_id::text, 'test-only', 'admin'),
    (barista_id, barista_id::text, 'test-only', 'barista');
  insert into public.menu_items(id, name, base_price) values (drink_id, 'latte', 8);
  insert into public.add_ons(id, name, price) values (option_id, 'Iced', 1);
  result := public.report_csv_export(admin_id, date '2026-11-26');
  perform pg_temp.assert_true(result->'lines' = '[]'::jsonb and result->>'cups' = '0', 'empty day');
  insert into public.orders(id, event_day, order_number, customer_first_name, total_amount, created_by, client_request_id, created_at)
    values(order_id, date '2026-11-25', 1, 'private customer', 18, admin_id, gen_random_uuid(), timestamptz '2026-11-25 16:00:00+00');
  insert into public.order_items(id, order_id, menu_item_id, menu_item_name, quantity, unit_price)
    values(item_id, order_id, drink_id, 'latte', 2, 8);
  insert into public.order_item_add_ons(order_item_id, add_on_id, add_on_name, unit_price)
    values(item_id, option_id, 'Iced', 1);
  result := public.report_csv_export(admin_id, date '2026-11-26');
  perform pg_temp.assert_true(jsonb_array_length(result->'lines') = 1 and result->>'cups' = '2' and result->>'sales_cents' = '1800', 'snapshot totals');
  perform pg_temp.assert_true(result->'lines'->0->>'base_price_cents' = '800' and result->'lines'->0->>'line_total_cents' = '1800', 'line prices');
  perform pg_temp.assert_true(result::text not like '%private customer%', 'no PII');
  perform pg_temp.assert_true((public.report_daily_totals(admin_id, date '2026-11-26')->>'sales_cents') = result->>'sales_cents', 'F13 parity');
  update public.menu_items set base_price = 12 where id = drink_id;
  perform pg_temp.assert_true(public.report_csv_export(admin_id, date '2026-11-26') = result, 'historical snapshots');
  update public.orders set status = 'cancelled' where id = order_id;
  result := public.report_csv_export(admin_id, date '2026-11-26');
  perform pg_temp.assert_true(result->'lines'->0->>'status' = 'cancelled' and result->>'cups' = '0' and result->>'sales_cents' = '0', 'cancelled detail excluded from totals');
  perform pg_temp.expect_error(format('select public.report_csv_export(%L, %L)', barista_id, date '2026-11-26'), 'BB_FORBIDDEN');
  perform pg_temp.expect_error(format('select public.report_csv_export(%L, null)', admin_id), 'BB_INVALID');
  perform pg_temp.assert_true(not has_function_privilege('anon', 'public.report_csv_export(uuid,date)', 'execute'), 'anon denied');
  perform pg_temp.assert_true(not has_function_privilege('authenticated', 'public.report_csv_export(uuid,date)', 'execute'), 'browser role denied');
end $$;
rollback;
