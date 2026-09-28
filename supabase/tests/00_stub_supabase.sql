-- LOCAL TEST ONLY. Run as a superuser (here: supabase_admin) on a THROWAWAY local database.
-- Mimics the parts of Supabase the v2.1 migration touches. Worst case on purpose:
-- "postgres" is NOT superuser and has NO BYPASSRLS, so FORCE RLS applies to the owner.
\set ON_ERROR_STOP 1

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'postgres') then
    create role postgres login createrole nobypassrls nosuperuser;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login noinherit;
  end if;
end $$;

grant anon, authenticated, service_role to authenticator;
grant anon, authenticated, service_role to postgres;

-- public schema: postgres can create objects; API roles can use it
grant all on schema public to postgres;
grant usage on schema public to anon, authenticated, service_role;

-- Supabase default privileges: every new table/function in public is granted to the API roles.
-- The migration must revoke these explicitly, so reproduce them here.
alter default privileges for role postgres in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role;

-- minimal auth schema (not used by the migration; present so the environment looks like Supabase)
create schema if not exists auth;
create or replace function auth.role() returns text language sql stable
  as $f$ select coalesce(current_setting('request.jwt.claims', true)::json->>'role', current_user::text) $f$;
create or replace function auth.uid() returns uuid language sql stable
  as $f$ select nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid $f$;
grant usage on schema auth to anon, authenticated, service_role;
