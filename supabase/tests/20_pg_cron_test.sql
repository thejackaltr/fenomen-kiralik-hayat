-- LOCAL TEST ONLY. Superuser. Checks the pg_cron job created by the migration and runs the
-- same command once through pg_cron as role "postgres" (like the real daily job).
\set ON_ERROR_STOP 1
\pset pager off
select jobname, schedule, command, username, database, active from cron.job order by jobid;
select test_harness.check('G1 daily job fenomen_anon_stats_cleanup scheduled as postgres (17 0 * * * UTC = 03:17 TSI)',
  exists (select 1 from cron.job where jobname = 'fenomen_anon_stats_cleanup' and schedule = '17 0 * * *'
          and command = 'select public.anon_stats_cleanup()' and username = 'postgres' and active));
-- live run: one expired + one fresh row, a temporary 1-second job, wait, check, unschedule
insert into public.anon_stats_events(event, version, device_class, play_bucket, created_at)
values ('session_start', '2.1.0', 'mobil', '0-10', public.anon_stats_today() - 200),
       ('session_start', '2.1.0', 'mobil', '0-10', public.anon_stats_today() - 3);
set role postgres;
select cron.schedule('fenomen_test_tmp_cleanup', '1 seconds', 'select public.anon_stats_cleanup()') is not null as tmp_job_scheduled;
reset role;
select pg_sleep(4);
select j.jobname, d.username, d.status, d.return_message
  from cron.job_run_details d join cron.job j using (jobid)
 where j.jobname = 'fenomen_test_tmp_cleanup' order by d.runid limit 3;
select test_harness.check('G2 pg_cron run as postgres succeeded',
  exists (select 1 from cron.job_run_details d join cron.job j using (jobid)
          where j.jobname = 'fenomen_test_tmp_cleanup' and d.status = 'succeeded'));
select test_harness.check('G3 pg_cron run deleted the 200-day row, kept the 3-day row',
  not exists (select 1 from public.anon_stats_events where created_at = public.anon_stats_today() - 200)
  and exists (select 1 from public.anon_stats_events where created_at = public.anon_stats_today() - 3));
set role postgres;
select cron.unschedule('fenomen_test_tmp_cleanup') as tmp_job_unscheduled;
reset role;
