-- Run after migrations against a disposable database. Fixtures never persist.
begin;
create function pg_temp.assert_true(value boolean, message text) returns void
language plpgsql as $$ begin if value is distinct from true then raise exception 'Assertion failed: %', message; end if; end $$;

do $$
declare
  admin_id uuid := gen_random_uuid();
  old_order uuid := gen_random_uuid();
  today_order uuid := gen_random_uuid();
  late_order uuid := gen_random_uuid();
  today date := (now() at time zone 'Asia/Singapore')::date;
  old_day date := today - 3;
  -- An offline order from old_day that only reached the server later is dated the later day.
  late_day date := today - 1;
  totals_before jsonb;
  erased integer;
  failed boolean := false;
begin
  insert into public.staff (id, username, password_hash, role)
  values (admin_id, 'erase_admin_' || admin_id, 'not-a-login-hash', 'admin');
  insert into public.orders (id, event_day, order_number, customer_first_name, customer_mobile,
    mobile_consent_at, total_amount, created_by, client_request_id, created_at)
  values
    (old_order, old_day, 9001, 'Mei', '91234567', now(), 9.00, admin_id, gen_random_uuid(),
      (old_day + time '10:00') at time zone 'Asia/Singapore'),
    (late_order, late_day, 9003, 'Siti', '98765432', now(), 8.00, admin_id, gen_random_uuid(),
      (late_day + time '00:05') at time zone 'Asia/Singapore'),
    (today_order, today, 9002, 'Ravi', '81234567', now(), 6.00, admin_id, gen_random_uuid(), now());

  totals_before := public.report_daily_totals(admin_id, old_day);
  -- Same call as the README: erase up to yesterday.
  erased := public.erase_guest_details(today - 1);

  perform pg_temp.assert_true(erased >= 2, 'old and late-synced orders erased');
  perform pg_temp.assert_true(
    (select customer_first_name = 'Guest' and customer_mobile is null and mobile_consent_at is null
     from public.orders where id = old_order),
    'old name, mobile and consent removed');
  perform pg_temp.assert_true(
    (select customer_first_name = 'Guest' and customer_mobile is null and mobile_consent_at is null
     from public.orders where id = late_order),
    'late-synced order erased');
  perform pg_temp.assert_true(
    (select total_amount = 9.00 from public.orders where id = old_order), 'old total kept');
  perform pg_temp.assert_true(
    public.report_daily_totals(admin_id, old_day) = totals_before, 'daily totals unchanged');
  perform pg_temp.assert_true(
    (select customer_first_name = 'Ravi' and customer_mobile = '81234567'
     from public.orders where id = today_order),
    'today''s order untouched');
  perform pg_temp.assert_true(public.erase_guest_details(today - 1) = 0, 'second run changes nothing');

  begin
    perform public.erase_guest_details(today);
  exception when others then
    failed := sqlerrm = 'BB_INVALID';
  end;
  perform pg_temp.assert_true(failed, 'erasing the current day is refused');
end $$;

select pg_temp.assert_true(not has_function_privilege('anon', 'public.erase_guest_details(date)', 'execute'), 'guests cannot erase');
select pg_temp.assert_true(not has_function_privilege('authenticated', 'public.erase_guest_details(date)', 'execute'), 'Auth JWT cannot erase');
rollback;
