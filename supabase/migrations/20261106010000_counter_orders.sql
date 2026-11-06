-- Server-only boundary for F1; custom staff sessions use staff.id, not auth.uid().
alter table public.menu_items add column version integer not null default 1;
alter table public.add_ons add column version integer not null default 1;
alter table public.orders add column mobile_consent_at timestamptz;
alter table public.orders add column request_payload jsonb;

create function public.counter_menu_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.version := old.version + 1;
  return new;
end;
$$;
create trigger counter_menu_version before update on public.menu_items
for each row execute function public.counter_menu_version();
create trigger counter_add_on_version before update on public.add_ons
for each row execute function public.counter_menu_version();

create table public.counter_login_limits (
  key text primary key,
  window_start timestamptz not null,
  attempts integer not null
);
alter table public.counter_login_limits enable row level security;
revoke all on public.counter_login_limits from public, anon, authenticated;
create function public.counter_login_attempt(p_key text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  delete from public.counter_login_limits where window_start < now() - interval '15 minutes';
  insert into public.counter_login_limits values (p_key, now(), 1)
  on conflict (key) do update set attempts = public.counter_login_limits.attempts + 1
  returning attempts into v_count;
  return v_count <= 10;
end;
$$;
revoke all on function public.counter_login_attempt(text) from public, anon, authenticated;
grant execute on function public.counter_login_attempt(text) to service_role;

create function public.counter_receipt(p_order_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', o.id, 'order_number', o.order_number, 'event_day', o.event_day,
    'customer_first_name', o.customer_first_name, 'total_amount', o.total_amount,
    'items', (select jsonb_agg(jsonb_build_object(
      'menu_item_name', i.menu_item_name, 'quantity', i.quantity, 'unit_price', i.unit_price,
      'order_item_add_ons', coalesce((select jsonb_agg(jsonb_build_object(
        'add_on_name', a.add_on_name, 'unit_price', a.unit_price
      ) order by a.add_on_name) from public.order_item_add_ons a where a.order_item_id = i.id), '[]'::jsonb)
    ) order by i.id) from public.order_items i where i.order_id = o.id)
  ) from public.orders o where o.id = p_order_id
$$;
revoke all on function public.counter_receipt(uuid) from public, anon, authenticated;
grant execute on function public.counter_receipt(uuid) to service_role;

create function public.counter_submit_order(
  p_staff_id uuid, p_request_id uuid, p_first_name text, p_mobile text,
  p_consent boolean, p_items jsonb, p_total_cents integer
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_existing public.orders;
  v_payload jsonb;
  v_day date := (now() at time zone 'Asia/Singapore')::date;
  v_number integer;
  v_item jsonb;
  v_drink public.menu_items;
  v_option public.add_ons;
  v_option_id uuid;
  v_line_id uuid;
  v_quantity integer;
  v_total numeric(10,2) := 0;
begin
  if not exists (select 1 from public.staff where id = p_staff_id and is_active and role in ('barista', 'counter', 'admin')) then
    raise exception 'BB_FORBIDDEN';
  end if;
  if p_request_id is null or nullif(trim(p_first_name), '') is null or length(trim(p_first_name)) > 20
    or (p_mobile is not null and (p_mobile !~ '^[89][0-9]{7}$' or p_consent is distinct from true))
    or p_total_cents is null or p_total_cents < 0
    or jsonb_typeof(p_items) is distinct from 'array' then raise exception 'BB_INVALID'; end if;
  if jsonb_array_length(p_items) not between 1 and 100 then raise exception 'BB_INVALID'; end if;
  v_payload := jsonb_build_object('items', p_items, 'total', p_total_cents);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text, 0));
  select * into v_existing from public.orders where client_request_id = p_request_id;
  if found then
    if v_existing.created_by <> p_staff_id or v_existing.customer_first_name <> trim(p_first_name) or v_existing.customer_mobile is distinct from p_mobile or v_existing.request_payload is distinct from v_payload then
      raise exception 'BB_INVALID';
    end if;
    return public.counter_receipt(v_existing.id);
  end if;

  -- Keep the quoted menu stable until price snapshots and the order commit together.
  lock table public.menu_items, public.add_ons in share mode;
  insert into public.daily_order_counters (event_day, last_number) values (v_day, 1)
  on conflict (event_day) do update set last_number = public.daily_order_counters.last_number + 1
  returning last_number into v_number;
  insert into public.orders (id, event_day, order_number, customer_first_name, customer_mobile,
    total_amount, created_by, client_request_id, mobile_consent_at, request_payload)
  values (p_request_id, v_day, v_number, trim(p_first_name), p_mobile, 0, p_staff_id, p_request_id,
    case when p_mobile is not null and p_consent then now() end, v_payload);
  for v_item in select value from jsonb_array_elements(p_items) loop
    if (v_item->>'quantity') is null or (v_item->>'quantity') !~ '^[0-9]+$' then raise exception 'BB_INVALID'; end if;
    v_quantity := (v_item->>'quantity')::integer;
    if v_quantity not between 1 and 100 then raise exception 'BB_INVALID'; end if;
    select * into v_drink from public.menu_items where id = (v_item->>'menu_item_id')::uuid and is_active and is_available;
    if not found then raise exception 'BB_UNAVAILABLE'; end if;
    if jsonb_typeof(v_item->'add_on_ids') is distinct from 'array' then raise exception 'BB_INVALID'; end if;
    if jsonb_array_length(v_item->'add_on_ids') > 2 or
      (select count(*) <> count(distinct value) from jsonb_array_elements_text(v_item->'add_on_ids')) then raise exception 'BB_INVALID'; end if;
    insert into public.order_items (order_id, menu_item_id, menu_item_name, quantity, unit_price)
    values (p_request_id, v_drink.id, v_drink.name, v_quantity, v_drink.base_price)
    returning id into v_line_id;
    v_total := v_total + v_quantity * v_drink.base_price;
    for v_option_id in select value::uuid from jsonb_array_elements_text(v_item->'add_on_ids') loop
      select * into v_option from public.add_ons where id = v_option_id and is_available;
      if not found then raise exception 'BB_UNAVAILABLE'; end if;
      if v_option.name not in ('iced', 'oat milk') or
        (v_option.name = 'oat milk' and lower(v_drink.name) not in ('latte', 'flat white')) then raise exception 'BB_INVALID'; end if;
      insert into public.order_item_add_ons (order_item_id, add_on_id, add_on_name, unit_price)
      values (v_line_id, v_option.id, v_option.name, v_option.price);
      v_total := v_total + v_quantity * v_option.price;
    end loop;
  end loop;
  if v_total * 100 <> p_total_cents then raise exception 'BB_PRICE_CHANGED'; end if;
  update public.orders set total_amount = v_total where id = p_request_id;
  return public.counter_receipt(p_request_id);
end;
$$;
revoke all on function public.counter_submit_order(uuid, uuid, text, text, boolean, jsonb, integer) from public, anon, authenticated;
grant execute on function public.counter_submit_order(uuid, uuid, text, text, boolean, jsonb, integer) to service_role;
