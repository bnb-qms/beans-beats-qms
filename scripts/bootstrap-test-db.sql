-- Minimal Supabase-compatible bootstrap for a disposable test database.
-- Safe to re-run: every statement is idempotent.
do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
end $$;

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  created_at timestamptz not null default now()
);
-- Mirrors Supabase: returns the JWT subject claim, or null without one.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(btrim(coalesce(current_setting('request.jwt.claim.sub', true), '')), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
