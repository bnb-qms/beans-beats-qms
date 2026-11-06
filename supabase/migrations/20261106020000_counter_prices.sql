-- F10. Compare versions while holding the row lock; do not overwrite stale edits.
create function public.counter_edit_menu(p_staff_id uuid, p_kind text, p_id uuid, p_version integer, p_change jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_current jsonb;
  v_price numeric(10,2);
begin
  if not exists (select 1 from public.staff where id = p_staff_id and is_active and role = 'admin') then raise exception 'BB_FORBIDDEN'; end if;
  if p_kind is null or p_kind not in ('drink', 'option') or p_version is null or p_version < 1
    or jsonb_typeof(p_change) is distinct from 'object' then raise exception 'BB_INVALID'; end if;
  if (select count(*) from jsonb_object_keys(p_change)) <> 1 or
    jsonb_typeof(p_change->'price_cents') is distinct from 'number' or
    (p_change->>'price_cents') !~ '^[0-9]{1,8}$' then raise exception 'BB_INVALID'; end if;
  v_price := (p_change->>'price_cents')::numeric / 100;
  if p_kind = 'drink' then select to_jsonb(m) into v_current from public.menu_items m where id = p_id for update;
  else select to_jsonb(a) into v_current from public.add_ons a where id = p_id for update; end if;
  if not found then raise exception 'BB_INVALID'; end if;
  if (v_current->>'version')::integer <> p_version then
    if (v_current->>'version')::integer = p_version + 1 and
      coalesce(v_current->>'base_price', v_current->>'price')::numeric = v_price then return v_current; end if;
    raise exception 'BB_CONFLICT';
  end if;
  if p_kind = 'drink' then
    update public.menu_items set base_price = v_price, updated_at = now() where id = p_id returning to_jsonb(menu_items.*) into v_current;
  else
    update public.add_ons set price = v_price where id = p_id returning to_jsonb(add_ons.*) into v_current;
  end if;
  return v_current;
end;
$$;
revoke all on function public.counter_edit_menu(uuid, text, uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.counter_edit_menu(uuid, text, uuid, integer, jsonb) to service_role;
