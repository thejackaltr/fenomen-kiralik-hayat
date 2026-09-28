-- Schedule (or re-schedule) the daily v2.1 stats cleanup via pg_cron.
-- Use when pg_cron was enabled AFTER the migration ran. Same block as section 7 of
-- migrations/20260928150000_v2_1_anon_stats_events.sql. Run as the table owner (postgres).
-- Prerequisite (admin, once; the supabase/postgres image preloads pg_cron):
--   create extension if not exists pg_cron with schema pg_catalog;
--   grant usage on schema cron to postgres;
do $$
begin
  if exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'fenomen_anon_stats_cleanup') then
      perform cron.unschedule('fenomen_anon_stats_cleanup');
    end if;
    perform cron.schedule('fenomen_anon_stats_cleanup', '17 0 * * *',
                          'select public.anon_stats_cleanup()');
    raise notice 'anon_stats_events: pg_cron job fenomen_anon_stats_cleanup scheduled (17 0 * * * UTC)';
  else
    raise exception 'pg_cron is not installed in this database';
  end if;
end;
$$;
