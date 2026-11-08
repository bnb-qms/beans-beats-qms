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
  counter_id uuid := gen_random_uuid();
  drink_id uuid := gen_random_uuid();
  option_id uuid := gen_random_uuid();
  order_uuid uuid := gen_random_uuid();
  items jsonb;
  receipt jsonb;
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
  result := public.counter_edit_menu(admin_id,'drink',drink_id,2,'{"price_cents":1000}');
  perform pg_temp.assert_true((result->>'base_price')::numeric = 10 and (result->>'version')::integer = 3, 'second price change advances the version');
  perform pg_temp.expect_error(format('select public.counter_edit_menu(%L,%L,%L,1,%L)',admin_id,'drink',drink_id,'{"price_cents":900}'),'BB_CONFLICT');
  perform pg_temp.assert_true(public.counter_edit_menu(admin_id,'drink',drink_id,2,'{"price_cents":1000}') = result, 'late identical write returns the current row');
  insert into public.staff(id,username,password_hash,role) values(counter_id,counter_id::text,'not-a-login-hash','counter');
  perform pg_temp.expect_error(format('select public.counter_edit_menu(%L,%L,%L,3,%L)',counter_id,'drink',drink_id,'{"price_cents":1100}'),'BB_FORBIDDEN');
  items := jsonb_build_array(jsonb_build_object('menu_item_id',drink_id,'quantity',2,'add_on_ids','[]'::jsonb));
  receipt := public.counter_submit_order(barista_id,order_uuid,'Guest',null,false,items,2000);
  result := public.counter_edit_menu(admin_id,'drink',drink_id,3,'{"price_cents":1100}');
  perform pg_temp.assert_true((result->>'base_price')::numeric = 11 and (result->>'version')::integer = 4, 'price change after the order');
  perform pg_temp.assert_true((select i.unit_price from public.order_items i where i.order_id = order_uuid) = 10, 'historic order price retained');
  perform pg_temp.assert_true(public.counter_receipt(order_uuid) = receipt, 'receipt unchanged by the price change');
end $$;
rollback;
