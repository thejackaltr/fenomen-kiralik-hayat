-- LOCAL TEST ONLY. Superuser. Prints object state; used after re-run / rollback steps.
\pset pager off
select 'table' as kind, count(*) from pg_class where oid = to_regclass('public.anon_stats_events')
union all select 'policies', count(*) from pg_policies where tablename = 'anon_stats_events'
union all select 'functions', count(*) from pg_proc where proname in ('anon_stats_cleanup','anon_stats_retention_cutoff','anon_stats_events_limit_batch','anon_stats_today')
union all select 'cron_jobs (-1 = no pg_cron)', (case when to_regclass('cron.job') is null then -1
                               else (xpath('/row/c/text()', query_to_xml('select count(*) as c from cron.job where jobname = ''fenomen_anon_stats_cleanup''', false, true, '')))[1]::text::bigint end)
union all select 'rows', (case when to_regclass('public.anon_stats_events') is null then -1
                               else (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.anon_stats_events', false, true, '')))[1]::text::bigint end);
