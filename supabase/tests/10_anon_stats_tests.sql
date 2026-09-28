-- LOCAL TEST ONLY. Run as superuser AFTER the migration was applied as role "postgres".
-- Every check prints PASS/FAIL and is stored in test_harness.results.
\set ON_ERROR_STOP 1
\pset pager off
\echo '== A. structure =='
select c.relname, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced,
       pg_get_userbyid(c.relowner) as owner
  from pg_class c where c.oid = 'public.anon_stats_events'::regclass;
select column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public' and table_name = 'anon_stats_events' order by ordinal_position;
select policyname, cmd, roles, qual, with_check from pg_policies where tablename = 'anon_stats_events' order by policyname;
select grantee, privilege_type, string_agg(column_name, ',' order by column_name) as columns
  from information_schema.column_privileges
 where table_schema = 'public' and table_name = 'anon_stats_events'
   and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
 group by 1, 2 order by 1, 2;

select test_harness.check('A1 RLS enabled+forced',
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.anon_stats_events'::regclass));
select test_harness.check('A2 no identifier-like columns',
  not exists (select 1 from information_schema.columns where table_schema='public' and table_name='anon_stats_events'
              and column_name ~* '(user|install|device_id|session|ip|agent|uid|email|name)'),
  (select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns
    where table_schema='public' and table_name='anon_stats_events'));
select test_harness.check('A3 anon/authenticated: only INSERT on 4 payload columns',
  (select coalesce(string_agg(distinct grantee || ':' || privilege_type || ':' || column_name, ' ' order by grantee || ':' || privilege_type || ':' || column_name), '')
     from information_schema.column_privileges
    where table_schema='public' and table_name='anon_stats_events' and grantee in ('anon','authenticated','PUBLIC'))
  = 'anon:INSERT:device_class anon:INSERT:event anon:INSERT:play_bucket anon:INSERT:version authenticated:INSERT:device_class authenticated:INSERT:event authenticated:INSERT:play_bucket authenticated:INSERT:version');
select test_harness.check('A4 no table-level privilege for anon/authenticated',
  not exists (select 1 from information_schema.role_table_grants where table_schema='public'
              and table_name='anon_stats_events' and grantee in ('anon','authenticated','PUBLIC')));
select test_harness.check('A5 no client SELECT/UPDATE/DELETE policy',
  not exists (select 1 from pg_policies where tablename='anon_stats_events' and cmd <> 'INSERT'
              and roles && array['anon','authenticated','public']::name[]));
select test_harness.check('A6 created_at index exists',
  exists (select 1 from pg_indexes where tablename='anon_stats_events' and indexdef like '%(created_at)%'));

\echo '== B. anon role =='
set role anon;
select test_harness.expect_ok('B1 anon INSERT valid row',
  $$insert into public.anon_stats_events(event, version, device_class, play_bucket) values ('first_video','2.1.0','mobil','10-30')$$);
do $$ declare e text; begin
  foreach e in array array['game_open_new','character_created','path_chosen_vlog','path_chosen_oyun','path_chosen_luks',
    'first_video','first_edit_game','first_shop_buy','first_rent','first_ifsa','first_ifsa_ozur','first_ifsa_gormezden',
    'first_staff','first_manager','followers_1B','followers_10B','followers_100B','followers_1M','first_sell',
    'first_fame_node','kiraliksiz_hayat','session_start'] loop
    perform test_harness.expect_ok('B2 anon INSERT allowed event ' || e,
      format($q$insert into public.anon_stats_events(event, version, device_class, play_bucket) values (%L,'2.1.0','masaustu','120+')$q$, e));
  end loop; end $$;
select test_harness.expect_ok('B3 anon INSERT 5 rows in one statement (limit)',
  $$insert into public.anon_stats_events(event, version, device_class, play_bucket)
    select 'session_start','2.1.0','mobil','0-10' from generate_series(1,5)$$);
select test_harness.expect_error('B4 anon INSERT 6 rows in one statement', 
  $$insert into public.anon_stats_events(event, version, device_class, play_bucket)
    select 'session_start','2.1.0','mobil','0-10' from generate_series(1,6)$$, '23514');
select test_harness.expect_error('B5 anon INSERT ... RETURNING (= return=representation)',
  $$insert into public.anon_stats_events(event, version, device_class, play_bucket) values ('first_video','2.1.0','mobil','10-30') returning id$$, '42501');
select test_harness.expect_error('B6 anon SELECT',  $$select * from public.anon_stats_events$$, '42501');
select test_harness.expect_error('B7 anon SELECT count(*)', $$select count(*) from public.anon_stats_events$$, '42501');
select test_harness.expect_error('B8 anon UPDATE',  $$update public.anon_stats_events set play_bucket = '0-10'$$, '42501');
select test_harness.expect_error('B9 anon DELETE',  $$delete from public.anon_stats_events$$, '42501');
select test_harness.expect_error('B10 anon TRUNCATE', $$truncate public.anon_stats_events$$, '42501');
select test_harness.expect_error('B11 anon upsert ON CONFLICT DO UPDATE',
  $$insert into public.anon_stats_events(event, version, device_class, play_bucket) values ('first_video','2.1.0','mobil','10-30')
    on conflict (id) do update set event = excluded.event$$, '42501');
select test_harness.expect_error('B12 anon sets created_at (backdate)',
  $$insert into public.anon_stats_events(event, version, device_class, play_bucket, created_at) values ('first_video','2.1.0','mobil','10-30', '2020-01-01')$$, '42501');
select test_harness.expect_error('B13 anon sets id',
  $$insert into public.anon_stats_events(id, event, version, device_class, play_bucket) values (gen_random_uuid(),'first_video','2.1.0','mobil','10-30')$$, '42501');
select test_harness.expect_error('B14 anon extra column install_id',
  $$insert into public.anon_stats_events(event, version, device_class, play_bucket, install_id) values ('first_video','2.1.0','mobil','10-30','x')$$, '42703');
-- invalid payloads -> CHECK (23514) / NOT NULL (23502)
select test_harness.expect_error('B15 bad event (unknown)',        $$insert into public.anon_stats_events(event, version, device_class, play_bucket) values ('first_videoX','2.1.0','mobil','10-30')$$, '23514');
select test_harness.expect_error('B16 bad event path_chosen_egitim', $$insert into public.anon_stats_events(event, version, device_class, play_bucket) values ('path_chosen_egitim','2.1.0','mobil','10-30')$$, '23514');
select test_harness.expect_error('B17 bad event followers_2B',     $$insert into public.anon_stats_events(event, version, device_class, play_bucket) values ('followers_2B','2.1.0','mobil','10-30')$$, '23514');
select test_harness.expect_error('B18 bad event case FIRST_VIDEO', $$insert into public.anon_stats_events(event, version, device_class, play_bucket) values ('FIRST_VIDEO','2.1.0','mobil','10-30')$$, '23514');
select test_harness.expect_error('B19 bad event: PII stuffing',    $$insert into public.anon_stats_events(event, version, device_class, play_bucket) values ('first_video ali@example.com','2.1.0','mobil','10-30')$$, '23514');
select test_harness.expect_error('B20 bad event: 10k chars',       $$insert into public.anon_stats_events(event, version, device_class, play_bucket) values (repeat('a',10000),'2.1.0','mobil','10-30')$$, '23514');
select test_harness.expect_error('B21 bad version 2.1.0-f29b9b4',  $$insert into public.anon_stats_events(event, version, device_class, play_bucket) values ('first_video','2.1.0-f29b9b4','mobil','10-30')$$, '23514');
select test_harness.expect_error('B22 bad version 2.1',            $$insert into public.anon_stats_events(event, version, device_class, play_bucket) values ('first_video','2.1','mobil','10-30')$$, '23514');
select test_harness.expect_error('B23 bad version with newline',   $$insert into public.anon_stats_events(event, version, device_class, play_bucket) values ('first_video',E'2.1.0\n','mobil','10-30')$$, '23514');
select test_harness.expect_error('B24 bad version 1000.0.0',       $$insert into public.anon_stats_events(event, version, device_class, play_bucket) values ('first_video','1000.0.0','mobil','10-30')$$, '23514');
select test_harness.expect_error('B25 bad version text',           $$insert into public.anon_stats_events(event, version, device_class, play_bucket) values ('first_video','Mozilla/5.0','mobil','10-30')$$, '23514');
select test_harness.expect_error('B26 bad device_class tablet',    $$insert into public.anon_stats_events(event, version, device_class, play_bucket) values ('first_video','2.1.0','tablet','10-30')$$, '23514');
select test_harness.expect_error('B27 bad device_class Mobil',     $$insert into public.anon_stats_events(event, version, device_class, play_bucket) values ('first_video','2.1.0','Mobil','10-30')$$, '23514');
select test_harness.expect_error('B28 bad play_bucket 17',         $$insert into public.anon_stats_events(event, version, device_class, play_bucket) values ('first_video','2.1.0','mobil','17')$$, '23514');
select test_harness.expect_error('B29 bad play_bucket 120',        $$insert into public.anon_stats_events(event, version, device_class, play_bucket) values ('first_video','2.1.0','mobil','120')$$, '23514');
select test_harness.expect_error('B30 null event',                 $$insert into public.anon_stats_events(event, version, device_class, play_bucket) values (null,'2.1.0','mobil','10-30')$$, '23502');
select test_harness.expect_error('B31 missing play_bucket',        $$insert into public.anon_stats_events(event, version, device_class) values ('first_video','2.1.0','mobil')$$, '23502');
select test_harness.expect_error('B32 anon EXECUTE anon_stats_cleanup()',          $$select public.anon_stats_cleanup()$$, '42501');
select test_harness.expect_error('B33 anon EXECUTE anon_stats_retention_cutoff()', $$select public.anon_stats_retention_cutoff()$$, '42501');
reset role;

\echo '== C. authenticated role =='
set role authenticated;
select test_harness.expect_ok('C1 authenticated INSERT valid row',
  $$insert into public.anon_stats_events(event, version, device_class, play_bucket) values ('first_rent','2.1.0','mobil','30-60')$$);
select test_harness.expect_error('C2 authenticated SELECT', $$select * from public.anon_stats_events$$, '42501');
select test_harness.expect_error('C3 authenticated UPDATE', $$update public.anon_stats_events set play_bucket = '0-10'$$, '42501');
select test_harness.expect_error('C4 authenticated DELETE', $$delete from public.anon_stats_events$$, '42501');
reset role;

\echo '== D. service_role (server side only) =='
set role service_role;
select test_harness.check('D1 service_role SELECT sees all client rows (1+22+5+1=29)',
  (select count(*) from public.anon_stats_events) = 29, (select count(*)::text from public.anon_stats_events));
select test_harness.expect_error('D2 service_role UPDATE (events immutable)', $$update public.anon_stats_events set play_bucket = '0-10'$$, '42501');
select test_harness.check('D3 all client rows dated today (UTC)',
  (select bool_and(created_at = (now() at time zone 'utc')::date) from public.anon_stats_events));
reset role;

\echo '== E. owner "postgres" (non-superuser, FORCE RLS applies) =='
set role postgres;
select test_harness.check('E1 owner SELECT via owner policy', (select count(*) from public.anon_stats_events) = 29);
do $$ declare n int; begin
  update public.anon_stats_events set play_bucket = '0-10'; get diagnostics n = row_count;
  perform test_harness.check('E2 owner UPDATE hits 0 rows (no UPDATE policy)', n = 0, n || ' rows');
  delete from public.anon_stats_events; get diagnostics n = row_count;
  perform test_harness.check('E3 owner DELETE of fresh rows hits 0 rows (only expired rows deletable)', n = 0, n || ' rows');
end $$;
reset role;

\echo '== F. cleanup (older than 180 days) =='
-- seed dated rows as superuser (bypasses RLS/grants): ages 400, 181, 180, 179, 1 days
insert into public.anon_stats_events(event, version, device_class, play_bucket, created_at)
select 'session_start', '2.1.0', 'mobil', '0-10', (now() at time zone 'utc')::date - a
  from unnest(array[400, 181, 180, 179, 1]) as a;
select created_at, (now() at time zone 'utc')::date - created_at as age_days, count(*)
  from public.anon_stats_events group by 1 order by 1;
set role postgres;
select test_harness.check('F1 cleanup (as owner, like pg_cron) deletes exactly the 2 rows older than 180 days',
  (select public.anon_stats_cleanup()) = 2);
reset role;
select test_harness.check('F2 180-day-old row kept, 181/400 gone, 179/1/today kept',
  (select array_agg(distinct (now() at time zone 'utc')::date - created_at order by (now() at time zone 'utc')::date - created_at)
     from public.anon_stats_events) = array[0, 1, 179, 180],
  (select array_agg(distinct (now() at time zone 'utc')::date - created_at order by (now() at time zone 'utc')::date - created_at)::text
     from public.anon_stats_events));
set role service_role;
select test_harness.check('F3 cleanup callable by service_role, nothing left to delete', (select public.anon_stats_cleanup()) = 0);
reset role;
select test_harness.check('F4 row count after cleanup = 29 + 3', (select count(*) from public.anon_stats_events) = 32);
