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
  order_id uuid := gen_random_uuid();
  today date := (now() at time zone 'Asia/Singapore')::date;
  result jsonb;
begin
  insert into public.staff (id, username, password_hash, role)
  values (barista_id, 'status_barista_' || barista_id, 'not-a-login-hash', 'barista');
  insert into public.staff (id, username, password_hash, role, is_active)
  values (disabled_id, 'status_disabled_' || disabled_id, 'not-a-login-hash', 'barista', false);

  insert into public.orders (
    id, event_day, order_number, customer_first_name,
    status, total_amount, created_by, client_request_id, version
  )
  values (order_id, today, 201, 'Mei', 'queued', 8, barista_id, order_id, 1);

  -- Reject skipped stages from queued
  perform pg_temp.expect_error(
    format('select public.queue_update_status(%L, %L, 1, %L)', barista_id, order_id, 'ready'),
    'BB_INVALID_TRANSITION'
  );
  perform pg_temp.expect_error(
    format('select public.queue_update_status(%L, %L, 1, %L)', barista_id, order_id, 'collected'),
    'BB_INVALID_TRANSITION'
  );

  -- Advance queued -> preparing
  result := public.queue_update_status(barista_id, order_id, 1, 'preparing');
  perform pg_temp.assert_true(result->>'status' = 'preparing', 'status updated to preparing');
  perform pg_temp.assert_true((result->>'version')::integer = 2, 'version incremented to 2');

  -- Reject stale version
  perform pg_temp.expect_error(
    format('select public.queue_update_status(%L, %L, 1, %L)', barista_id, order_id, 'ready'),
    'BB_CONFLICT'
  );

  -- Reject backward or skipped transition from preparing
  perform pg_temp.expect_error(
    format('select public.queue_update_status(%L, %L, 2, %L)', barista_id, order_id, 'queued'),
    'BB_INVALID');
  perform pg_temp.expect_error(
    format('select public.queue_update_status(%L, %L, 2, %L)', barista_id, order_id, 'collected'),
    'BB_INVALID_TRANSITION'
  );

  -- Advance preparing -> ready
  result := public.queue_update_status(barista_id, order_id, 2, 'ready');
  perform pg_temp.assert_true(result->>'status' = 'ready', 'status updated to ready');
  perform pg_temp.assert_true((result->>'version')::integer = 3, 'version incremented to 3');
  perform pg_temp.assert_true(result->>'ready_at' is not null, 'ready_at timestamp set');

  -- Reject backward transition from ready
  perform pg_temp.expect_error(
    format('select public.queue_update_status(%L, %L, 3, %L)', barista_id, order_id, 'preparing'),
    'BB_INVALID_TRANSITION'
  );

  -- Advance ready -> collected
  result := public.queue_update_status(barista_id, order_id, 3, 'collected');
  perform pg_temp.assert_true(result->>'status' = 'collected', 'status updated to collected');
  perform pg_temp.assert_true((result->>'version')::integer = 4, 'version incremented to 4');
  perform pg_temp.assert_true(result->>'collected_at' is not null, 'collected_at timestamp set');

  -- Reject any further transition after collected
  perform pg_temp.expect_error(
    format('select public.queue_update_status(%L, %L, 4, %L)', barista_id, order_id, 'ready'),
    'BB_INVALID_TRANSITION'
  );

  -- Reject disabled or missing staff
  perform pg_temp.expect_error(
    format('select public.queue_update_status(%L, %L, 4, %L)', disabled_id, order_id, 'collected'),
    'BB_FORBIDDEN'
  );
  perform pg_temp.expect_error(
    format('select public.queue_update_status(null, %L, 4, %L)', order_id, 'collected'),
    'BB_FORBIDDEN'
  );

  perform pg_temp.assert_true(
    not has_function_privilege('anon', 'public.queue_update_status(uuid,uuid,integer,text)', 'execute'),
    'anon cannot call queue_update_status'
  );
  perform pg_temp.assert_true(
    not has_function_privilege('authenticated', 'public.queue_update_status(uuid,uuid,integer,text)', 'execute'),
    'authenticated cannot call queue_update_status'
  );
end $$;
rollback;
