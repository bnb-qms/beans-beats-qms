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
  disabled_id uuid := gen_random_uuid();
  ready_id uuid := gen_random_uuid();
  queued_id uuid := gen_random_uuid();
  cancelled_id uuid := gen_random_uuid();
  ready_token text := repeat('a', 64);
  queued_token text := repeat('b', 64);
  cancelled_token text := repeat('c', 64);
  today date := (now() at time zone 'Asia/Singapore')::date;
  result jsonb;
  ready_list jsonb;
begin
  insert into public.staff (id, username, password_hash, role)
  values (barista_id, 'scan_barista_' || barista_id, 'not-a-login-hash', 'barista');
  insert into public.staff (id, username, password_hash, role, is_active)
  values (disabled_id, 'scan_disabled_' || disabled_id, 'not-a-login-hash', 'barista', false);

  insert into public.orders (id, event_day, order_number, customer_first_name, total_amount,
    created_by, client_request_id, status, tracking_token)
  values
    (ready_id, today, 9101, 'Mei', 8.00, barista_id, gen_random_uuid(), 'ready', ready_token),
    (queued_id, today, 9102, 'Ravi', 6.00, barista_id, gen_random_uuid(), 'queued', queued_token),
    (cancelled_id, today, 9103, 'Siti', 3.00, barista_id, gen_random_uuid(), 'cancelled', cancelled_token);

  ready_list := public.scan_ready_orders(barista_id);
  perform pg_temp.assert_true(
    ready_list @> jsonb_build_array(jsonb_build_object(
      'order_number', 9101, 'customer_first_name', 'Mei',
      'code_hash', encode(extensions.digest(ready_token, 'sha256'), 'hex'))),
    'ready order listed with hashed code');
  perform pg_temp.assert_true(
    not ready_list @> '[{"order_number": 9102}]'::jsonb, 'queued order not listed');
  perform pg_temp.assert_true(position(ready_token in ready_list::text) = 0, 'raw code never listed');

  result := public.scan_collect(barista_id, ready_token);
  perform pg_temp.assert_true(result->>'result' = 'collected' and (result->>'order_number')::int = 9101,
    'ready order collected');
  perform pg_temp.assert_true(
    (select status = 'collected' and collected_at is not null and version = 2
     from public.orders where id = ready_id), 'status, time and version updated');

  result := public.scan_collect(barista_id, ready_token);
  perform pg_temp.assert_true(result->>'result' = 'already_collected', 'second scan is already collected');
  perform pg_temp.assert_true((select version = 2 from public.orders where id = ready_id), 'second scan changes nothing');

  result := public.scan_collect(barista_id, queued_token);
  perform pg_temp.assert_true(result->>'result' = 'not_ready', 'queued order not ready');
  perform pg_temp.assert_true((select status = 'queued' from public.orders where id = queued_id), 'queued order unchanged');

  result := public.scan_collect(barista_id, cancelled_token);
  perform pg_temp.assert_true(result->>'result' = 'cancelled', 'cancelled order reported');

  perform pg_temp.expect_error(format('select public.scan_collect(%L, %L)', barista_id, repeat('d', 64)), 'BB_NOT_FOUND');
  perform pg_temp.expect_error(format('select public.scan_collect(%L, %L)', barista_id, 'not-a-code'), 'BB_INVALID');
  perform pg_temp.expect_error(format('select public.scan_collect(%L, %L)', disabled_id, queued_token), 'BB_FORBIDDEN');
  perform pg_temp.expect_error(format('select public.scan_ready_orders(%L)', disabled_id), 'BB_FORBIDDEN');
end $$;

select pg_temp.assert_true(not has_function_privilege('anon', 'public.scan_collect(uuid, text)', 'execute'), 'guests cannot collect');
select pg_temp.assert_true(not has_function_privilege('authenticated', 'public.scan_collect(uuid, text)', 'execute'), 'Auth JWT cannot collect');
select pg_temp.assert_true(not has_function_privilege('anon', 'public.scan_ready_orders(uuid)', 'execute'), 'guests cannot list');
rollback;
