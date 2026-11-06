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
  admin_id uuid := gen_random_uuid();
  barista_id uuid := gen_random_uuid();
  drink_id uuid := gen_random_uuid();
  option_id uuid := gen_random_uuid();
  result jsonb;
begin
  insert into public.staff(id,username,password_hash,role) values (admin_id,admin_id::text,'not-a-login-hash','admin'), (barista_id,barista_id::text,'not-a-login-hash','barista');
  insert into public.menu_items(id,name,base_price) values(drink_id,'latte',8);
  insert into public.add_ons(id,name,price) values(option_id,'iced',1);
  result := public.counter_edit_menu(admin_id,'drink',drink_id,1,'{"price_cents":900}');
  perform pg_temp.assert_true((result->>'base_price')::numeric = 9 and (result->>'version')::integer = 2, 'base price/version updated');
  perform pg_temp.assert_true((result->>'is_active')::boolean and (result->>'is_available')::boolean, 'price preserves flags');
  perform pg_temp.assert_true(public.counter_edit_menu(admin_id,'drink',drink_id,1,'{"price_cents":900}') = result, 'same request retry succeeds');
  perform pg_temp.expect_error(format('select public.counter_edit_menu(%L,%L,%L,1,%L)',admin_id,'drink',drink_id,'{"price_cents":1000}'),'BB_CONFLICT');
  perform pg_temp.expect_error(format('select public.counter_edit_menu(%L,%L,%L,2,%L)',barista_id,'drink',drink_id,'{"price_cents":1000}'),'BB_FORBIDDEN');
  perform pg_temp.expect_error(format('select public.counter_edit_menu(%L,%L,%L,2,%L)',admin_id,'drink',drink_id,'{"price_cents":1000.1}'),'BB_INVALID');
  perform pg_temp.expect_error(format('select public.counter_edit_menu(%L,%L,%L,2,%L)',admin_id,'drink',drink_id,'{"price_cents":-1}'),'BB_INVALID');
  result := public.counter_edit_menu(admin_id,'option',option_id,1,'{"price_cents":200}');
  perform pg_temp.assert_true((result->>'price')::numeric = 2, 'shared surcharge updated');
  perform pg_temp.assert_true(not has_function_privilege('anon','public.counter_edit_menu(uuid,text,uuid,integer,jsonb)','execute'), 'public cannot change menu');
end $$;
rollback;
