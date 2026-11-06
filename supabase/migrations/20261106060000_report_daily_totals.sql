-- Aggregate the recorded order snapshots for one Singapore creation day.
create function public.report_daily_totals(p_staff_id uuid, p_date date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_cups bigint;
  v_sales_cents numeric;
begin
  if not exists (select 1 from public.staff where id = p_staff_id and is_active and role = 'admin') then
    raise exception 'BB_FORBIDDEN';
  end if;
  if p_date is null or p_date < date '0001-01-01' or p_date > date '9999-12-31' then
    raise exception 'BB_INVALID';
  end if;

  -- Separate item quantities from order totals to avoid multiplying sales by line count.
  with day_orders as (
    select id, total_amount from public.orders
    where created_at >= (p_date::timestamp at time zone 'Asia/Singapore')
      and created_at < ((p_date + 1)::timestamp at time zone 'Asia/Singapore')
      and status <> 'cancelled'
  )
  select coalesce((select sum(i.quantity) from public.order_items i join day_orders o on o.id = i.order_id), 0),
         coalesce((select sum(o.total_amount) * 100 from day_orders o), 0)
  into v_cups, v_sales_cents;
  return jsonb_build_object('date', p_date, 'cups', v_cups, 'sales_cents', v_sales_cents);
end;
$$;
revoke all on function public.report_daily_totals(uuid, date) from public, anon, authenticated;
grant execute on function public.report_daily_totals(uuid, date) to service_role;
