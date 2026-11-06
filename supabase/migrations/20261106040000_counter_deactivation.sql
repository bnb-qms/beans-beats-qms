-- F12 adds admin-only soft deactivation; no deletion or reactivation endpoint.
create or replace function public.counter_edit_menu(p_staff_id uuid, p_kind text, p_id uuid, p_version integer, p_change jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_current jsonb;
  v_price numeric(10,2);
  v_available boolean;
  v_active boolean;
  v_action text;
  v_role text;
  v_same boolean;
begin
  select role into v_role from public.staff where id = p_staff_id and is_active;
  if v_role is null then raise exception 'BB_FORBIDDEN'; end if;
  if p_kind is null or p_kind not in ('drink', 'option') or p_version is null or p_version < 1
    or jsonb_typeof(p_change) is distinct from 'object' then raise exception 'BB_INVALID'; end if;
  if (select count(*) from jsonb_object_keys(p_change)) <> 1 then raise exception 'BB_INVALID'; end if;
  select jsonb_object_keys(p_change) into v_action;
  if v_action = 'price_cents' then
    if v_role <> 'admin' then raise exception 'BB_FORBIDDEN'; end if;
    if jsonb_typeof(p_change->v_action) is distinct from 'number' or (p_change->>v_action) !~ '^[0-9]{1,8}$' then raise exception 'BB_INVALID'; end if;
    v_price := (p_change->>v_action)::numeric / 100;
  elsif v_action = 'is_available' then
    if v_role not in ('barista', 'admin') then raise exception 'BB_FORBIDDEN'; end if;
    if jsonb_typeof(p_change->v_action) is distinct from 'boolean' then raise exception 'BB_INVALID'; end if;
    v_available := (p_change->>v_action)::boolean;
  elsif v_action = 'is_active' then
    if v_role <> 'admin' then raise exception 'BB_FORBIDDEN'; end if;
    if p_kind <> 'drink' or p_change->'is_active' is distinct from 'false'::jsonb then raise exception 'BB_INVALID'; end if;
    v_active := false;
  else raise exception 'BB_INVALID'; end if;
  if p_kind = 'drink' then select to_jsonb(m) into v_current from public.menu_items m where id = p_id for update;
  else select to_jsonb(a) into v_current from public.add_ons a where id = p_id for update; end if;
  if not found then raise exception 'BB_INVALID'; end if;
  if v_action = 'is_available' and p_kind = 'drink' and not (v_current->>'is_active')::boolean then raise exception 'BB_INACTIVE'; end if;
  if v_action = 'is_active' and not (v_current->>'is_active')::boolean then return v_current; end if;
  v_same := case when v_action = 'price_cents' then coalesce(v_current->>'base_price', v_current->>'price')::numeric = v_price
    when v_action = 'is_active' then (v_current->>'is_active')::boolean = v_active
    else (v_current->>'is_available')::boolean = v_available end;
  if (v_current->>'version')::integer <> p_version then
    if (v_current->>'version')::integer = p_version + 1 and v_same then return v_current; end if;
    raise exception 'BB_CONFLICT';
  end if;
  if v_same then return v_current; end if;
  if p_kind = 'drink' then
    update public.menu_items set base_price = coalesce(v_price, base_price), is_available = coalesce(v_available, is_available), is_active = coalesce(v_active, is_active), updated_at = now()
    where id = p_id returning to_jsonb(menu_items.*) into v_current;
  else
    update public.add_ons set price = coalesce(v_price, price), is_available = coalesce(v_available, is_available)
    where id = p_id returning to_jsonb(add_ons.*) into v_current;
  end if;
  return v_current;
end;
$$;
