-- Staff authenticate with Supabase Auth. Credentials are never stored in public tables.
create table public.staff (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  role text not null check (role in ('counter', 'barista', 'admin')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  base_price numeric(10,2) not null check (base_price >= 0),
  is_available boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.add_ons (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  price numeric(10,2) not null check (price >= 0),
  is_available boolean not null default true
);

create table public.daily_order_counters (
  event_day date primary key,
  last_number integer not null check (last_number > 0)
);

create table public.orders (
  id uuid primary key,
  event_day date not null,
  order_number integer not null check (order_number > 0),
  customer_first_name text not null check (length(trim(customer_first_name)) > 0),
  customer_mobile text,
  status text not null default 'queued' check (status in ('queued', 'preparing', 'ready', 'collected', 'cancelled')),
  total_amount numeric(10,2) not null check (total_amount >= 0),
  created_by uuid not null references public.staff(id),
  client_request_id uuid not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ready_at timestamptz,
  collected_at timestamptz,
  version integer not null default 1 check (version > 0),
  unique (event_day, order_number)
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  menu_item_id uuid not null references public.menu_items(id),
  menu_item_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(10,2) not null check (unit_price >= 0)
);

create table public.order_item_add_ons (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items(id),
  add_on_id uuid not null references public.add_ons(id),
  add_on_name text not null,
  unit_price numeric(10,2) not null check (unit_price >= 0),
  unique (order_item_id, add_on_id)
);

create index orders_queue_idx on public.orders (event_day, created_at) where status in ('queued', 'preparing', 'ready');
create index order_items_order_id_idx on public.order_items (order_id);
create index order_item_add_ons_order_item_id_idx on public.order_item_add_ons (order_item_id);

alter table public.staff enable row level security;
alter table public.menu_items enable row level security;
alter table public.add_ons enable row level security;
alter table public.daily_order_counters enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_item_add_ons enable row level security;

revoke all on public.staff, public.menu_items, public.add_ons,
  public.daily_order_counters, public.orders, public.order_items,
  public.order_item_add_ons from anon, authenticated;

create function public.current_staff_role() returns text
language sql stable security definer set search_path = ''
as $$
  select role from public.staff
  where id = (select auth.uid()) and is_active
$$;
revoke all on function public.current_staff_role() from public, anon;
grant execute on function public.current_staff_role() to authenticated;

grant select on public.menu_items, public.add_ons to anon, authenticated;
create policy "Read available menu items" on public.menu_items for select to anon, authenticated
  using (is_available or (select public.current_staff_role()) is not null);
create policy "Read available add ons" on public.add_ons for select to anon, authenticated
  using (is_available or (select public.current_staff_role()) is not null);

grant select, update, insert on public.menu_items, public.add_ons to authenticated;
create policy "Admin inserts menu items" on public.menu_items for insert to authenticated
  with check ((select public.current_staff_role()) = 'admin');
create policy "Admin updates menu items" on public.menu_items for update to authenticated
  using ((select public.current_staff_role()) = 'admin')
  with check ((select public.current_staff_role()) = 'admin');
create policy "Admin inserts add ons" on public.add_ons for insert to authenticated
  with check ((select public.current_staff_role()) = 'admin');
create policy "Admin updates add ons" on public.add_ons for update to authenticated
  using ((select public.current_staff_role()) = 'admin')
  with check ((select public.current_staff_role()) = 'admin');

grant select on public.orders, public.order_items, public.order_item_add_ons to authenticated;
create policy "Staff read orders" on public.orders for select to authenticated
  using ((select public.current_staff_role()) is not null);
create policy "Staff read order items" on public.order_items for select to authenticated
  using ((select public.current_staff_role()) is not null);
create policy "Staff read item add ons" on public.order_item_add_ons for select to authenticated
  using ((select public.current_staff_role()) is not null);

-- One transaction creates the order, snapshots prices and allocates its daily number.
create function public.create_order(
  p_id uuid, p_client_request_id uuid, p_customer_first_name text,
  p_customer_mobile text, p_items jsonb
) returns public.orders
language plpgsql security definer set search_path = ''
as $$
declare
  v_order public.orders;
  v_item jsonb;
  v_add_on_id uuid;
  v_menu public.menu_items;
  v_add_on public.add_ons;
  v_order_item_id uuid;
  v_quantity integer;
  v_total numeric(10,2) := 0;
  v_day date := (now() at time zone 'Asia/Singapore')::date;
  v_number integer;
begin
  if (select public.current_staff_role()) not in ('counter', 'admin') then
    raise exception 'Counter or admin access required';
  end if;
  if p_id is null or p_client_request_id is null or
     nullif(trim(p_customer_first_name), '') is null or
     jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Invalid order';
  end if;

  -- Serialize retries of the same request before checking the unique key.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_client_request_id::text, 0));

  select * into v_order from public.orders where client_request_id = p_client_request_id;
  if found then
    if v_order.id <> p_id or v_order.created_by <> auth.uid() then
      raise exception 'Request ID already used';
    end if;
    return v_order;
  end if;

  insert into public.daily_order_counters (event_day, last_number) values (v_day, 1)
    on conflict (event_day) do update set last_number = public.daily_order_counters.last_number + 1
    returning last_number into v_number;

  insert into public.orders (id, event_day, order_number, customer_first_name,
    customer_mobile, total_amount, created_by, client_request_id)
  values (p_id, v_day, v_number, trim(p_customer_first_name),
    nullif(trim(p_customer_mobile), ''), 0, auth.uid(), p_client_request_id)
  returning * into v_order;

  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item->'quantity') <> 'number' or
       (v_item->>'quantity') !~ '^[0-9]+$' then
      raise exception 'Invalid quantity';
    end if;
    v_quantity := (v_item->>'quantity')::integer;
    if v_quantity <= 0 then raise exception 'Invalid quantity'; end if;
    select * into v_menu from public.menu_items
      where id = (v_item->>'menu_item_id')::uuid and is_available;
    if not found then raise exception 'Menu item unavailable'; end if;

    insert into public.order_items (order_id, menu_item_id, menu_item_name, quantity, unit_price)
    values (p_id, v_menu.id, v_menu.name, v_quantity, v_menu.base_price)
    returning id into v_order_item_id;
    v_total := v_total + v_quantity * v_menu.base_price;

    if v_item ? 'add_on_ids' and jsonb_typeof(v_item->'add_on_ids') <> 'array' then
      raise exception 'Invalid add-ons';
    end if;
    for v_add_on_id in
      select value::uuid from jsonb_array_elements_text(coalesce(v_item->'add_on_ids', '[]'::jsonb))
    loop
      select * into v_add_on from public.add_ons where id = v_add_on_id and is_available;
      if not found then raise exception 'Add-on unavailable'; end if;
      insert into public.order_item_add_ons (order_item_id, add_on_id, add_on_name, unit_price)
      values (v_order_item_id, v_add_on.id, v_add_on.name, v_add_on.price);
      v_total := v_total + v_quantity * v_add_on.price;
    end loop;
  end loop;

  update public.orders set total_amount = v_total where id = p_id returning * into v_order;
  return v_order;
end;
$$;
revoke all on function public.create_order(uuid, uuid, text, text, jsonb) from public, anon;
grant execute on function public.create_order(uuid, uuid, text, text, jsonb) to authenticated;

create function public.update_order_status(p_order_id uuid, p_expected_version integer, p_status text)
returns public.orders
language plpgsql security definer set search_path = ''
as $$
declare v_order public.orders;
begin
  if (select public.current_staff_role()) not in ('barista', 'admin') then
    raise exception 'Barista or admin access required';
  end if;
  update public.orders set status = p_status, version = version + 1, updated_at = now(),
    ready_at = case when p_status = 'ready' then now() else ready_at end,
    collected_at = case when p_status = 'collected' then now() else collected_at end
  where id = p_order_id and version = p_expected_version and (
    (status = 'queued' and p_status in ('preparing', 'cancelled')) or
    (status = 'preparing' and p_status in ('ready', 'cancelled')) or
    (status = 'ready' and p_status in ('collected', 'cancelled'))
  ) returning * into v_order;
  if not found then raise exception 'Order changed or transition invalid'; end if;
  return v_order;
end;
$$;
revoke all on function public.update_order_status(uuid, integer, text) from public, anon;
grant execute on function public.update_order_status(uuid, integer, text) to authenticated;

-- Public views expose only fields needed by the guest page and ready board.
create function public.guest_order_status(p_order_id uuid)
returns table (order_number integer, event_day date, status text, updated_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select o.order_number, o.event_day, o.status, o.updated_at
  from public.orders o where o.id = p_order_id
$$;
revoke all on function public.guest_order_status(uuid) from public;
grant execute on function public.guest_order_status(uuid) to anon, authenticated;

create function public.ready_orders()
returns table (order_number integer, event_day date, ready_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select o.order_number, o.event_day, o.ready_at from public.orders o
  where o.status = 'ready' and o.event_day = (now() at time zone 'Asia/Singapore')::date
$$;
revoke all on function public.ready_orders() from public;
grant execute on function public.ready_orders() to anon, authenticated;

create function public.daily_sales(p_event_day date)
returns table (drink_quantity bigint, sales_total numeric)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if (select public.current_staff_role()) <> 'admin' then
    raise exception 'Admin access required';
  end if;
  return query select coalesce(sum(i.quantity), 0)::bigint,
    coalesce((select sum(o.total_amount) from public.orders o
      where o.event_day = p_event_day and o.status <> 'cancelled'), 0)::numeric
  from public.order_items i join public.orders o on o.id = i.order_id
  where o.event_day = p_event_day and o.status <> 'cancelled';
end;
$$;
revoke all on function public.daily_sales(date) from public, anon;
grant execute on function public.daily_sales(date) to authenticated;
