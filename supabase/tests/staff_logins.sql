-- Disposable migrated database only; no public demo passwords are changed.
begin;
create function pg_temp.assert_true(value boolean, message text) returns void
language plpgsql as $$ begin if value is distinct from true then raise exception 'Assertion failed: %', message; end if; end $$;

do $$
declare
  staff_id uuid := gen_random_uuid();
  staff_name text := 'login_test_' || staff_id;
  attempt_key text := encode(extensions.digest(staff_id::text, 'sha256'), 'hex');
  assigned_role text;
begin
  insert into public.staff (id, username, password_hash, role)
  values (staff_id, staff_name, extensions.crypt('TestOnly!17', extensions.gen_salt('bf')), 'barista');
  foreach assigned_role in array array['barista', 'admin', 'counter'] loop
    update public.staff set role = assigned_role where id = staff_id;
    perform pg_temp.assert_true(
      (select id = staff_id and role = assigned_role from public.verify_staff_credentials(staff_name, 'TestOnly!17')),
      'valid credentials return trusted identity and role');
  end loop;
  perform pg_temp.assert_true(not exists (select from public.verify_staff_credentials(staff_name, 'wrong')), 'wrong password denied');
  perform pg_temp.assert_true(not exists (select from public.verify_staff_credentials('missing_' || staff_name, 'TestOnly!17')), 'missing account denied');
  update public.staff set is_active = false where id = staff_id;
  perform pg_temp.assert_true(not exists (select from public.verify_staff_credentials(staff_name, 'TestOnly!17')), 'disabled account denied');

  for i in 1..10 loop
    perform pg_temp.assert_true(public.counter_login_attempt(attempt_key), 'initial attempts allowed');
  end loop;
  perform pg_temp.assert_true(not public.counter_login_attempt(attempt_key), 'excess attempts denied');
  update public.counter_login_limits set window_start = now() - interval '16 minutes' where key = attempt_key;
  perform pg_temp.assert_true(public.counter_login_attempt(attempt_key), 'expired limit resets');
end $$;

select pg_temp.assert_true(not has_function_privilege('anon', 'public.verify_staff_credentials(text,text)', 'execute'), 'guests cannot verify passwords');
select pg_temp.assert_true(not has_function_privilege('authenticated', 'public.verify_staff_credentials(text,text)', 'execute'), 'Auth JWT cannot verify passwords');
select pg_temp.assert_true(has_function_privilege('service_role', 'public.verify_staff_credentials(text,text)', 'execute'), 'server may verify passwords');
select pg_temp.assert_true(not has_function_privilege('anon', 'public.counter_login_attempt(text)', 'execute'), 'guests cannot alter login limits');
select pg_temp.assert_true(not has_table_privilege('anon', 'public.staff', 'select'), 'guests cannot read staff hashes');
rollback;
