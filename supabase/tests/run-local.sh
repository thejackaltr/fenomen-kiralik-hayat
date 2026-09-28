#!/usr/bin/env bash
# LOCAL, THROWAWAY test run for the v2.1 anon stats migration. Never points at a real database:
# it creates its own temporary cluster (unix socket only, no TCP listen) and deletes it at the end.
# Needs: PostgreSQL 17 binaries + postgresql-17-cron; optional: PostgREST binary ($PGRST_BIN) and
# a dir with node_modules/@supabase/supabase-js ($SUPABASE_JS_DIR) for the REST/supabase-js part;
# optional: libfaketime ($FAKETIME_LIB) for the Istanbul day-boundary step (shifted server clock).
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; SB="$(cd "$HERE/.." && pwd)"
PGBIN="${PGBIN:-/usr/lib/postgresql/17/bin}"
WORK="${WORK:-/tmp/fenomen-pgtest}"; DATA="$WORK/cluster"; SOCK="$WORK/sock"; PORT="${PORT:-55432}"
PGRST_BIN="${PGRST_BIN:-$WORK/bin/postgrest}"; SUPABASE_JS_DIR="${SUPABASE_JS_DIR:-$WORK/js}"
FAKETIME_LIB="${FAKETIME_LIB:-/usr/lib/x86_64-linux-gnu/faketime/libfaketimeMT.so.1}"
FDATA="$WORK/fake-cluster"; FSOCK="$WORK/fake-sock"; FPORT="${FPORT:-55433}"
MIG="$SB/migrations/20260928150000_v2_1_anon_stats_events.sql"
DOWN="$SB/rollback/20260928150000_v2_1_anon_stats_events_down.sql"
FAILS=0; SQL_PASS=0; SQL_TOTAL=0; REST_PASS=0; REST_TOTAL=0
rest_check() { REST_TOTAL=$((REST_TOTAL+1)); if [ "$1" = ok ]; then REST_PASS=$((REST_PASS+1)); echo "PASS  $2"; else echo "FAIL  $2"; FAILS=$((FAILS+1)); fi; }
sql_tally() { local sock="$1" port="$2" db="$3" p t; p=$("$PGBIN/psql" -X -h "$sock" -p "$port" -U supabase_admin -d "$db" -Atc "select count(*) filter (where ok) from test_harness.results"); t=$("$PGBIN/psql" -X -h "$sock" -p "$port" -U supabase_admin -d "$db" -Atc "select count(*) from test_harness.results"); SQL_PASS=$((SQL_PASS+p)); SQL_TOTAL=$((SQL_TOTAL+t)); FAILS=$((FAILS+t-p)); echo "$db SQL assertions: $p/$t PASS"; "$PGBIN/psql" -X -h "$sock" -p "$port" -U supabase_admin -d "$db" -Atc "select 'FAILED: ' || label || ' :: ' || detail from test_harness.results where not ok"; }
psqlx() { local db="$1" user="$2"; shift 2; "$PGBIN/../bin/psql" -X -h "$SOCK" -p "$PORT" -U "$user" -d "$db" "$@"; }
step() { echo; echo "######## $*"; }
expect_rc() { local want="$1" got="$2" label="$3"; if [ "$got" = "$want" ]; then echo "PASS  $label (exit $got)"; else echo "FAIL  $label (exit $got, want $want)"; FAILS=$((FAILS+1)); fi; }

cleanup() { "$PGBIN/pg_ctl" -D "$DATA" -m fast stop >/dev/null 2>&1; "$PGBIN/pg_ctl" -D "$FDATA" -m fast stop >/dev/null 2>&1; [ -n "${PGRST_PID:-}" ] && kill "$PGRST_PID" 2>/dev/null; [ "${KEEP:-0}" = 1 ] || rm -rf "$DATA" "$SOCK" "$FDATA" "$FSOCK"; }
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
  echo "POST return=minimal -> $code body='$(cat "$WORK/body")'"; [ "$code" = 201 ] && [ ! -s "$WORK/body" ] && rest_check ok "K1 REST insert 201, empty body" || rest_check fail "K1 REST insert 201, empty body"
  code=$(curl -s -o "$WORK/body" -w '%{http_code}' -X POST "http://127.0.0.1:53000/anon_stats_events" \
    -H 'Content-Type: application/json' -H 'Prefer: return=representation' \
    -d '{"event":"session_start","version":"2.1.0","device_class":"masaustu","play_bucket":"0-10"}')
  echo "POST return=representation -> $code $(cat "$WORK/body")"; [ "$code" = 401 ] && rest_check ok "K2 return=representation refused" || rest_check fail "K2 return=representation refused"
  code=$(curl -s -o "$WORK/body" -w '%{http_code}' -X POST "http://127.0.0.1:53000/anon_stats_events" \
    -H 'Content-Type: application/json' -H 'Prefer: return=minimal' \
    -d '{"event":"first_video","version":"2.1.0","device_class":"mobil","play_bucket":"999"}')
  echo "POST bad play_bucket -> $code $(cat "$WORK/body")"; [ "$code" = 400 ] && rest_check ok "K3 CHECK -> 400" || rest_check fail "K3 CHECK -> 400"
  code=$(curl -s -o "$WORK/body" -w '%{http_code}' "http://127.0.0.1:53000/anon_stats_events?select=*")
  echo "GET -> $code $(cat "$WORK/body")"; [ "$code" = 401 ] && rest_check ok "K4 GET refused" || rest_check fail "K4 GET refused"
  SUPABASE_JS_DIR="$SUPABASE_JS_DIR" PGRST_PORT=53000 PROXY_PORT=53001 node --experimental-websocket "$HERE/60_rest_supabase_js_test.mjs" | tee "$WORK/js.out"; expect_rc 0 ${PIPESTATUS[0]} "supabase-js contract test"
  jp=$(grep -c '^PASS  J' "$WORK/js.out"); jt=$(grep -cE '^(PASS|FAIL)  J' "$WORK/js.out"); REST_PASS=$((REST_PASS+jp)); REST_TOTAL=$((REST_TOTAL+jt))
  psqlx fenomen_test supabase_admin -Atc "select 'rows written via REST: ' || count(*) from public.anon_stats_events"
  kill "$PGRST_PID" 2>/dev/null; PGRST_PID=
else
  echo "SKIPPED: PostgREST ($PGRST_BIN) or supabase-js ($SUPABASE_JS_DIR) not available"
fi

step "9. final rollback on test DB"
psqlx fenomen_test postgres -1 -v ON_ERROR_STOP=1 -f "$DOWN" 2>&1; expect_rc 0 $? "final rollback"

step "10. Istanbul day boundary with a SHIFTED server clock (libfaketime; now() itself is simulated)"
# Each phase: fresh throwaway cluster (no pg_cron) started under libfaketime at a chosen UTC instant
# of today's UTC date; migration applied as postgres; 50_day_boundary_tests.sql; REST insert via PostgREST.
fpsql() { local db="$1" user="$2"; shift 2; "$PGBIN/psql" -X -h "$FSOCK" -p "$FPORT" -U "$user" -d "$db" "$@"; }
run_fake_phase() {
  local phase="$1" utc_hms="$2" expect_diff="$3" target off
  target=$(date -u -d "$(date -u +%F) $utc_hms" +%s); off=$(( target - $(date -u +%s) ))
  echo; echo "---- phase $phase: server clock = UTC $(date -u -d "@$target" '+%F %T') = TSİ $(TZ=Europe/Istanbul date -d "@$target" '+%F %T') (offset ${off}s)"
  rm -rf "$FDATA" "$FSOCK"; mkdir -p "$FSOCK"
  "$PGBIN/initdb" -D "$FDATA" -U supabase_admin --auth=trust -E UTF8 --locale=C.UTF-8 >/dev/null || { FAILS=$((FAILS+1)); return; }
  printf "listen_addresses = ''\nunix_socket_directories = '%s'\nport = %s\n" "$FSOCK" "$FPORT" >> "$FDATA/postgresql.conf"
  LD_PRELOAD="$FAKETIME_LIB" FAKETIME="$( [ "$off" -ge 0 ] && echo "+$off" || echo "$off" )" FAKETIME_DONT_RESET=1 \
    "$PGBIN/pg_ctl" -D "$FDATA" -l "$WORK/fake-pg.log" -w start >/dev/null || { cat "$WORK/fake-pg.log"; FAILS=$((FAILS+1)); return; }
  fpsql postgres supabase_admin -qc "create database fenomen_clock"
  for f in 00_stub_supabase.sql 02_test_harness.sql; do fpsql fenomen_clock supabase_admin -q -f "$HERE/$f" || { FAILS=$((FAILS+1)); return; }; done
  fpsql fenomen_clock postgres -q -1 -v ON_ERROR_STOP=1 -f "$MIG" 2>&1; expect_rc 0 $? "$phase migration applies at shifted clock"
  REPORT_FILE="$SB/reports/v2.1-funnel.sql" fpsql fenomen_clock supabase_admin -v phase="$phase" -v expect_diff="$expect_diff" -f "$HERE/50_day_boundary_tests.sql" 2>&1
  expect_rc 0 $? "$phase 50_day_boundary_tests.sql ran to the end"
  if [ -x "$PGRST_BIN" ]; then
    PGRST_DB_URI="postgres://authenticator@/fenomen_clock?host=$FSOCK&port=$FPORT" PGRST_DB_SCHEMAS=public \
    PGRST_DB_ANON_ROLE=anon PGRST_SERVER_HOST=127.0.0.1 PGRST_SERVER_PORT=53010 PGRST_LOG_LEVEL=warn \
      "$PGRST_BIN" >"$WORK/postgrest-fake.log" 2>&1 & PGRST_PID=$!
    for i in $(seq 1 50); do curl -s -o /dev/null "http://127.0.0.1:53010/" && break; sleep 0.2; done
    code=$(curl -s -o "$WORK/body" -w '%{http_code}' -X POST "http://127.0.0.1:53010/anon_stats_events" \
      -H 'Content-Type: application/json' -H 'Prefer: return=minimal' \
      -d '{"event":"session_start","version":"2.1.0","device_class":"mobil","play_bucket":"0-10"}')
    stored=$(fpsql fenomen_clock supabase_admin -Atc "select string_agg(created_at::text, ',') || ' istanbul=' || public.anon_stats_today() || ' utc=' || (now() at time zone 'utc')::date || ' ok=' || bool_and(created_at = public.anon_stats_today()) from public.anon_stats_events")
    echo "REST POST at shifted clock -> $code; stored: $stored"
    [ "$code" = 201 ] && [[ "$stored" == *"ok=true" ]] && rest_check ok "$phase K5 REST anon insert 201 at shifted clock, stored date = Istanbul date" \
                                                   || rest_check fail "$phase K5 REST anon insert 201 at shifted clock, stored date = Istanbul date"
    kill "$PGRST_PID" 2>/dev/null; wait "$PGRST_PID" 2>/dev/null; PGRST_PID=
  fi
  fpsql fenomen_clock postgres -q -1 -v ON_ERROR_STOP=1 -f "$DOWN" 2>&1; expect_rc 0 $? "$phase rollback at shifted clock"
  sql_tally "$FSOCK" "$FPORT" fenomen_clock
  "$PGBIN/pg_ctl" -D "$FDATA" -m fast stop >/dev/null; rm -rf "$FDATA" "$FSOCK"
}
if [ -f "$FAKETIME_LIB" ]; then
  run_fake_phase P1 "20:59:00" false   # 23:59 TSİ: same date, Istanbul day not yet over
  run_fake_phase P2 "21:00:30" true    # 00:00:30 TSİ: Istanbul already on the next date
  run_fake_phase P3 "23:59:00" true    # 02:59 TSİ: last minute of the UTC day, dates differ
else
  echo "SKIPPED: libfaketime ($FAKETIME_LIB) not available; day boundary covered only by helper tests (section H)"
fi

step "SUMMARY"
for db in fenomen_test fenomen_nocron; do sql_tally "$SOCK" "$PORT" "$db"; done
echo "SQL assertions total: $SQL_PASS/$SQL_TOTAL PASS"
echo "REST checks total (curl K* + supabase-js J*): $REST_PASS/$REST_TOTAL PASS"
echo "shell-level FAIL count (incl. SQL + REST): $FAILS"
[ "$FAILS" = 0 ] && echo "RESULT: ALL PASS" || echo "RESULT: FAILURES"
exit $([ "$FAILS" = 0 ] && echo 0 || echo 1)
