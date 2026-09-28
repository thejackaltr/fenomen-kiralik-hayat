-- =============================================================================
-- Fenomen: Kiralık Hayat v2.1: kimliksiz (anonim) ilerleme sayacı
-- Scope: plans/fenomen-v2.1-2.3-kapsam.md, "v2.1 (1) Olaylar" + "Teknik sınır" + "Saklama".
-- KVKK (plans/fenomen-kvkk-arastirma.md §7b): NO identifiers of any kind. No user id, no
-- install/device id, no session id, no IP, no user agent, no free text. Every column is a
-- closed list or a strictly formatted short value. created_at is a DATE (day precision).
-- Day boundary: Europe/Istanbul (TSİ, UTC+3), NOT UTC. "Today" everywhere below is
-- (now() at time zone 'Europe/Istanbul')::date = public.anon_stats_today().
--
-- Apply ATOMICALLY (single transaction), e.g.:
--   psql -1 -v ON_ERROR_STOP=1 -f supabase/migrations/20260928150000_v2_1_anon_stats_events.sql
-- (The Studio SQL editor also runs a multi-statement script as one implicit transaction.)
-- NOT idempotent on purpose: a second run fails at CREATE TABLE (42P07) and, because it is
-- atomic, changes nothing. To re-apply cleanly, run supabase/rollback/...down.sql first.
-- Rollback: supabase/rollback/20260928150000_v2_1_anon_stats_events_down.sql
--
-- Clients (anon key) write with INSERT only and must NOT ask for the row back:
-- supabase-js: .insert({...}) WITHOUT .select(); REST: header "Prefer: return=minimal".
-- (return=representation needs SELECT, which clients do not have -> 401/42501.)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------
create table public.anon_stats_events (
  -- random, not sequential: row ids must not reveal insertion order (day precision only)
  id           uuid not null default gen_random_uuid() primary key,
  event        text not null,
  version      text not null,
  device_class text not null,
  play_bucket  text not null,
  -- server clock, Europe/Istanbul day; clients cannot set it (no column privilege), see grants.
  -- Deliberately the INLINE expression, not public.anon_stats_today(): a column default (like an
  -- RLS policy) is evaluated with the INSERTING role's privileges, so calling the helper would
  -- need EXECUTE for anon/authenticated (tested: without it the insert fails with 42501).
  -- Must stay identical to the helper body; the local tests check for drift.
  created_at   date not null default ((now() at time zone 'Europe/Istanbul')::date),

  -- v2.1 allow-list (kapsam §v2.1 (1)). Changing the list (e.g. follower thresholds in the
  -- game config) needs a new migration that drops/re-adds this constraint.
  constraint anon_stats_events_event_check check (event in (
    'game_open_new',
    'character_created',
    'path_chosen_vlog', 'path_chosen_oyun', 'path_chosen_luks',
    'first_video',
    'first_edit_game',
    'first_shop_buy',
    'first_rent',
    'first_ifsa',
    'first_ifsa_ozur', 'first_ifsa_gormezden',
    'first_staff',
    'first_manager',
    'followers_1B', 'followers_10B', 'followers_100B', 'followers_1M',
    'first_sell',
    'first_fame_node',
    'kiraliksiz_hayat',
    'session_start'
  )),
  -- plain semver only ("2.1.0"); no build sha / timestamp suffix
  constraint anon_stats_events_version_check check (
    char_length(version) between 5 and 11
    and version ~ '^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$'
  ),
  constraint anon_stats_events_device_class_check check (device_class in ('mobil', 'masaustu')),
  constraint anon_stats_events_play_bucket_check check (play_bucket in ('0-10', '10-30', '30-60', '60-120', '120+'))
);

comment on table public.anon_stats_events is
  'Fenomen v2.1 anonymous progress counter. Insert-only for clients. No identifiers, no IP. Rows older than 180 days are deleted daily.';
comment on column public.anon_stats_events.created_at is
  'Server date in Europe/Istanbul (TSİ day boundary, day precision); same expression as public.anon_stats_today(). Not client-settable.';

-- retention cleanup scans by date
create index anon_stats_events_created_at_idx on public.anon_stats_events (created_at);

-- ---------------------------------------------------------------------------
-- 2. Day helper (single source of "today" = Istanbul date) + retention helper (180-day rule)
--    Used by retention/cleanup (owner, security definer) and reports (service_role/admin).
--    NOT executable by anon/authenticated; the column default and the client INSERT policy
--    therefore inline the same expression (see section 1 and 5).
-- ---------------------------------------------------------------------------
create function public.anon_stats_today()
returns date
language sql
stable
set search_path = ''
as $$
  select ((now() at time zone 'Europe/Istanbul')::date);
$$;

comment on function public.anon_stats_today() is
  'Today in Europe/Istanbul (TSİ). Day boundary of anon_stats_events (created_at default, INSERT policy, retention, reports).';

create function public.anon_stats_retention_cutoff()
returns date
language sql
stable
set search_path = ''
as $$
  -- rows with created_at < this date are older than 180 days (Istanbul days)
  select (public.anon_stats_today() - 180);
$$;

-- ---------------------------------------------------------------------------
-- 3. Batch limit: a client request may insert at most 5 rows (contract: send 1)
-- ---------------------------------------------------------------------------
create function public.anon_stats_events_limit_batch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated')
     and (select count(*) from new_rows) > 5 then
    raise exception 'anon_stats_events: at most 5 rows per request'
      using errcode = '23514';  -- check_violation -> HTTP 400 in PostgREST
  end if;
  return null;
end;
$$;

create trigger anon_stats_events_limit_batch
  after insert on public.anon_stats_events
  referencing new table as new_rows
  for each statement
  execute function public.anon_stats_events_limit_batch();

-- ---------------------------------------------------------------------------
-- 4. Privileges: clients get column-level INSERT only. Supabase's default privileges
--    grant ALL on new public tables to anon/authenticated/service_role, so revoke first.
-- ---------------------------------------------------------------------------
revoke all on table public.anon_stats_events from public, anon, authenticated, service_role;

-- only the 4 payload columns; sending id or created_at -> permission denied
grant insert (event, version, device_class, play_bucket)
  on table public.anon_stats_events to anon, authenticated;

-- server-side use (reports / manual cleanup with the service key); no UPDATE, no TRUNCATE
grant select, insert, delete on table public.anon_stats_events to service_role;

-- ---------------------------------------------------------------------------
-- 5. Row Level Security (enabled + forced)
-- ---------------------------------------------------------------------------
alter table public.anon_stats_events enable row level security;
alter table public.anon_stats_events force row level security;

-- clients: INSERT only, and only "today" (Istanbul) rows (defense in depth in case column grants
-- are ever widened: no back-/future-dated rows that would dodge or skew the 180-day cleanup).
-- Inline expression on purpose (= public.anon_stats_today() body): policy expressions run with
-- the client's privileges and anon/authenticated have no EXECUTE on the helper.
create policy anon_stats_events_client_insert
  on public.anon_stats_events
  as permissive
  for insert
  to anon, authenticated
  with check (created_at = ((now() at time zone 'Europe/Istanbul')::date));

-- NO select / update / delete policy for anon or authenticated.

-- Owner (the role running this migration; "postgres" on Supabase) is also subject to RLS
-- because of FORCE. It gets read access (reports) and may delete ONLY expired rows
-- (used by public.anon_stats_cleanup). No UPDATE policy for anyone: events are immutable.
-- service_role (BYPASSRLS) and superusers are not affected by RLS.
create policy anon_stats_events_owner_select
  on public.anon_stats_events
  as permissive
  for select
  to current_user
  using (true);

create policy anon_stats_events_owner_retention_delete
  on public.anon_stats_events
  as permissive
  for delete
  to current_user
  using (created_at < public.anon_stats_retention_cutoff());

-- ---------------------------------------------------------------------------
-- 6. Cleanup function (deletes rows older than 180 days, returns deleted count)
-- ---------------------------------------------------------------------------
create function public.anon_stats_cleanup()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  n bigint;
begin
  delete from public.anon_stats_events
   where created_at < public.anon_stats_retention_cutoff();
  get diagnostics n = row_count;
  return n;
end;
$$;

comment on function public.anon_stats_cleanup() is
  'Deletes anon_stats_events rows older than 180 days. Run daily (pg_cron job fenomen_anon_stats_cleanup).';

-- functions in public are exposed as /rest/v1/rpc/*: lock them down
revoke all on function public.anon_stats_cleanup()             from public, anon, authenticated;
revoke all on function public.anon_stats_retention_cutoff()    from public, anon, authenticated;
revoke all on function public.anon_stats_today()               from public, anon, authenticated;
revoke all on function public.anon_stats_events_limit_batch()  from public, anon, authenticated;
grant execute on function public.anon_stats_cleanup() to service_role;
-- reports (reports/v2.1-funnel.sql) run as service_role and call anon_stats_today()
grant execute on function public.anon_stats_today()           to service_role;
grant execute on function public.anon_stats_retention_cutoff() to service_role;

-- ---------------------------------------------------------------------------
-- 7. Daily schedule via pg_cron, only if the extension is installed.
--    00:17 UTC = 03:17 TSİ (Istanbul is UTC+3 all year, no DST). At that moment the Istanbul
--    date equals the UTC date, and the Istanbul day has started 3h17m earlier, so the job always
--    runs on the "new" Istanbul day. Without pg_cron see supabase/README-v2.1-stats.md.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'fenomen_anon_stats_cleanup') then
      perform cron.unschedule('fenomen_anon_stats_cleanup');
    end if;
    perform cron.schedule('fenomen_anon_stats_cleanup', '17 0 * * *',
                          'select public.anon_stats_cleanup()');
    raise notice 'anon_stats_events: pg_cron job fenomen_anon_stats_cleanup scheduled (17 0 * * * UTC = 03:17 TSİ)';
  else
    raise notice 'anon_stats_events: pg_cron not installed, cleanup NOT scheduled; see supabase/README-v2.1-stats.md';
  end if;
end;
$$;
