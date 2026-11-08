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
  collected_id uuid := gen_random_uuid();
  today date := (now() at time zone 'Asia/Singapore')::date;
  result jsonb;
begin
  insert into public.staff (id, username, password_hash, role)
  values (barista_id, 'cancel_barista_' || barista_id, 'not-a-login-hash', 'barista');
  insert into public.staff (id, username, password_hash, role, is_active)
  values (disabled_id, 'cancel_disabled_' || disabled_id, 'not-a-login-hash', 'barista', false);
  insert into public.orders (id, event_day, order_number, customer_first_name, status, total_amount,
    created_by, client_request_id, version)
  values
    (ready_id, today, 9201, 'Mei', 'ready', 8, barista_id, ready_id, 3),
    (collected_id, today, 9202, 'Ravi', 'collected', 6, barista_id, collected_id, 4);

  perform pg_temp.expect_error(format('select public.queue_cancel_order(%L, %L, 2)', barista_id, ready_id), 'BB_CONFLICT');
  perform pg_temp.expect_error(format('select public.queue_cancel_order(%L, %L, 3)', disabled_id, ready_id), 'BB_FORBIDDEN');
  perform pg_temp.expect_error(format('select public.queue_cancel_order(%L, %L, 4)', barista_id, collected_id), 'BB_INVALID_TRANSITION');
  perform pg_temp.expect_error(format('select public.queue_cancel_order(%L, %L, 1)', barista_id, gen_random_uuid()), 'BB_NOT_FOUND');

  result := public.queue_cancel_order(barista_id, ready_id, 3);
  perform pg_temp.assert_true(result->>'status' = 'cancelled' and (result->>'version')::int = 4, 'ready order cancelled');
  perform pg_temp.assert_true(public.queue_cancel_order(barista_id, ready_id, 3) = result, 'retry returns the cancelled order');
  perform pg_temp.assert_true(
    not exists (select 1 from public.ready_orders() r where r.order_number = 9201), 'cancelled order leaves the board');
  perform pg_temp.assert_true(
    not exists (select 1 from jsonb_array_elements(public.queue_orders(barista_id)) q where (q->>'order_number')::int = 9201),
    'cancelled order leaves the queue');
  perform pg_temp.expect_error(format('select public.queue_update_status(%L, %L, 4, %L)', barista_id, ready_id, 'collected'), 'BB_INVALID_TRANSITION');
end $$;

select pg_temp.assert_true(not has_function_privilege('anon', 'public.queue_cancel_order(uuid,uuid,integer)', 'execute'), 'guests cannot cancel');
select pg_temp.assert_true(not has_function_privilege('authenticated', 'public.queue_cancel_order(uuid,uuid,integer)', 'execute'), 'Auth JWT cannot cancel');
rollback;
