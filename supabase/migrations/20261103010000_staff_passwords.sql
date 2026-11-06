-- Fixed staff accounts are provisioned by trusted SQL, not public signup.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

alter table public.staff drop constraint if exists staff_id_fkey;
alter table public.staff alter column id set default gen_random_uuid();
alter table public.staff add column password_hash text;

-- Retire any existing Auth-linked profiles without giving them a known password.
update public.staff
set password_hash = extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf'))
where password_hash is null;
alter table public.staff alter column password_hash set not null;

-- Existing Auth JWTs no longer identify staff. Keep privileged operations closed
-- until the application has a server-side username/password session flow.
create or replace function public.current_staff_role() returns text
language sql stable security definer set search_path = ''
as $$ select null::text $$;

revoke all on public.menu_items, public.add_ons, public.orders,
  public.order_items, public.order_item_add_ons from authenticated;
grant select on public.menu_items, public.add_ons to authenticated;
revoke execute on function public.create_order(uuid, uuid, text, text, jsonb)
  from authenticated;
revoke execute on function public.update_order_status(uuid, integer, text)
  from authenticated;
revoke execute on function public.daily_sales(date) from authenticated;

-- Call only from a trusted server with a Supabase secret/service key.
create function public.verify_staff_credentials(p_username text, p_password text)
returns table (id uuid, username text, role text)
language sql stable security definer set search_path = ''
as $$
  select s.id, s.username, s.role
  from public.staff s
  where s.username = p_username and s.is_active
    and s.password_hash = extensions.crypt(p_password, s.password_hash)
$$;
revoke all on function public.verify_staff_credentials(text, text) from public, anon, authenticated;
grant execute on function public.verify_staff_credentials(text, text) to service_role;
