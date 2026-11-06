-- Paste into the Supabase SQL Editor. Inserts into existing tables only.
-- Requires the staff-password schema migration to be applied first.
-- Run once. The transaction rolls back if a unique value already exists.
begin;

insert into public.menu_items (name, base_price) values
  ('espresso', 3.00),
  ('latte', 8.00),
  ('flat white', 8.00),
  ('americano', 6.00),
  ('pourover', 10.00);

insert into public.add_ons (name, price) values
  ('iced', 1.00),
  ('oat milk', 1.00);

insert into public.staff (username, password_hash, role)
select
  'mock_staff_' || lpad(n::text, 2, '0'),
  extensions.crypt('MockPass' || lpad(n::text, 2, '0') || '!', extensions.gen_salt('bf')),
  case when n % 3 = 0 then 'admin'
       when n % 3 = 1 then 'counter'
       else 'barista' end
from generate_series(1, 20) as g(n);

insert into public.daily_order_counters (event_day, last_number)
select date '2026-11-10' + (n - 1), 1
from generate_series(1, 20) as g(n);

insert into public.orders (
  id, event_day, order_number, customer_first_name, customer_mobile,
  status, total_amount, created_by, client_request_id,
  created_at, updated_at, ready_at, collected_at, version
)
select
  md5('beans-beats-order-' || n)::uuid,
  date '2026-11-10' + (n - 1),
  1,
  'Guest ' || lpad(n::text, 2, '0'),
  null,
  case n % 5 when 0 then 'collected' when 1 then 'queued'
    when 2 then 'preparing' when 3 then 'ready' else 'cancelled' end,
  (1 + n % 3) * (m.base_price + a.price),
  s.id,
  md5('beans-beats-request-' || n)::uuid,
  ((date '2026-11-10' + (n - 1)) + time '10:00') at time zone 'Asia/Singapore',
  ((date '2026-11-10' + (n - 1)) + time '10:15') at time zone 'Asia/Singapore',
  case when n % 5 in (0, 3) then
    ((date '2026-11-10' + (n - 1)) + time '10:10') at time zone 'Asia/Singapore' end,
  case when n % 5 = 0 then
    ((date '2026-11-10' + (n - 1)) + time '10:15') at time zone 'Asia/Singapore' end,
  case n % 5 when 0 then 4 when 1 then 1 when 2 then 2 else 3 end
from generate_series(1, 20) as g(n)
join public.staff s on s.username = 'mock_staff_' || lpad(n::text, 2, '0')
join public.menu_items m on m.name =
  (array['espresso', 'latte', 'flat white', 'americano', 'pourover'])[1 + ((n - 1) % 5)]
join public.add_ons a on a.name =
  (array['iced', 'oat milk'])[1 + ((n - 1) % 2)];

insert into public.order_items (
  id, order_id, menu_item_id, menu_item_name, quantity, unit_price
)
select
  md5('beans-beats-item-' || n)::uuid,
  md5('beans-beats-order-' || n)::uuid,
  m.id, m.name, 1 + n % 3, m.base_price
from generate_series(1, 20) as g(n)
join public.menu_items m on m.name =
  (array['espresso', 'latte', 'flat white', 'americano', 'pourover'])[1 + ((n - 1) % 5)];

insert into public.order_item_add_ons (
  order_item_id, add_on_id, add_on_name, unit_price
)
select
  md5('beans-beats-item-' || n)::uuid,
  a.id, a.name, a.price
from generate_series(1, 20) as g(n)
join public.add_ons a on a.name =
  (array['iced', 'oat milk'])[1 + ((n - 1) % 2)];

commit;
