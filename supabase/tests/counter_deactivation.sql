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
  order_id uuid := gen_random_uuid();
  result jsonb;
  receipt jsonb;
  items jsonb;
begin
  insert into public.staff(id,username,password_hash,role) values(admin_id,admin_id::text,'not-a-login-hash','admin'), (barista_id,barista_id::text,'not-a-login-hash','barista');
  insert into public.menu_items(id,name,base_price) values(drink_id,'latte',8);
  items := jsonb_build_array(jsonb_build_object('menu_item_id',drink_id,'quantity',1,'add_on_ids','[]'::jsonb));
  receipt := public.counter_submit_order(barista_id,order_id,'Guest',null,false,items,800);
  perform pg_temp.expect_error(format('select public.counter_edit_menu(%L,%L,%L,1,%L)',barista_id,'drink',drink_id,'{"is_active":false}'),'BB_FORBIDDEN');
  perform pg_temp.expect_error(format('select public.counter_edit_menu(%L,%L,%L,1,%L)',admin_id,'drink',drink_id,'{"is_active":"true"}'),'BB_INVALID');
  result := public.counter_edit_menu(admin_id,'drink',drink_id,1,'{"is_active":false}');
  perform pg_temp.assert_true(not (result->>'is_active')::boolean, 'drink deactivated');
  perform pg_temp.assert_true(public.counter_edit_menu(admin_id,'drink',drink_id,1,'{"is_active":false}') = result, 'deactivation retry safe');
  perform pg_temp.assert_true(public.counter_receipt(order_id) = receipt, 'historic receipt retained');
  perform pg_temp.assert_true((select count(*) = 1 from public.menu_items where id = drink_id), 'row retained');
  perform pg_temp.expect_error(format('select public.counter_submit_order(%L,%L,%L,null,false,%L,800)',barista_id,gen_random_uuid(),'Guest',items),'BB_UNAVAILABLE');
  perform pg_temp.expect_error(format('select public.counter_edit_menu(%L,%L,%L,2,%L)',admin_id,'drink',drink_id,'{"is_available":true}'),'BB_INACTIVE');
  perform pg_temp.assert_true((select status = 'queued' from public.orders where id = order_id), 'existing order remains actionable');
  update public.menu_items set is_available = false where id = drink_id;
  perform pg_temp.expect_error(format('select public.counter_edit_menu(%L,%L,%L,3,%L)',barista_id,'drink',drink_id,'{"is_active":true}'),'BB_FORBIDDEN');
  perform pg_temp.expect_error(format('select public.counter_edit_menu(%L,%L,%L,2,%L)',admin_id,'drink',drink_id,'{"is_active":true}'),'BB_CONFLICT');
  result := public.counter_edit_menu(admin_id,'drink',drink_id,3,'{"is_active":true}');
  perform pg_temp.assert_true((result->>'is_active')::boolean and not (result->>'is_available')::boolean, 'reactivation preserves sold-out state');
  perform pg_temp.assert_true(public.counter_edit_menu(admin_id,'drink',drink_id,3,'{"is_active":true}') = result, 'reactivation retry safe');
  perform pg_temp.assert_true(public.counter_receipt(order_id) = receipt, 'reactivation retains historical receipt');
  result := public.counter_edit_menu(admin_id,'drink',drink_id,4,'{"is_available":true}');
  perform pg_temp.assert_true((result->>'is_active')::boolean and (result->>'is_available')::boolean, 'restocked reactivated drink is orderable');

end $$;
rollback;
