begin;
create function pg_temp.assert_true(value boolean, message text) returns void
language plpgsql as $$ begin if value is distinct from true then raise exception 'Assertion failed: %', message; end if; end $$;
create function pg_temp.expect_error(command text, expected text) returns void
language plpgsql as $$ begin
  begin execute command;
  exception when others then if sqlerrm = expected then return; end if; raise; end;
  raise exception 'Expected exception %', expected;
end $$;
do $$
declare
  staff_id uuid := gen_random_uuid();
  counter_id uuid := gen_random_uuid();
  drink_id uuid := gen_random_uuid();
  option_id uuid := gen_random_uuid();
  result jsonb;
begin
  insert into public.staff(id,username,password_hash,role) values(staff_id,staff_id::text,'not-a-login-hash','barista');
  insert into public.menu_items(id,name,base_price) values(drink_id,'latte',8);
  insert into public.add_ons(id,name,price) values(option_id,'oat milk',1);
  result := public.counter_edit_menu(staff_id,'drink',drink_id,1,'{"is_available":false}');
  perform pg_temp.assert_true(not (result->>'is_available')::boolean and (result->>'base_price')::numeric = 8, 'barista marks sold out without changing price');
  perform pg_temp.assert_true(public.counter_edit_menu(staff_id,'drink',drink_id,1,'{"is_available":false}') = result, 'retry does not toggle back');
  perform pg_temp.expect_error(format('select public.counter_edit_menu(%L,%L,%L,1,%L)',staff_id,'drink',drink_id,'{"is_available":true}'),'BB_CONFLICT');
  result := public.counter_edit_menu(staff_id,'drink',drink_id,2,'{"is_available":true}');
  perform pg_temp.assert_true((result->>'is_available')::boolean, 'restocking restores availability');
  result := public.counter_edit_menu(staff_id,'option',option_id,1,'{"is_available":false}');
  perform pg_temp.assert_true(not (result->>'is_available')::boolean and (result->>'price')::numeric = 1, 'shared option unavailable with price unchanged');
  update public.menu_items set is_active = false where id = drink_id;
  perform pg_temp.expect_error(format('select public.counter_edit_menu(%L,%L,%L,4,%L)',staff_id,'drink',drink_id,'{"is_available":true}'),'BB_INACTIVE');
  perform pg_temp.expect_error(format('select public.counter_edit_menu(%L,%L,%L,4,%L)',staff_id,'drink',drink_id,'{"price_cents":900}'),'BB_FORBIDDEN');
  perform pg_temp.expect_error(format('select public.counter_edit_menu(%L,%L,%L,2,%L)',staff_id,'option',option_id,'{"is_available":"false"}'),'BB_INVALID');
  result := public.counter_edit_menu(staff_id,'option',option_id,2,'{"is_available":true}');
  perform pg_temp.assert_true((result->>'is_available')::boolean and (result->>'version')::integer = 3, 'option restocked at the current version');
  perform pg_temp.expect_error(format('select public.counter_edit_menu(%L,%L,%L,1,%L)',staff_id,'option',option_id,'{"is_available":false}'),'BB_CONFLICT');
  insert into public.staff(id,username,password_hash,role) values(counter_id,counter_id::text,'not-a-login-hash','counter');
  perform pg_temp.expect_error(format('select public.counter_edit_menu(%L,%L,%L,3,%L)',counter_id,'option',option_id,'{"is_available":false}'),'BB_FORBIDDEN');
  perform pg_temp.assert_true(not has_function_privilege('anon','public.counter_edit_menu(uuid,text,uuid,integer,jsonb)','execute'), 'anon cannot change availability');
end $$;
rollback;
