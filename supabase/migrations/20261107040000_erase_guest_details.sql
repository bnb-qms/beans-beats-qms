-- F18 retention clean-up: remove guest names and mobile numbers from finished event days.
-- Sales records (items, prices, totals, statuses) stay so F13/F14 reports do not change.
-- Run from the Supabase SQL Editor only; the app has no button for this.
create function public.erase_guest_details(p_last_day date)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_count integer;
begin
  -- Never erase the day that is still trading.
  if p_last_day is null or p_last_day >= (now() at time zone 'Asia/Singapore')::date then
    raise exception 'BB_INVALID';
  end if;

  -- The name column cannot be empty, so it is replaced with a fixed placeholder.
  update public.orders
  set customer_first_name = 'Guest',
      customer_mobile = null,
      mobile_consent_at = null,
      updated_at = now()
  where event_day <= p_last_day
    and (customer_first_name <> 'Guest' or customer_mobile is not null or mobile_consent_at is not null);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.erase_guest_details(date) from public, anon, authenticated;
grant execute on function public.erase_guest_details(date) to service_role;
