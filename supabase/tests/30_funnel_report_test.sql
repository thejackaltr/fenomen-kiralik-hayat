-- LOCAL TEST ONLY. Superuser. Seeds a known funnel and checks the report math + suppression.
\set ON_ERROR_STOP 1
\pset pager off
truncate public.anon_stats_events;
insert into public.anon_stats_events(event, version, device_class, play_bucket)
select s.event, '2.1.0', 'mobil', '10-30'
  from (values ('game_open_new',100),('character_created',80),('path_chosen_vlog',30),('path_chosen_oyun',20),
               ('path_chosen_luks',10),('first_video',50),('first_edit_game',40),('first_shop_buy',30),('first_rent',20),
               ('first_ifsa',12),('first_staff',10),('followers_10B',8),('first_manager',6),('followers_100B',4),
               ('first_sell',3),('first_fame_node',2),('kiraliksiz_hayat',1)) as s(event, n)
 cross join lateral generate_series(1, s.n);
-- noise in another version must not count
insert into public.anon_stats_events(event, version, device_class, play_bucket)
select 'game_open_new', '2.1.1', 'masaustu', '0-10' from generate_series(1, 7);

-- :report_file is passed by run-local.sh; the report text is used verbatim (minus its final ';')
\set report_sql `sed -e 's/;[[:space:]]*$//' "$REPORT_FILE"`
create temp table funnel_out as :report_sql
;
select * from funnel_out order by step_no;
select test_harness.check('R1 step1 n=100 (other version ignored)', (select n from funnel_out where step_no=1) = 100);
select test_harness.check('R2 step2 rate 0.800', (select rate_from_prev from funnel_out where step_no=2) = 0.800);
select test_harness.check('R3 path_chosen_* summed (60), rate 0.750', (select n = 60 and rate_from_prev = 0.750 from funnel_out where step_no=3));
select test_harness.check('R4 first_manager n=6 rate 0.750', (select n = 6 and rate_from_prev = 0.750 from funnel_out where step_no=11));
select test_harness.check('R5 followers_100B (4) suppressed, n and rate NULL', (select n is null and rate_from_prev is null and suppressed from funnel_out where step_no=12));
select test_harness.check('R6 rate after a suppressed step is NULL', (select rate_from_prev is null from funnel_out where step_no=13));
truncate public.anon_stats_events;
