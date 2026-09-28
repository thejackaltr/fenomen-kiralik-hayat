#!/usr/bin/env bash
# LOCAL, THROWAWAY test run for the v2.1 anon stats migration. Never points at a real database:
# it creates its own temporary cluster (unix socket only, no TCP listen) and deletes it at the end.
# Needs: PostgreSQL 17 binaries + postgresql-17-cron; optional: PostgREST binary ($PGRST_BIN) and
# a dir with node_modules/@supabase/supabase-js ($SUPABASE_JS_DIR) for the REST/supabase-js part.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; SB="$(cd "$HERE/.." && pwd)"
PGBIN="${PGBIN:-/usr/lib/postgresql/17/bin}"
WORK="${WORK:-/tmp/fenomen-pgtest}"; DATA="$WORK/cluster"; SOCK="$WORK/sock"; PORT="${PORT:-55432}"
PGRST_BIN="${PGRST_BIN:-$WORK/bin/postgrest}"; SUPABASE_JS_DIR="${SUPABASE_JS_DIR:-$WORK/js}"
MIG="$SB/migrations/20260928150000_v2_1_anon_stats_events.sql"
DOWN="$SB/rollback/20260928150000_v2_1_anon_stats_events_down.sql"
FAILS=0
psqlx() { local db="$1" user="$2"; shift 2; "$PGBIN/../bin/psql" -X -h "$SOCK" -p "$PORT" -U "$user" -d "$db" "$@"; }
step() { echo; echo "######## $*"; }
expect_rc() { local want="$1" got="$2" label="$3"; if [ "$got" = "$want" ]; then echo "PASS  $label (exit $got)"; else echo "FAIL  $label (exit $got, want $want)"; FAILS=$((FAILS+1)); fi; }

cleanup() { "$PGBIN/pg_ctl" -D "$DATA" -m fast stop >/dev/null 2>&1; [ -n "${PGRST_PID:-}" ] && kill "$PGRST_PID" 2>/dev/null; [ "${KEEP:-0}" = 1 ] || rm -rf "$DATA" "$SOCK"; }
trap cleanup EXIT

step "0. throwaway cluster ($("$PGBIN/postgres" --version))"
rm -rf "$DATA" "$SOCK"; mkdir -p "$SOCK"
"$PGBIN/initdb" -D "$DATA" -U supabase_admin --auth=trust -E UTF8 --locale=C.UTF-8 >/dev/null || exit 2
cat >> "$DATA/postgresql.conf" <<CONF
listen_addresses = ''
unix_socket_directories = '$SOCK'
port = $PORT
shared_preload_libraries = 'pg_cron'
cron.database_name = 'fenomen_test'
cron.use_background_workers = on
max_worker_processes = 20
CONF
"$PGBIN/pg_ctl" -D "$DATA" -l "$WORK/pg.log" -w start >/dev/null || { cat "$WORK/pg.log"; exit 2; }
psqlx postgres supabase_admin -qc "create database fenomen_test" -c "create database fenomen_nocron"
for f in 00_stub_supabase.sql 01_stub_pg_cron.sql 02_test_harness.sql; do psqlx fenomen_test supabase_admin -q -f "$HERE/$f" || exit 2; done
psqlx fenomen_test supabase_admin -Atc "select 'postgres role: superuser=' || rolsuper || ' bypassrls=' || rolbypassrls from pg_roles where rolname='postgres'"

step "1. apply migration as role postgres (atomic, psql -1)"
psqlx fenomen_test postgres -1 -v ON_ERROR_STOP=1 -f "$MIG"; expect_rc 0 $? "migration applies"

step "2. privilege / RLS / CHECK / cleanup tests"
psqlx fenomen_test supabase_admin -f "$HERE/10_anon_stats_tests.sql" 2>&1; expect_rc 0 $? "10_anon_stats_tests.sql ran to the end"

step "3. pg_cron job + live run"
psqlx fenomen_test supabase_admin -f "$HERE/20_pg_cron_test.sql" 2>&1; expect_rc 0 $? "20_pg_cron_test.sql ran to the end"

step "4. funnel report (reports/v2.1-funnel.sql)"
REPORT_FILE="$SB/reports/v2.1-funnel.sql" psqlx fenomen_test supabase_admin -f "$HERE/30_funnel_report_test.sql" 2>&1; expect_rc 0 $? "30_funnel_report_test.sql ran to the end"

step "5. re-run migration on an already migrated DB (expected: fails atomically, nothing changes)"
psqlx fenomen_test supabase_admin -qc "insert into public.anon_stats_events(event,version,device_class,play_bucket) values ('first_video','2.1.0','mobil','0-10')"
echo "-- state before:"; psqlx fenomen_test supabase_admin -f "$HERE/40_state_checks.sql"
psqlx fenomen_test postgres -1 -v ON_ERROR_STOP=1 -f "$MIG" 2>&1; expect_rc 3 $? "second run fails (psql exit 3 = script error)"
echo "-- state after:"; psqlx fenomen_test supabase_admin -f "$HERE/40_state_checks.sql"

step "6. rollback (twice = idempotent), then re-apply"
psqlx fenomen_test postgres -1 -v ON_ERROR_STOP=1 -f "$DOWN" 2>&1; expect_rc 0 $? "rollback #1"
psqlx fenomen_test supabase_admin -f "$HERE/40_state_checks.sql"
psqlx fenomen_test postgres -1 -v ON_ERROR_STOP=1 -f "$DOWN" 2>&1; expect_rc 0 $? "rollback #2 (nothing left, still clean)"
psqlx fenomen_test postgres -1 -v ON_ERROR_STOP=1 -f "$MIG" 2>&1; expect_rc 0 $? "re-apply after rollback"
psqlx fenomen_test postgres -1 -v ON_ERROR_STOP=1 -f "$SB/ops/anon_stats_schedule_cleanup.sql" 2>&1; expect_rc 0 $? "ops/anon_stats_schedule_cleanup.sql re-schedules (no duplicate job)"
psqlx fenomen_test supabase_admin -f "$HERE/40_state_checks.sql"

step "7. database WITHOUT pg_cron (migration must still apply, with a NOTICE)"
for f in 00_stub_supabase.sql 02_test_harness.sql; do psqlx fenomen_nocron supabase_admin -q -f "$HERE/$f" || exit 2; done
psqlx fenomen_nocron postgres -1 -v ON_ERROR_STOP=1 -f "$MIG" 2>&1; expect_rc 0 $? "migration applies without pg_cron"
psqlx fenomen_nocron supabase_admin -f "$HERE/40_state_checks.sql"
psqlx fenomen_nocron supabase_admin -qc "select test_harness.check('N1 no pg_cron: table + RLS forced + 3 policies exist', (select relforcerowsecurity from pg_class where oid = to_regclass('public.anon_stats_events')) and (select count(*) from pg_policies where tablename = 'anon_stats_events') = 3)"
psqlx fenomen_nocron supabase_admin -qc "set role anon" -c "select test_harness.expect_ok('N2 no pg_cron: anon insert works', \$\$insert into public.anon_stats_events(event,version,device_class,play_bucket) values ('first_video','2.1.0','mobil','0-10')\$\$)" -c "select test_harness.expect_error('N3 no pg_cron: anon select denied', 'select * from public.anon_stats_events', '42501')"
psqlx fenomen_nocron supabase_admin -qc "set role postgres" -c "select test_harness.check('N4 no pg_cron: manual cleanup call works (0 expired)', public.anon_stats_cleanup() = 0)"
psqlx fenomen_nocron postgres -1 -v ON_ERROR_STOP=1 -f "$SB/ops/anon_stats_schedule_cleanup.sql" 2>&1; expect_rc 3 $? "ops schedule script errors clearly without pg_cron"
psqlx fenomen_nocron postgres -1 -v ON_ERROR_STOP=1 -f "$DOWN" 2>&1; expect_rc 0 $? "rollback without pg_cron"

step "8. PostgREST + supabase-js (exact Frontend contract)"
if [ -x "$PGRST_BIN" ] && [ -d "$SUPABASE_JS_DIR/node_modules/@supabase/supabase-js" ]; then
  "$PGRST_BIN" --version
  PGRST_DB_URI="postgres://authenticator@/fenomen_test?host=$SOCK&port=$PORT" PGRST_DB_SCHEMAS=public \
  PGRST_DB_ANON_ROLE=anon PGRST_SERVER_HOST=127.0.0.1 PGRST_SERVER_PORT=53000 PGRST_LOG_LEVEL=warn \
    "$PGRST_BIN" >"$WORK/postgrest.log" 2>&1 & PGRST_PID=$!
  for i in $(seq 1 50); do curl -s -o /dev/null "http://127.0.0.1:53000/" && break; sleep 0.2; done
  echo "-- raw REST shape (direct to PostgREST; on Supabase prefix /rest/v1 and add apikey header):"
  code=$(curl -s -o "$WORK/body" -w '%{http_code}' -X POST "http://127.0.0.1:53000/anon_stats_events" \
    -H 'apikey: PLACEHOLDER_ANON_KEY' -H 'Content-Type: application/json' -H 'Prefer: return=minimal' \
    -d '{"event":"session_start","version":"2.1.0","device_class":"masaustu","play_bucket":"0-10"}')
  echo "POST return=minimal -> $code body='$(cat "$WORK/body")'"; [ "$code" = 201 ] && [ ! -s "$WORK/body" ] && echo "PASS  K1 REST insert 201, empty body" || { echo "FAIL  K1"; FAILS=$((FAILS+1)); }
  code=$(curl -s -o "$WORK/body" -w '%{http_code}' -X POST "http://127.0.0.1:53000/anon_stats_events" \
    -H 'Content-Type: application/json' -H 'Prefer: return=representation' \
    -d '{"event":"session_start","version":"2.1.0","device_class":"masaustu","play_bucket":"0-10"}')
  echo "POST return=representation -> $code $(cat "$WORK/body")"; [ "$code" = 401 ] && echo "PASS  K2 return=representation refused" || { echo "FAIL  K2"; FAILS=$((FAILS+1)); }
  code=$(curl -s -o "$WORK/body" -w '%{http_code}' -X POST "http://127.0.0.1:53000/anon_stats_events" \
    -H 'Content-Type: application/json' -H 'Prefer: return=minimal' \
    -d '{"event":"first_video","version":"2.1.0","device_class":"mobil","play_bucket":"999"}')
  echo "POST bad play_bucket -> $code $(cat "$WORK/body")"; [ "$code" = 400 ] && echo "PASS  K3 CHECK -> 400" || { echo "FAIL  K3"; FAILS=$((FAILS+1)); }
  code=$(curl -s -o "$WORK/body" -w '%{http_code}' "http://127.0.0.1:53000/anon_stats_events?select=*")
  echo "GET -> $code $(cat "$WORK/body")"; [ "$code" = 401 ] && echo "PASS  K4 GET refused" || { echo "FAIL  K4"; FAILS=$((FAILS+1)); }
  SUPABASE_JS_DIR="$SUPABASE_JS_DIR" PGRST_PORT=53000 PROXY_PORT=53001 node --experimental-websocket "$HERE/60_rest_supabase_js_test.mjs"; expect_rc 0 $? "supabase-js contract test"
  psqlx fenomen_test supabase_admin -Atc "select 'rows written via REST: ' || count(*) from public.anon_stats_events"
  kill "$PGRST_PID" 2>/dev/null; PGRST_PID=
else
  echo "SKIPPED: PostgREST ($PGRST_BIN) or supabase-js ($SUPABASE_JS_DIR) not available"
fi

step "9. final rollback on test DB"
psqlx fenomen_test postgres -1 -v ON_ERROR_STOP=1 -f "$DOWN" 2>&1; expect_rc 0 $? "final rollback"

step "SUMMARY"
for db in fenomen_test fenomen_nocron; do
  psqlx "$db" supabase_admin -Atc "select '$db SQL assertions: ' || count(*) filter (where ok) || ' PASS, ' || count(*) filter (where not ok) || ' FAIL' from test_harness.results"
  n=$(psqlx "$db" supabase_admin -Atc "select count(*) from test_harness.results where not ok"); FAILS=$((FAILS+n))
  psqlx "$db" supabase_admin -Atc "select 'FAILED: ' || label || ' :: ' || detail from test_harness.results where not ok"
done
echo "shell-level FAIL count (incl. SQL): $FAILS"
[ "$FAILS" = 0 ] && echo "RESULT: ALL PASS" || echo "RESULT: FAILURES"
exit $([ "$FAILS" = 0 ] && echo 0 || echo 1)
