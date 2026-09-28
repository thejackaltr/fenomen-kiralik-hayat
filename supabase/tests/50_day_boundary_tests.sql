-- LOCAL TEST ONLY. Superuser. Runs in a throwaway cluster whose wall clock is shifted with
-- libfaketime (run-local.sh step 10), so now() itself is at a chosen UTC instant. Checks the REAL
-- column default, client INSERT policy, retention cutoff, cleanup and report at that instant.
-- psql vars: :phase (label), :expect_diff (true = Istanbul date is UTC date + 1).
\set ON_ERROR_STOP 1
\pset pager off
select :'phase' as phase, now() at time zone 'utc' as utc_now, now() at time zone 'Europe/Istanbul' as istanbul_now,
       (now() at time zone 'utc')::date as utc_date, public.anon_stats_today() as istanbul_date,
       public.anon_stats_retention_cutoff() as cutoff;
select public.anon_stats_today() as ist, (now() at time zone 'utc')::date as utc \gset

select test_harness.check(:'phase' || ' T1 simulated clock: Istanbul date ' ||
         case when :expect_diff then '= UTC date + 1' else '= UTC date' end,
  public.anon_stats_today() = (now() at time zone 'utc')::date + case when :expect_diff then 1 else 0 end,
  'utc=' || :'utc' || ' istanbul=' || :'ist');

-- T2/T3: anon insert through the real default + policy
set role anon;
select test_harness.expect_ok(:'phase' || ' T2 anon INSERT accepted (default + policy use Istanbul day)',
  $$insert into public.anon_stats_events(event, version, device_class, play_bucket) values ('session_start','2.1.0','mobil','0-10')$$);
reset role;
select test_harness.check(:'phase' || ' T3 stored created_at = Istanbul date',
  (select bool_and(created_at = :'ist'::date) and count(*) = 1 from public.anon_stats_events),
  (select string_agg(created_at::text, ',') from public.anon_stats_events));

-- T4/T5: policy alone (column grant temporarily widened, then revoked)
grant insert (created_at) on public.anon_stats_events to anon;
set role anon;
select test_harness.expect_ok(:'phase' || ' T4 policy accepts created_at = Istanbul date',
  format($q$insert into public.anon_stats_events(event, version, device_class, play_bucket, created_at) values ('session_start','2.1.0','mobil','0-10', %L)$q$, :'ist'));
select test_harness.expect_error(:'phase' || ' T5 policy rejects created_at = Istanbul date - 1' ||
         case when :expect_diff then ' (= the UTC date right now)' else '' end,
  format($q$insert into public.anon_stats_events(event, version, device_class, play_bucket, created_at) values ('session_start','2.1.0','mobil','0-10', %L::date - 1)$q$, :'ist'), '42501');
reset role;
revoke insert (created_at) on public.anon_stats_events from anon;

-- T6-T8: retention 180/181 by Istanbul date
select test_harness.check(:'phase' || ' T6 retention cutoff = Istanbul date - 180',
  public.anon_stats_retention_cutoff() = :'ist'::date - 180, public.anon_stats_retention_cutoff()::text);
truncate public.anon_stats_events;
insert into public.anon_stats_events(event, version, device_class, play_bucket, created_at)
select 'session_start', '2.1.0', 'mobil', '0-10', :'ist'::date - a from unnest(array[181, 180, 179]) as a;
select created_at, :'ist'::date - created_at as istanbul_age, :'utc'::date - created_at as utc_age
  from public.anon_stats_events order by 1;
set role postgres;
select test_harness.check(:'phase' || ' T7 cleanup deletes exactly the Istanbul-age-181 row' ||
         case when :expect_diff then ' (UTC age only 180)' else '' end,
  public.anon_stats_cleanup() = 1);
reset role;
select test_harness.check(:'phase' || ' T8 Istanbul ages 180 and 179 kept',
  (select array_agg(:'ist'::date - created_at order by created_at) from public.anon_stats_events) = array[180, 179],
  (select array_agg(:'ist'::date - created_at order by created_at)::text from public.anon_stats_events));

-- T9: report "today" (last_n_days = 1) is the Istanbul day
truncate public.anon_stats_events;
insert into public.anon_stats_events(event, version, device_class, play_bucket, created_at)
select 'game_open_new', '2.1.0', 'mobil', '0-10', d.day
  from (values (:'ist'::date, 5), (:'ist'::date - 1, 7)) as d(day, n) cross join lateral generate_series(1, d.n);
\set report_today `sed -e 's/;[[:space:]]*$//' -e 's/30::int\( *\)as last_n_days/1::int\1as last_n_days/' "$REPORT_FILE"`
create temp table funnel_today as :report_today
;
select test_harness.check(:'phase' || ' T9 report last_n_days=1 counts only the Istanbul day (5, not 7)',
  (select n = 5 and from_date = :'ist'::date and to_date = :'ist'::date from funnel_today where step_no = 1),
  (select n::text || ' ' || from_date from funnel_today where step_no = 1));
truncate public.anon_stats_events;
