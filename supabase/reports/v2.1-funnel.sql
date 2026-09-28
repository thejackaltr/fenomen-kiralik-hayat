-- Fenomen v2.1 funnel report (kapsam "Ölçüm: huni"). Read-only. Run as service_role / admin
-- (Studio SQL editor or psql). Edit the params CTE. Counts below min_count are suppressed (NULL),
-- and so is any rate that uses a suppressed count.
with params as (
  select '2.1.0'::text as version,   -- funnels are only compared within one version
         5::bigint     as min_count  -- small-count suppression threshold (config)
),
steps(step_no, step, events) as (values
  ( 1, 'game_open_new',     array['game_open_new']),
  ( 2, 'character_created', array['character_created']),
  ( 3, 'path_chosen_*',     array['path_chosen_vlog', 'path_chosen_oyun', 'path_chosen_luks']),
  ( 4, 'first_video',       array['first_video']),
  ( 5, 'first_edit_game',   array['first_edit_game']),
  ( 6, 'first_shop_buy',    array['first_shop_buy']),
  ( 7, 'first_rent',        array['first_rent']),
  ( 8, 'first_ifsa',        array['first_ifsa']),
  ( 9, 'first_staff',       array['first_staff']),
  (10, 'followers_10B',     array['followers_10B']),
  (11, 'first_manager',     array['first_manager']),
  (12, 'followers_100B',    array['followers_100B']),
  (13, 'first_sell',        array['first_sell']),
  (14, 'first_fame_node',   array['first_fame_node']),
  (15, 'kiraliksiz_hayat',  array['kiraliksiz_hayat'])
),
counts as (
  select s.step_no, s.step, count(e.id) as n
    from steps s
    cross join params p
    left join public.anon_stats_events e
           on e.event = any (s.events) and e.version = p.version
   group by s.step_no, s.step
),
w as (
  select c.*, lag(c.n) over (order by c.step_no) as prev_n from counts c
)
select w.step_no,
       w.step,
       case when w.n < p.min_count then null else w.n end as n,
       case when w.prev_n is null or w.n < p.min_count or w.prev_n < p.min_count or w.prev_n = 0 then null
            else round(w.n::numeric / w.prev_n, 3) end as rate_from_prev,
       (w.n < p.min_count) as suppressed
  from w cross join params p
 order by w.step_no;

-- Optional: play_bucket distribution per event (same suppression), e.g. "first_manager mostly at 30-60?"
-- select event, play_bucket, case when count(*) < 5 then null else count(*) end as n
--   from public.anon_stats_events where version = '2.1.0'
--  group by 1, 2 order by 1, 2;
