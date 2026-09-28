-- LOCAL TEST ONLY. Superuser. Like Supabase: pg_cron created by the admin, postgres may use it.
\set ON_ERROR_STOP 1
create extension if not exists pg_cron;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
