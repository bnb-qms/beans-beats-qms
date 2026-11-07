-- F18: after all booth devices are reconciled, include orders submitted on the clean-up day.
drop function public.erase_guest_details(date);

create function public.erase_guest_details(p_last_day date, p_include_today boolean default false)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Singapore')::date;
  v_count integer;
begin
  if p_last_day is null or p_last_day > v_today
    or (p_last_day = v_today and p_include_today is distinct from true) then
    raise exception 'BB_INVALID';
  end if;

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
revoke all on function public.erase_guest_details(date, boolean) from public, anon, authenticated;
grant execute on function public.erase_guest_details(date, boolean) to service_role;
