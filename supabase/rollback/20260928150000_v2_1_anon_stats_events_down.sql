-- =============================================================================
-- ROLLBACK for supabase/migrations/20260928150000_v2_1_anon_stats_events.sql
-- WARNING: drops the table and ALL collected v2.1 stats rows.
-- Idempotent: safe to run twice or on a database where the migration never ran.
-- Run atomically:  psql -1 -v ON_ERROR_STOP=1 -f supabase/rollback/20260928150000_v2_1_anon_stats_events_down.sql
-- Kept outside supabase/migrations/ on purpose so no migration tool picks it up.
-- =============================================================================

-- 1. pg_cron job (only if pg_cron is installed and the job exists)
do $$
begin
  if exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'fenomen_anon_stats_cleanup') then
      perform cron.unschedule('fenomen_anon_stats_cleanup');
      raise notice 'anon_stats_events rollback: pg_cron job unscheduled';
    end if;
  end if;
end;
$$;

-- 2. policies (explicitly, before the table)
do $$
begin
  if to_regclass('public.anon_stats_events') is not null then
    drop policy if exists anon_stats_events_client_insert          on public.anon_stats_events;
    drop policy if exists anon_stats_events_owner_select           on public.anon_stats_events;
    drop policy if exists anon_stats_events_owner_retention_delete on public.anon_stats_events;
  end if;
end;
$$;

-- 3. table (also drops its trigger, index, constraints and grants)
drop table if exists public.anon_stats_events;

-- 4. functions
drop function if exists public.anon_stats_cleanup();
drop function if exists public.anon_stats_events_limit_batch();
drop function if exists public.anon_stats_retention_cutoff();
drop function if exists public.anon_stats_today();
