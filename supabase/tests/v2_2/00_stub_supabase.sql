-- LOCAL TEST ONLY — throwaway PostgreSQL 17 cluster, run as the cluster superuser (supabase_admin).
-- Mirrors what the v2.2 migration relies on, as observed in the real image supabase/postgres:17.6.1.171
-- (run in this test suite, see stack/): postgres = nosuperuser + BYPASSRLS + CREATEROLE; service_role BYPASSRLS;
-- auth.* owned by supabase_auth_admin with postgres granted ALL; Supabase default privileges in public
-- (new tables/functions granted to anon/authenticated/service_role -> a missing REVOKE fails the tests).
-- auth tables: a reduced GoTrue shape (users, identities, sessions, refresh_tokens, audit_log_entries) with the same cascade FKs.
\set ON_ERROR_STOP 1
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'postgres') then create role postgres login createrole bypassrls nosuperuser; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator login noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then create role supabase_auth_admin login noinherit createrole; end if;
end $$;
grant anon, authenticated, service_role to authenticator;
grant anon, authenticated, service_role to postgres;
grant all on schema public to postgres;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role;

create schema if not exists auth authorization supabase_auth_admin;
set role supabase_auth_admin;
create table if not exists auth.users (
  id uuid primary key, email text, created_at timestamptz default now(), updated_at timestamptz default now(),
  last_sign_in_at timestamptz, email_confirmed_at timestamptz, is_anonymous boolean not null default false);
create table if not exists auth.identities (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'email', provider_id text not null, identity_data jsonb not null default '{}', created_at timestamptz default now());
create table if not exists auth.sessions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists auth.refresh_tokens (
  id bigserial primary key, token text, user_id varchar(255), session_id uuid references auth.sessions(id) on delete cascade,
  revoked boolean default false, created_at timestamptz default now());
-- same shape as the real image (supabase/postgres 17.6.1.136 init + GoTrue ip_address column): payload is json, no FK to users
create table if not exists auth.audit_log_entries (
  instance_id uuid, id uuid primary key, payload json, created_at timestamptz, ip_address varchar(64) not null default '');
create or replace function auth.uid() returns uuid language sql stable as $f$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $f$;
create or replace function auth.role() returns text language sql stable as $f$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'))::text $f$;
grant usage on schema auth to anon, authenticated, service_role, postgres;
grant all on all tables in schema auth to postgres;
grant all on all sequences in schema auth to postgres;
grant execute on function auth.uid(), auth.role() to anon, authenticated, service_role, postgres;
reset role;
