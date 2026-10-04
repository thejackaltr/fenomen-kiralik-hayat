#!/usr/bin/env bash
# Fenomen v2.2 bulut kayıt — LOCAL, THROWAWAY SQL test run. Never touches a real database or network host:
# own temporary PostgreSQL 17 cluster (unix socket only, no TCP), deleted at the end (KEEP=1 keeps it).
# Needs: PG17 binaries + postgresql-17-cron. Result file: $OUT (default supabase/tests/v2_2/results/sql-local-run.txt via tee).
#   bash supabase/tests/v2_2/run-local.sh 2>&1 | tee supabase/tests/v2_2/results/sql-local-run.txt
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; SB="$(cd "$HERE/../.." && pwd)"
PGBIN="${PGBIN:-/usr/lib/postgresql/17/bin}"
WORK="${WORK:-/tmp/fenomen-v22-sqltest}"; DATA="$WORK/cluster"; SOCK="$WORK/sock"; PORT="${PORT:-55462}"
MIG="$SB/migrations/20260929193000_v2_2_fenomen_cloud_save.sql"
RB="$SB/rollback/20260929193000_v2_2_fenomen_cloud_save.rollback.sql"
PRE="$SB/ops/v2_2_cloud_save_preflight_readonly.sql"; VER="$SB/ops/v2_2_cloud_save_verify.sql"
CNT="$SB/ops/inactive_accounts_count.sql"
CRON_B="$SB/ops/v2_2_backup_cleanup_pg_cron.sql"; CRON_B_RB="$SB/ops/v2_2_backup_cleanup_pg_cron.rollback.sql"
CRON_P="$SB/ops/v2_2_inactive_purge_pg_cron.sql"; CRON_P_RB="$SB/ops/v2_2_inactive_purge_pg_cron.rollback.sql"
CRON_D="$SB/ops/v2_2_deletion_log_cleanup_pg_cron.sql"; CRON_D_RB="$SB/ops/v2_2_deletion_log_cleanup_pg_cron.rollback.sql"
# counter (sayaç) schema = what origin/main ships (v2.1 anon_stats_events); optional 2nd variant = plans/fenomen-telemetry (read only)
COUNTER1="$SB/migrations/20260928150000_v2_1_anon_stats_events.sql"
COUNTER2="${COUNTER2:-/workspace/plans/fenomen-telemetry/01_stats_table.sql}"
unset PGHOST PGHOSTADDR PGPORT PGUSER PGPASSWORD PGDATABASE PGSERVICE DATABASE_URL SUPABASE_DB_URL DB_URL || true
FAILS=0; PASS=0; TOTAL=0
ok_()  { TOTAL=$((TOTAL+1)); PASS=$((PASS+1)); echo "PASS  $1"; }
bad_() { TOTAL=$((TOTAL+1)); FAILS=$((FAILS+1)); echo "FAIL  $1"; }
chk()  { if eval "$2"; then ok_ "$1"; else bad_ "$1 ${3:-}"; fi; }
psqlx() { local db="$1" user="$2"; shift 2; "$PGBIN/psql" -X -h "$SOCK" -p "$PORT" -U "$user" -d "$db" "$@"; }
q()     { psqlx "$1" supabase_admin -Atc "$2"; }
ro()    { PGOPTIONS='-c default_transaction_read_only=on' psqlx "$@"; }
step()  { echo; echo "######## $*"; }
dump_schema() { "$PGBIN/pg_dump" -h "$SOCK" -p "$PORT" -U supabase_admin --schema-only -n public -n auth -n fenomen_private "$1" | grep -v -E '^(--|\\restrict|\\unrestrict)' | sed '/^$/d'; }
dump_data()   { "$PGBIN/pg_dump" -h "$SOCK" -p "$PORT" -U supabase_admin --data-only -n public -n auth -n fenomen_private "$1" | grep -v -E '^(--|\\restrict|\\unrestrict|SET |SELECT pg_catalog)' | sed '/^$/d' | sort; }
dump_counter() {  # every anon_stats* table (schema + data + grants + policies) and function (definition md5 + ACL)
  "$PGBIN/pg_dump" -h "$SOCK" -p "$PORT" -U supabase_admin -t 'public.anon_stats*' "$1" | grep -v -E '^(--|\\restrict|\\unrestrict)' | sed '/^$/d'
  q "$1" "select p.oid::regprocedure || ' ' || md5(pg_get_functiondef(p.oid)) || ' ' || coalesce(p.proacl::text, '') from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'anon\_stats%' order by 1"; }
cleanup() { "$PGBIN/pg_ctl" -D "$DATA" -m fast stop >/dev/null 2>&1; [ "${KEEP:-0}" = 1 ] || rm -rf "$DATA" "$SOCK"; }
trap cleanup EXIT
mkdir -p "$WORK"; OUTD="$WORK/out"; rm -rf "$OUTD"; mkdir -p "$OUTD"

step "0. throwaway cluster ($("$PGBIN/postgres" --version)), socket $SOCK only"
rm -rf "$DATA" "$SOCK"; mkdir -p "$SOCK"
"$PGBIN/initdb" -D "$DATA" -U supabase_admin --auth=trust -E UTF8 --locale=C.UTF-8 >/dev/null || exit 2
cat >> "$DATA/postgresql.conf" <<CONF
listen_addresses = ''
unix_socket_directories = '$SOCK'
port = $PORT
timezone = 'UTC'
shared_preload_libraries = 'pg_cron'
cron.database_name = 'fen22_cron'
cron.use_background_workers = on
max_worker_processes = 20
CONF
"$PGBIN/pg_ctl" -D "$DATA" -l "$WORK/pg.log" -w start >/dev/null || { cat "$WORK/pg.log"; exit 2; }
newdb() {  # db [counter-file]
  psqlx postgres supabase_admin -qc "drop database if exists $1 with (force)" -c "create database $1" >/dev/null
  psqlx "$1" supabase_admin -q -v ON_ERROR_STOP=1 -f "$HERE/00_stub_supabase.sql" >/dev/null || exit 2
  psqlx "$1" supabase_admin -q -v ON_ERROR_STOP=1 -f "$HERE/01_harness.sql" >/dev/null || exit 2
  if [ -n "${2:-}" ]; then psqlx "$1" postgres -q -v ON_ERROR_STOP=1 -f "$2" >/dev/null 2>&1 || { echo "counter base $2 failed"; exit 2; }
    q "$1" "insert into public.anon_stats_events (event, version, device_class, play_bucket) values ('first_video', '2.1.0', 'mobil', '0-10')" >/dev/null 2>&1 || true; fi
}
newdb fen22_main "$COUNTER1"
chk "base: counter table public.anon_stats_events present (origin/main v2.1 migration) with 1 row" '[ "$(q fen22_main "select count(*) from public.anon_stats_events")" = 1 ]'
q fen22_main "select 'postgres: super=' || rolsuper || ' bypassrls=' || rolbypassrls from pg_roles where rolname = 'postgres'"

step "1. preflight (read-only session) on a fresh Fenomen-like DB"
ro fen22_main postgres -v ON_ERROR_STOP=1 -f "$PRE" > "$OUTD/pre1.out" 2>&1; rc=$?
chk "preflight runs in a READ ONLY session (exit $rc)" '[ $rc = 0 ]'
chk "preflight: target OK, v2.2 not applied, auth.users present" 'grep -q "OK: no kodhane_saves" "$OUTD/pre1.out" && grep -q "not applied (expected" "$OUTD/pre1.out"'
chk "preflight section 4 (name clashes): 0 rows before the migration" 'grep -q "^(0 rows)" "$OUTD/pre1.out"'
sed -n '/auth_schema_exists/,/row)/p' "$OUTD/pre1.out"

step "2. wrong target (DB with public.kodhane_saves): preflight + migration refuse"
newdb fen22_wrong; q fen22_wrong "create table public.kodhane_saves (user_id uuid)" >/dev/null
ro fen22_wrong postgres -v ON_ERROR_STOP=1 -f "$PRE" > "$OUTD/pre2.out" 2>&1; rc=$?
chk "preflight stops on the wrong target (exit $rc) with WRONG TARGET" '[ $rc != 0 ] && grep -q "WRONG TARGET" "$OUTD/pre2.out"'
psqlx fen22_wrong postgres -v ON_ERROR_STOP=1 -f "$MIG" > "$OUTD/mig-wrong.out" 2>&1; rc=$?
chk "migration refuses the wrong target (exit $rc) and creates nothing" '[ $rc != 0 ] && grep -q "WRONG TARGET" "$OUTD/mig-wrong.out" && [ "$(q fen22_wrong "select count(*) from pg_proc where proname like '"'"'%fenomen%'"'"'") + $(q fen22_wrong "select count(*) from pg_class where relname like '"'"'fenomen%'"'"'")" = "0 + 0" ]'

step "3. migration twice (idempotent), as postgres"
dump_schema fen22_main > "$OUTD/schema.before"; dump_counter fen22_main > "$OUTD/counter.before"
psqlx fen22_main postgres -v ON_ERROR_STOP=1 -f "$MIG" > "$OUTD/mig1.out" 2>&1; rc=$?
chk "migration #1 (exit $rc)" '[ $rc = 0 ]' "$(grep ERROR "$OUTD/mig1.out")"
dump_schema fen22_main > "$OUTD/schema.once"
q fen22_main "insert into public.fenomen_saves (user_id, data) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '{\"probe\":1}')" >/dev/null
psqlx fen22_main postgres -v ON_ERROR_STOP=1 -f "$MIG" > "$OUTD/mig2.out" 2>&1; rc=$?
chk "migration #2 (exit $rc)" '[ $rc = 0 ]' "$(grep ERROR "$OUTD/mig2.out")"
dump_schema fen22_main > "$OUTD/schema.twice"
chk "schema after 2nd run == after 1st run (pg_dump public+auth, $(wc -l < "$OUTD/schema.once") lines)" 'diff -u "$OUTD/schema.once" "$OUTD/schema.twice" > "$OUTD/idem.diff"'
chk "row written between the runs survives the 2nd run" '[ "$(q fen22_main "select data->>'"'"'probe'"'"' from public.fenomen_saves")" = 1 ]'
q fen22_main "delete from public.fenomen_saves" >/dev/null
chk "migration scheduled nothing (no pg_cron job) and ran no cleanup" '[ "$(q fen22_main "select count(*) from pg_extension where extname = '"'"'pg_cron'"'"'")" = 0 ]'

step "4. verify (read-only)"
ro fen22_main postgres -v ON_ERROR_STOP=1 -f "$VER" > "$OUTD/ver1.out" 2>&1; rc=$?
chk "verify passes (exit $rc): $(grep -o 'VERIFY OK: [0-9/]*' "$OUTD/ver1.out")" '[ $rc = 0 ] && grep -q "VERIFY OK: 18/18" "$OUTD/ver1.out"' "$(cat "$OUTD/ver1.out")"
ro fen22_main postgres -v ON_ERROR_STOP=1 -f "$PRE" > "$OUTD/pre3.out" 2>&1; rc=$?
chk "preflight after apply still read-only OK, reports ALREADY PRESENT (exit $rc)" '[ $rc = 0 ] && grep -q "ALREADY PRESENT" "$OUTD/pre3.out"'

step "5. SQL tests (RLS, anon, revision/409, size, reset + backups, 30-day cleanup, delete account, 24-month purge)"
psqlx fen22_main supabase_admin -f "$HERE/10_tests.sql" > "$OUTD/t10.out" 2>&1
ro fen22_main postgres -v ON_ERROR_STOP=1 -At -F '|' -f "$CNT" > "$OUTD/count.out" 2>&1; rc=$?
chk "inactive_accounts_count.sql runs in a READ ONLY session (exit $rc)" '[ $rc = 0 ]' "$(cat "$OUTD/count.out")"
echo "count query output: $(cat "$OUTD/count.out")"
chk "count query output has no e-mail / uuid" '! grep -qE "@|[0-9a-f]{8}-[0-9a-f]{4}-" "$OUTD/count.out"'
IFS='|' read -r c_int c_cut c_tot c_acc c_sav c_bak c_aud c_bm c_first c_rs c_rsv < "$OUTD/count.out"
q fen22_main "create table t.count_before as select $c_acc::int as accounts_to_delete, $c_sav::int as saves_to_delete, $c_bak::int as backups_to_delete, $c_aud::int as audit_entries_to_delete, $c_first::int as accounts_first_run, $c_bm::int as batch_max; grant select on t.count_before to public" >/dev/null
psqlx fen22_main supabase_admin -f "$HERE/11_purge_tests.sql" > "$OUTD/t11.out" 2>&1
grep -hE "(PASS|FAIL) " "$OUTD/t10.out" "$OUTD/t11.out" | sed -E 's/^psql:[^ ]* NOTICE:  //'
grep -hE "ERROR" "$OUTD/t10.out" "$OUTD/t11.out" | grep -v "NOTICE" | head -5
SQLP=$(q fen22_main "select count(*) filter (where pass) from t.results"); SQLT=$(q fen22_main "select count(*) from t.results")
chk "SQL assertions: $SQLP/$SQLT" '[ "$SQLP" = "$SQLT" ] && [ "$SQLT" -ge 80 ]'

step "6. counter (sayaç) untouched by migration + tests"
dump_counter fen22_main > "$OUTD/counter.after"
chk "anon_stats_* tables (schema+data+grants+policies) and functions byte-identical ($(wc -l < "$OUTD/counter.before") lines)" 'diff -u "$OUTD/counter.before" "$OUTD/counter.after" > "$OUTD/counter.diff"'

step "7. rollback: guard, rollback x2, schema == before, counter unchanged"
psqlx fen22_main postgres -v ON_ERROR_STOP=1 -f "$RB" > "$OUTD/rb0.out" 2>&1; rc=$?
chk "rollback without fenomen.v22_allow_data_loss=on refuses (exit $rc) and drops nothing" '[ $rc != 0 ] && grep -q "refusing" "$OUTD/rb0.out" && [ "$(q fen22_main "select to_regclass('"'"'public.fenomen_saves'"'"') is not null")" = t ]'
PGOPTIONS='-c fenomen.v22_allow_data_loss=on' psqlx fen22_main postgres -v ON_ERROR_STOP=1 -f "$RB" > "$OUTD/rb1.out" 2>&1; rc1=$?
PGOPTIONS='-c fenomen.v22_allow_data_loss=on' psqlx fen22_main postgres -v ON_ERROR_STOP=1 -f "$RB" > "$OUTD/rb2.out" 2>&1; rc2=$?
chk "rollback #1 and #2 (idempotent) succeed (exit $rc1/$rc2)" '[ $rc1 = 0 ] && [ $rc2 = 0 ]' "$(cat "$OUTD/rb1.out" "$OUTD/rb2.out")"
dump_schema fen22_main > "$OUTD/schema.after"
chk "pg_dump --schema-only (public+auth) after rollback == before migration (diff empty)" 'diff -u "$OUTD/schema.before" "$OUTD/schema.after" > "$OUTD/rollback.diff"'
dump_counter fen22_main > "$OUTD/counter.after_rb"
chk "counter objects after rollback byte-identical to before" 'diff -u "$OUTD/counter.before" "$OUTD/counter.after_rb" > "$OUTD/counter_rb.diff"'
ro fen22_main postgres -v ON_ERROR_STOP=1 -f "$VER" > "$OUTD/ver2.out" 2>&1; rc=$?
chk "verify fails after rollback (negative control, exit $rc)" '[ $rc != 0 ]'

step "8. clean round trip (other counter variant: plans/fenomen-telemetry/01_stats_table.sql if present): migrate -> rollback, schema + data identical"
if [ -f "$COUNTER2" ]; then newdb fen22_rt "$COUNTER2"; else newdb fen22_rt "$COUNTER1"; fi
dump_schema fen22_rt > "$OUTD/rt.schema.before"; dump_data fen22_rt > "$OUTD/rt.data.before"; dump_counter fen22_rt > "$OUTD/rt.counter.before"
psqlx fen22_rt postgres -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null 2>&1; rc=$?
ro fen22_rt postgres -v ON_ERROR_STOP=1 -f "$VER" > "$OUTD/rt.ver.out" 2>&1; rcv=$?
chk "migration + verify on the 2nd counter variant (exit $rc/$rcv)" '[ $rc = 0 ] && [ $rcv = 0 ]' "$(tail -3 "$OUTD/rt.ver.out")"
PGOPTIONS='-c fenomen.v22_allow_data_loss=on' psqlx fen22_rt postgres -v ON_ERROR_STOP=1 -f "$RB" >/dev/null 2>&1
dump_schema fen22_rt > "$OUTD/rt.schema.after"; dump_data fen22_rt > "$OUTD/rt.data.after"; dump_counter fen22_rt > "$OUTD/rt.counter.after"
chk "round trip: schema identical" 'diff -u "$OUTD/rt.schema.before" "$OUTD/rt.schema.after" > "$OUTD/rt.schema.diff"'
chk "round trip: all public/auth data identical" 'diff -u "$OUTD/rt.data.before" "$OUTD/rt.data.after" > "$OUTD/rt.data.diff"'
chk "round trip: counter objects identical" 'diff -u "$OUTD/rt.counter.before" "$OUTD/rt.counter.after" > "$OUTD/rt.counter.diff"'

step "9. pg_cron ops files (separate approval steps) in db fen22_cron"
newdb fen22_cron "$COUNTER1"
psqlx fen22_cron postgres -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null 2>&1
dump_schema fen22_cron > "$OUTD/cron.schema.migrated"
# like Supabase: the admin makes pg_cron available to postgres (plain PG needs superuser for CREATE EXTENSION pg_cron)
q fen22_cron "create extension if not exists pg_cron; grant usage on schema cron to postgres; grant all on all tables in schema cron to postgres" >/dev/null
jobs() { q fen22_cron "select coalesce(string_agg(jobname || '|' || schedule || '|' || command || '|' || username || '|' || active, ';' order by jobname), '') from cron.job where jobname like 'fenomen\_%'"; }
for f in "$CRON_B" "$CRON_B" "$CRON_P" "$CRON_P" "$CRON_D" "$CRON_D"; do psqlx fen22_cron postgres -v ON_ERROR_STOP=1 -f "$f" > "$OUTD/cron.out" 2>&1 || { bad_ "ops $(basename "$f")"; cat "$OUTD/cron.out"; }; done
J=$(jobs); echo "jobs: $J"
chk "each ops file run twice -> exactly one job each, UTC 47 0 (03:47 TSİ) / 17 1 (04:17 TSİ) / 47 1 (04:47 TSİ), as postgres" \
  '[ "$J" = "fenomen_deletion_log_cleanup|47 1 * * *|select public.fenomen_cleanup_deletion_log()|postgres|true;fenomen_inactive_accounts_purge|17 1 * * *|select * from public.fenomen_purge_inactive_accounts()|postgres|true;fenomen_save_backups_cleanup|47 0 * * *|select public.fenomen_cleanup_save_backups()|postgres|true" ]'
# live: the exact job commands, every second, as postgres
q fen22_cron "insert into auth.users (id, created_at, last_sign_in_at) values ('eeeeeeee-0000-4000-8000-000000000001', now() - interval '3 years', now() - interval '25 months'), ('eeeeeeee-0000-4000-8000-000000000002', now(), now())" >/dev/null
q fen22_cron "insert into public.fenomen_save_backups (user_id, revision, save_version, data, created_at) values ('eeeeeeee-0000-4000-8000-000000000002', 1, 1, '{}', now() - interval '31 days'), ('eeeeeeee-0000-4000-8000-000000000002', 1, 1, '{}', now() - interval '29 days')" >/dev/null
q fen22_cron "insert into fenomen_private.deletion_log (user_id, deleted_at, approval_ref) values ('eeeeeeee-0000-4000-8000-0000000000d1', now() - interval '46 days', 'info:FD-OLD'), ('eeeeeeee-0000-4000-8000-0000000000d2', now() - interval '44 days', 'info:FD-KEEP')" >/dev/null
psqlx fen22_cron postgres -qAtc "select cron.schedule('fenomen_live_b', '1 seconds', 'select public.fenomen_cleanup_save_backups()'), cron.schedule('fenomen_live_p', '1 seconds', 'select * from public.fenomen_purge_inactive_accounts()'), cron.schedule('fenomen_live_d', '1 seconds', 'select public.fenomen_cleanup_deletion_log()')" >/dev/null
st=""; for i in $(seq 1 40); do st=$(q fen22_cron "select string_agg(distinct j.jobname || ':' || d.status, ',' order by j.jobname || ':' || d.status) from cron.job_run_details d join cron.job j using (jobid) where j.jobname like 'fenomen_live_%' and d.status in ('succeeded', 'failed')"); [[ "$st" == *fenomen_live_b* && "$st" == *fenomen_live_p* && "$st" == *fenomen_live_d* ]] && break; sleep 0.5; done
psqlx fen22_cron postgres -qAtc "select cron.unschedule('fenomen_live_b'), cron.unschedule('fenomen_live_p'), cron.unschedule('fenomen_live_d')" >/dev/null
chk "pg_cron live run of the three job commands as postgres: $st" '[ "$st" = "fenomen_live_b:succeeded,fenomen_live_d:succeeded,fenomen_live_p:succeeded" ]' "$(q fen22_cron "select string_agg(return_message, ' | ') from cron.job_run_details where status = 'failed'")"
LIVE=$(q fen22_cron "select (select count(*) from public.fenomen_save_backups where created_at < now() - interval '30 days') || '|' || (select count(*) from public.fenomen_save_backups) || '|' || (select count(*) from auth.users where id = 'eeeeeeee-0000-4000-8000-000000000001') || '|' || (select count(*) from auth.users where id = 'eeeeeeee-0000-4000-8000-000000000002')")
chk "live run: 31-day backup deleted, 29-day kept, 25-month-inactive account deleted, active one kept [$LIVE]" '[ "$LIVE" = "0|1|0|1" ]'
DL=$(q fen22_cron "select string_agg(approval_ref, ',' order by approval_ref) from fenomen_private.deletion_log")
chk "live run: deletion list 46-day row deleted, 44-day row kept, purged account listed as purge:24m:<date> [$DL]" '[[ "$DL" =~ ^info:FD-KEEP,purge:24m:[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]'
psqlx fen22_cron postgres -v ON_ERROR_STOP=1 -f "$CRON_B_RB" >/dev/null 2>&1 && psqlx fen22_cron postgres -v ON_ERROR_STOP=1 -f "$CRON_B_RB" >/dev/null 2>&1
psqlx fen22_cron postgres -v ON_ERROR_STOP=1 -f "$CRON_D_RB" >/dev/null 2>&1 && psqlx fen22_cron postgres -v ON_ERROR_STOP=1 -f "$CRON_D_RB" >/dev/null 2>&1
chk "backup-cleanup and deletion-list-cleanup ops rollbacks (x2 each) remove only their jobs" '[ "$(jobs)" = "fenomen_inactive_accounts_purge|17 1 * * *|select * from public.fenomen_purge_inactive_accounts()|postgres|true" ]'
psqlx fen22_cron postgres -v ON_ERROR_STOP=1 -f "$CRON_B" >/dev/null 2>&1; psqlx fen22_cron postgres -v ON_ERROR_STOP=1 -f "$CRON_D" >/dev/null 2>&1
PGOPTIONS='-c fenomen.v22_allow_data_loss=on' psqlx fen22_cron postgres -v ON_ERROR_STOP=1 -f "$RB" > "$OUTD/cron.rb.out" 2>&1; rc=$?
chk "migration rollback with all three jobs scheduled: exit $rc, no fenomen job left" '[ $rc = 0 ] && [ -z "$(jobs)" ]' "$(cat "$OUTD/cron.rb.out")"
psqlx fen22_cron postgres -v ON_ERROR_STOP=1 -f "$CRON_P_RB" >/dev/null 2>&1; rc=$?
chk "purge ops rollback when the job is already gone: no-op (exit $rc)" '[ $rc = 0 ]'

step "SUMMARY"
q fen22_main "select 'FAILED: ' || name || ' :: ' || coalesce(info, '') from t.results where not pass"
echo "SQL assertions (10_tests.sql + 11_purge_tests.sql): $SQLP/$SQLT PASS"
echo "runner checks (incl. the SQL line): $PASS/$TOTAL PASS"
[ "$FAILS" = 0 ] && echo "RESULT: ALL PASS" || echo "RESULT: FAILURES ($FAILS)"
exit $([ "$FAILS" = 0 ] && echo 0 || echo 1)
