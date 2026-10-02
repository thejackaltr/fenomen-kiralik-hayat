#!/usr/bin/env bash
# Fenomen: account deletion on request (ops/fenomen_account_delete_*.sql) tests. LOCAL THROWAWAY DATABASES ONLY.
# Never point this at the live DB: it seeds test users and deletes rows.
#   FD_MODE=local (default): own temporary PostgreSQL 17 cluster (unix socket only), auth schema = auth_schema_fixture.sql
#                            (real GoTrue tables from a .136 schema dump), deleted at the end (KEEP=1 keeps it).
#   FD_CT=<container>      : a local docker container of supabase/postgres:17.6.1.136 whose database postgres has the GoTrue
#                            auth schema (e.g. fen22-db after KEEP=1 bash supabase/tests/v2_2/stack/run-stack.sh).
#   bash supabase/tests/v2_2/account_delete/run_account_delete_tests.sh 2>&1 | tee supabase/tests/v2_2/results/account-delete-local-run.txt
# Groups: T files, P preflight, R refusals (parameters), E expect token, X single transaction / blocked, D delete + verify,
# S second verify (after GOTRUE_JWT_EXP + 5 min), H "Hesabımı sil" (fenomen_delete_my_account) and Y 24-month purge on the same
# auth schema (refresh tokens without session + flow_state go through _fenomen_delete_user on all three paths).
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; SB="$(cd "$HERE/../../.." && pwd)"
PRE="$SB/ops/fenomen_account_delete_preflight.sql"; DEL="$SB/ops/fenomen_account_delete.sql"; VER="$SB/ops/fenomen_account_delete_verify.sql"
MIG="$SB/migrations/20260929193000_v2_2_fenomen_cloud_save.sql"; COUNTER="$SB/migrations/20260928150000_v2_1_anon_stats_events.sql"
A=aaaaaaaa-0000-4000-8000-00000000000a; B=bbbbbbbb-0000-4000-8000-00000000000b; C=cccccccc-0000-4000-8000-00000000000c
NIL=00000000-0000-0000-0000-000000000000
OUT="${FD_OUT:-/tmp/fenomen-v22-adtest/out}"; rm -rf "$OUT"; mkdir -p "$OUT"; chmod 700 "$OUT"
unset PGHOST PGHOSTADDR PGPORT PGUSER PGPASSWORD PGDATABASE PGSERVICE DATABASE_URL SUPABASE_DB_URL DB_URL || true
PASSN=0; FAILS=0; declare -A NT=()
pass() { echo "PASS  $*"; PASSN=$((PASSN+1)); local k=${1%%[0-9]*}; NT[$k]=$(( ${NT[$k]:-0} + 1 )); }
fail() { echo "FAIL  $*"; FAILS=$((FAILS+1)); }

if [ -n "${FD_CT:-}" ]; then
  MODE="container $FD_CT ($(docker inspect "$FD_CT" --format '{{.Config.Image}}'))"
  P()  { docker exec -i "$FD_CT" psql -X -q -v ON_ERROR_STOP=1 -U supabase_admin -d postgres "$@"; }
  PG() { docker exec -i -e PGOPTIONS="${PGOPTIONS:-}" "$FD_CT" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
  cleanup() { P -c "drop schema if exists fdtest cascade" >/dev/null 2>&1; }
else
  PGBIN="${PGBIN:-/usr/lib/postgresql/17/bin}"; WORK="${WORK:-/tmp/fenomen-v22-adtest}"; DATA="$WORK/cluster"; SOCK="$WORK/sock"; PORT="${PORT:-55463}"
  MODE="local cluster ($("$PGBIN/postgres" --version)), auth schema from auth_schema_fixture.sql"
  P()  { "$PGBIN/psql" -X -q -v ON_ERROR_STOP=1 -h "$SOCK" -p "$PORT" -U supabase_admin -d fd_test "$@"; }
  PG() { "$PGBIN/psql" -X -q -v ON_ERROR_STOP=1 -h "$SOCK" -p "$PORT" -U postgres -d fd_test "$@"; }
  cleanup() { "$PGBIN/pg_ctl" -D "$DATA" -m fast stop >/dev/null 2>&1; [ "${KEEP:-0}" = 1 ] || rm -rf "$DATA" "$SOCK"; }
  rm -rf "$DATA" "$SOCK"; mkdir -p "$SOCK"
  "$PGBIN/initdb" -D "$DATA" -U supabase_admin --auth=trust -E UTF8 --locale=C.UTF-8 >/dev/null || exit 2
  printf "listen_addresses = ''\nunix_socket_directories = '%s'\nport = %s\ntimezone = 'UTC'\n" "$SOCK" "$PORT" >> "$DATA/postgresql.conf"
  "$PGBIN/pg_ctl" -D "$DATA" -l "$WORK/pg.log" -w start >/dev/null || { cat "$WORK/pg.log"; exit 2; }
  "$PGBIN/psql" -X -q -h "$SOCK" -p "$PORT" -U supabase_admin -d postgres -c "create database fd_test" >/dev/null || exit 2
  P -f - < "$HERE/auth_schema_fixture.sql" > "$OUT/fixture.log" 2>&1 || { echo "fixture failed"; tail -5 "$OUT/fixture.log"; exit 2; }
fi
trap cleanup EXIT
PA() { P -At -F '|' "$@"; }
echo "== mode: $MODE"
echo "== auth tables: $(PA -c "select count(*) || ' (' || string_agg(relname, ',' order by relname) || ')' from pg_class where relnamespace = 'auth'::regnamespace and relkind = 'r'")"

# setup: counter base (v2.1) + v2.2 migration as postgres (idempotent), then the test users
PG -f - < "$COUNTER" > "$OUT/counter.log" 2>&1 || true
PG -f - < "$MIG" > "$OUT/mig.log" 2>&1 || { echo "migration failed"; grep -m3 ERROR "$OUT/mig.log"; exit 2; }
seed() { P -f - < "$HERE/seed.sql" > "$OUT/seed.log" 2>&1 || { echo "seed failed"; grep -m3 ERROR "$OUT/seed.log"; exit 2; }; }
seed

pre() { PGOPTIONS='-c default_transaction_read_only=on' PG -At -F '|' "$@" -f - < "$PRE" 2>&1; }
token_of() { grep -E '^(OK|OK \(leftovers\)|STOP|BLOCKED)' | tail -1 | awk -F'|' '{print $NF}'; }
n_of() { awk -F'|' -v r="$2" 'NF == 5 && $2 == r {s += $4} END {print s + 0}' "$1"; }
del() { local log=$1; shift; PG "$@" -f - < "$DEL" > "$OUT/$log" 2>&1; }
ver() { local log=$1; shift; PGOPTIONS='-c default_transaction_read_only=on' PG "$@" -f - < "$VER" > "$OUT/$log" 2>&1; }
snap() { PA -c "select rel || '=' || md5 from fdtest.snap(${1:+'$1'})"; }
err() { grep -m1 -oE 'ERROR: .*' "$OUT/$1" | cut -c1-190; }
refused() {   # refused <name> <log> <expected message regex> [psql -v args...]
  local name=$1 log=$2 re=$3; shift 3; local before; before=$(snap)
  if del "$log" "$@"; then fail "$name: delete ran (exit 0)"; return; fi
  if ! grep -qE "$re" "$OUT/$log"; then fail "$name: wrong error: $(err "$log")"; return; fi
  if [ "$(snap)" = "$before" ]; then pass "$name  -- $(err "$log"); nothing changed"; else fail "$name: data changed"; fi
}

echo; echo "######## T. files"
python3 - "$PRE" "$DEL" "$VER" <<'PY' && pass "T1 counts query byte-identical in preflight (2) / delete (2) / verify (2); identity block identical in preflight / delete" || fail "T1 counts query or identity block differs"
import re, sys
txt = [open(f).read() for f in sys.argv[1:]]
blocks = [b for t in txt for b in re.findall(r'-- <fenomen_del_counts>.*?-- </fenomen_del_counts>', t, re.S)]
ident = [b for t in txt for b in re.findall(r'-- <fenomen_del_identity>.*?-- </fenomen_del_identity>', t, re.S)]
sys.exit(0 if len(blocks) == 6 and len(set(blocks)) == 1 and len(ident) == 2 and len(set(ident)) == 1 else 1)
PY
if grep -qiE '^\s*(insert|update|delete|truncate|create|alter|drop|grant|revoke)\b' "$PRE" "$VER"; then fail "T2 preflight/verify contain a write statement"
elif grep -q '^begin transaction read only;' "$PRE" && grep -q '^begin transaction read only;' "$VER" && [ "$(tail -1 "$PRE")" = "rollback;" ] && [ "$(tail -1 "$VER")" = "rollback;" ]; then
  pass "T2 preflight / verify: begin transaction read only ... rollback, no write statement"; else fail "T2 read only wrapper"; fi
grep -q 'public._fenomen_delete_user(v_uid)' "$DEL" && [ "$(grep -c '^begin;' "$DEL")" = 1 ] && [ "$(grep -c '^commit;' "$DEL")" = 1 ] && ! grep -qiE '^\s*delete\s+from' "$DEL" \
  && pass "T3 delete: one transaction (single begin / commit), deletes only through public._fenomen_delete_user (no DELETE of its own)" || fail "T3 delete file shape"

echo; echo "######## P. preflight (read only)"
pre -v email=' Alice@FD-Test.invalid ' > "$OUT/pre_a.txt"; f="$OUT/pre_a.txt"
grep -qE "^[a-z_0-9]+\|postgres\|on\|email\|1\|$A\|t\|a\*\*\*@fd-test\.invalid\|" "$f" \
  && pass "P1 found by e-mail (case / spaces ignored): exactly 1 match, uid, masked e-mail, read only" || fail "P1 identity line: $(grep -m1 "|email|" "$f")"
got="fenomen: saves=$(n_of $f public.fenomen_saves) backups=$(n_of $f public.fenomen_save_backups); auth: users=$(n_of $f auth.users) identities=$(n_of $f auth.identities) sessions=$(n_of $f auth.sessions) refresh_tokens=$(n_of $f auth.refresh_tokens) flow_state=$(n_of $f auth.flow_state) one_time_tokens=$(n_of $f auth.one_time_tokens) mfa_factors=$(n_of $f auth.mfa_factors); audit=$(n_of $f auth.audit_log_entries)"
[ "$got" = "fenomen: saves=1 backups=2; auth: users=1 identities=1 sessions=2 refresh_tokens=3 flow_state=1 one_time_tokens=1 mfa_factors=1; audit=3" ] \
  && pass "P2 rows per table  -- $got" || fail "P2 counts: $got"
grep -q '^auth|auth.refresh_tokens|user_id|3|function$' "$f" && grep -q '^auth|auth.flow_state|user_id|1|function$' "$f" && grep -q '^auth|auth.sessions|user_id|2|cascade$' "$f" && grep -q '^fenomen|public.fenomen_saves|user_id|1|function$' "$f" && grep -q '^audit|auth.audit_log_entries|payload.actor_id / traits.user_id|3|function$' "$f" \
  && pass "P3 what the delete does per table (function incl. refresh_tokens + flow_state / cascade)" || fail "P3 act column"
grep -q '^backup|reset x1|' "$f" && grep -q '^backup|restore x1|' "$f" && grep -qE '^save\|1\|' "$f" && pass "P4 save and backups summary (no save content)" || fail "P4 summary"
TA=$(token_of < "$f")
grep -qE "^OK: deletes Fenomen 3 rows \+ audit 3 rows \+ the auth user \(cascade 5, refresh_tokens / flow_state 4\)\|$A\|[0-9a-f]{12}$" "$f" \
  && pass "P5 verdict OK + uid + expect token ($TA)" || fail "P5 verdict: $(grep -E '^(OK|STOP|BLOCKED)' "$f")"
! grep -q 'alice@' "$f" && pass "P6 output has no clear-text e-mail" || fail "P6 e-mail in output"
pre -v email=nobody@fd-test.invalid > "$OUT/pre_none.txt"
grep -qE "^STOP: no auth user with this e-mail\|$NIL\|-$" "$OUT/pre_none.txt" && pass "P7 unknown e-mail: STOP, no token" || fail "P7: $(tail -1 "$OUT/pre_none.txt")"
pre -v email=alice@fd-test.invalid -v uid=$A > "$OUT/pre_both.txt"; rc=$?
[ $rc != 0 ] && grep -q 'pass exactly one of' "$OUT/pre_both.txt" && pre > "$OUT/pre_neither.txt"; rc2=$?
[ $rc != 0 ] && [ $rc2 != 0 ] && grep -q 'pass exactly one of' "$OUT/pre_neither.txt" && pass "P8 e-mail and uid together / neither: error (exit $rc / $rc2)" || fail "P8 parameter check ($rc/$rc2)"
TB=$(pre -v uid=$B | token_of); [ "$(pre -v uid=$A | token_of)" = "$TA" ] && [ -n "$TB" ] && [ "$TB" != "$TA" ] \
  && pass "P9 lookup by uid gives the same token as by e-mail; B has its own token" || fail "P9 uid lookup token"
P -c "insert into auth.users (instance_id, id, aud, role, email, created_at, is_sso_user) values ('$NIL', 'eeeeeeee-0000-4000-8000-00000000000e', 'authenticated', 'authenticated', 'bob@fd-test.invalid', now(), true)" >/dev/null
pre -v email=bob@fd-test.invalid > "$OUT/pre_two.txt"
grep -qE "^STOP: 2 auth users with this e-mail; do not delete, ask Aryen\|$NIL\|-$" "$OUT/pre_two.txt" && pass "P10 two accounts with the same e-mail (SSO + e-mail): STOP, no token" || fail "P10: $(tail -1 "$OUT/pre_two.txt")"
P -c "delete from auth.users where id = 'eeeeeeee-0000-4000-8000-00000000000e'" >/dev/null

echo; echo "######## R. refusals (parameters), nothing deleted"
refused "R1 confirm_uid differs" r1.log 'confirm_uid does not match' -v uid=$A -v confirm_uid=$B -v approval_ref=FN-SIL-TEST-01 -v expect=$TA
refused "R2 approval_ref empty" r2.log 'approval_ref .* is required' -v uid=$A -v confirm_uid=$A -v approval_ref=' ' -v expect=$TA
refused "R3 expect missing" r3.log 'expect missing' -v uid=$A -v confirm_uid=$A -v approval_ref=FN-SIL-TEST-01
refused "R4 uid missing" r4.log 'uid missing' -v confirm_uid=$A -v approval_ref=FN-SIL-TEST-01 -v expect=$TA
refused "R5 nil uuid" r5.log 'nil uuid is not a user' -v uid=$NIL -v confirm_uid=$NIL -v approval_ref=FN-SIL-TEST-01 -v expect=$TA
refused "R6 uid not a uuid" r6.log 'invalid input syntax for type uuid' -v uid=alice -v confirm_uid=alice -v approval_ref=FN-SIL-TEST-01 -v expect=$TA

echo; echo "######## E. expect token"
refused "E1 wrong token" e1.log 'changed since the preflight' -v uid=$A -v confirm_uid=$A -v approval_ref=FN-SIL-TEST-01 -v expect=000000000000
refused "E2 token of another user (B's token for A)" e2.log 'changed since the preflight' -v uid=$A -v confirm_uid=$A -v approval_ref=FN-SIL-TEST-01 -v expect=$TB
P -c "update auth.users set email = 'alice2@fd-test.invalid' where id = '$A'" >/dev/null
refused "E3 e-mail changed after the preflight -> refused" e3.log 'changed since the preflight' -v uid=$A -v confirm_uid=$A -v approval_ref=FN-SIL-TEST-01 -v expect=$TA
P -c "update auth.users set email = 'alice@fd-test.invalid' where id = '$A'" >/dev/null
P -c "update auth.users set created_at = created_at - interval '1 second' where id = '$A'" >/dev/null
refused "E4 created_at changed after the preflight -> refused" e4.log 'changed since the preflight' -v uid=$A -v confirm_uid=$A -v approval_ref=FN-SIL-TEST-01 -v expect=$TA
P -c "update auth.users set created_at = created_at + interval '1 second' where id = '$A'" >/dev/null
P -c "insert into public.fenomen_save_backups (user_id, revision, save_version, data, reason) values ('$A', 3, 1, '{\"fd\":\"a3\"}', 'reset')" >/dev/null
refused "E5 Fenomen rows changed after the preflight (new backup) -> refused" e5.log 'changed since the preflight' -v uid=$A -v confirm_uid=$A -v approval_ref=FN-SIL-TEST-01 -v expect=$TA
P -c "delete from public.fenomen_save_backups where user_id = '$A' and revision = 3" >/dev/null
[ "$(pre -v uid=$A | token_of)" = "$TA" ] && pass "E6 restoring e-mail / created_at / rows gives the original token again (deterministic)" || fail "E6 token after restore"
P -c "update auth.users set last_sign_in_at = now() where id = '$A'" \
  -c "insert into auth.sessions (id, user_id, created_at, updated_at) values ('aaaaaaaa-5e55-4000-8000-000000000003', '$A', now(), now())" \
  -c "insert into auth.refresh_tokens (instance_id, token, user_id, revoked, created_at, updated_at, session_id) values ('$NIL', 'fdtA4', '$A', false, now(), now(), 'aaaaaaaa-5e55-4000-8000-000000000003')" \
  -c "insert into auth.audit_log_entries (instance_id, id, payload, created_at) values ('$NIL', 'aaaaaaaa-a0d1-4000-8000-000000000004', json_build_object('fd_test','yes','action','login','actor_id','$A'), now())" >/dev/null
pre -v uid=$A > "$OUT/pre_a2.txt"
[ "$(token_of < "$OUT/pre_a2.txt")" = "$TA" ] && [ "$(n_of "$OUT/pre_a2.txt" auth.sessions)" = 3 ] && [ "$(n_of "$OUT/pre_a2.txt" auth.audit_log_entries)" = 4 ] \
  && pass "E7 token stable while the player is signed in: last_sign_in_at, new session, new refresh token, new audit row do not change it ($TA)" || fail "E7 token changed: $(token_of < "$OUT/pre_a2.txt")"

echo; echo "######## X. single transaction, blocked"
P -c "create or replace function fdtest.boom() returns trigger language plpgsql as \$\$ begin raise exception 'fd test: injected failure in %', tg_table_name; end \$\$" \
  -c "create trigger fd_test_boom before delete on auth.users for each row execute function fdtest.boom()" >/dev/null
refused "X1 failure at the last step (auth.users) rolls back everything: audit rows, refresh tokens, flow state, backups, save still there" x1.log 'injected failure in users' -v uid=$A -v confirm_uid=$A -v approval_ref=FN-SIL-TEST-01 -v expect=$TA
P -c "drop trigger fd_test_boom on auth.users" >/dev/null
PG -c "create table public.zz_fd_test_other (user_id uuid references auth.users(id) on delete cascade, note text)" -c "insert into public.zz_fd_test_other values ('$A', 'x')" >/dev/null   # a non-Fenomen table (owner postgres)
pre -v uid=$A > "$OUT/pre_blk.txt"
grep -qE "^BLOCKED: rows outside Fenomen \(public.zz_fd_test_other=1\).*\|$A\|-$" "$OUT/pre_blk.txt" && pass "X2 preflight: a non-Fenomen table referencing auth.users -> BLOCKED, no token" || fail "X2: $(tail -1 "$OUT/pre_blk.txt")"
refused "X3 delete BLOCKED by rows outside Fenomen (would be cascaded)" x3.log 'BLOCKED: rows outside Fenomen \(public.zz_fd_test_other=1\)' -v uid=$A -v confirm_uid=$A -v approval_ref=FN-SIL-TEST-01 -v expect=$TA
PG -c "drop table public.zz_fd_test_other" >/dev/null

fk_left() { echo "A: rt_nosess=$(PA -c "select count(*) from auth.refresh_tokens where token = 'fdtA3'") rt=$(PA -c "select count(*) from auth.refresh_tokens where user_id = '$A'") flow=$(PA -c "select count(*) from auth.flow_state where user_id = '$A'"); B: rt_nosess=$(PA -c "select count(*) from auth.refresh_tokens where token = 'fdtB2' and user_id = '$B'") rt=$(PA -c "select count(*) from auth.refresh_tokens where user_id = '$B'") flow=$(PA -c "select count(*) from auth.flow_state where user_id = '$B'")"; }
FK_BEFORE="A: rt_nosess=1 rt=3 flow=1; B: rt_nosess=1 rt=2 flow=1"; FK_AFTER="A: rt_nosess=0 rt=0 flow=0; B: rt_nosess=1 rt=2 flow=1"
echo; echo "######## D. delete with the right token, verify, other users untouched"
SB0=$(snap $A); AUD0=$(PA -c "select count(*) from auth.audit_log_entries")
del d1.log -v uid=$A -v confirm_uid=" $A" -v approval_ref=FN-SIL-TEST-01 -v expect=" $TA "; rc=$?
grep -m1 -oE 'fenomen account delete OK.*' "$OUT/d1.log" > "$OUT/d1.ok"
[ $rc = 0 ] && grep -qE '^fenomen account delete OK \(approval FN-SIL-TEST-01\): auth.users 1, fenomen_saves 1, fenomen_save_backups 2, audit_log_entries 4, auth.refresh_tokens 4, auth.flow_state 1 \(counted before\), cascaded: auth.identities 1, auth.mfa_factors 1, auth.one_time_tokens 1, auth.sessions 3; rows left: 0$' "$OUT/d1.ok" \
  && pass "D1 delete with the right token (exit 0)  -- $(cat "$OUT/d1.ok")" || fail "D1 delete (exit $rc): $(err d1.log) $(cat "$OUT/d1.ok")"
ver v_a.log -v uid=$A; rc=$?
[ $rc = 0 ] && grep -q "verify OK: 0 rows left for $A" "$OUT/v_a.log" && ! grep -qE '\| *[1-9][0-9]* *\|' "$OUT/v_a.log" \
  && pass "D2 verify: 0 rows of A in auth.users, identities, sessions, refresh_tokens, flow_state, mfa, one_time_tokens, audit, fenomen_saves, fenomen_save_backups" || fail "D2 verify (exit $rc): $(err v_a.log)"
[ "$(snap $A)" = "$SB0" ] && [ $(( AUD0 - $(PA -c "select count(*) from auth.audit_log_entries") )) = 4 ] \
  && pass "D3 every other row unchanged (B, C, B's audit row with A's e-mail, admin / null rows); exactly A's 4 audit rows gone" || fail "D3 other users changed"
[ "$(PA -c "select count(*) from auth.users where id in ('$B', '$C')")|$(PA -c "select count(*) from auth.refresh_tokens where user_id = '$B'")|$(PA -c "select count(*) from auth.flow_state where user_id = '$B'")|$(PA -c "select count(*) from public.fenomen_saves where user_id = '$B'")" = "2|2|1|1" ] \
  && pass "D4 B and C still there (B: 2 refresh tokens incl. one without session, flow_state, cloud save)" || fail "D4 B/C rows"
[ "$(fk_left)" = "$FK_AFTER" ] && pass "D4b A's refresh tokens (incl. the one without session) and flow_state gone via _fenomen_delete_user; B's (incl. without session) stay  -- $(fk_left)" || fail "D4b $(fk_left)"
ver v_b.log -v uid=$B; rc=$?
[ $rc != 0 ] && grep -q "rows left for $B" "$OUT/v_b.log" && pass "D5 verify on a user that still exists fails (exit $rc)  -- $(err v_b.log)" || fail "D5 verify B (exit $rc)"
refused "D6 second delete with the same token: nothing to delete" d6.log 'nothing to delete' -v uid=$A -v confirm_uid=$A -v approval_ref=FN-SIL-TEST-01 -v expect=$TA
pre -v email=alice@fd-test.invalid > "$OUT/pre_after.txt"
grep -qE "^STOP: no auth user with this e-mail" "$OUT/pre_after.txt" && pass "D7 preflight by e-mail after the delete: no account" || fail "D7: $(tail -1 "$OUT/pre_after.txt")"

echo; echo "######## S. second verify (GOTRUE_JWT_EXP + 5 min): a late row -> new preflight, new expect, new approval"
P -c "insert into auth.audit_log_entries (instance_id, id, payload, created_at) values ('$NIL', 'aaaaaaaa-a0d1-4000-8000-000000000005', json_build_object('fd_test','yes','action','token_refreshed','actor_id','$A'), now())" >/dev/null
ver v_a2.log -v uid=$A; rc=$?
[ $rc != 0 ] && grep -q "rows left for $A: auth.audit_log_entries=1" "$OUT/v_a2.log" && pass "S1 second verify finds the late row (exit $rc)  -- $(err v_a2.log)" || fail "S1 second verify (exit $rc)"
pre -v uid=$A > "$OUT/pre_s.txt"; T2=$(token_of < "$OUT/pre_s.txt")
grep -qE "^OK \(leftovers\): auth user already gone; deletes 1 rows \(auth.audit_log_entries=1\)\|$A\|[0-9a-f]{12}$" "$OUT/pre_s.txt" && [ "$T2" != "$TA" ] \
  && pass "S2 new preflight by uid: OK (leftovers), new token $T2 (old $TA)" || fail "S2: $(tail -1 "$OUT/pre_s.txt")"
refused "S3 old token refused for the leftover delete" s3.log 'changed since the preflight' -v uid=$A -v confirm_uid=$A -v approval_ref=FN-SIL-TEST-02 -v expect=$TA
del s4.log -v uid=$A -v confirm_uid=$A -v approval_ref=FN-SIL-TEST-02 -v expect=$T2; rc=$?
ver v_a3.log -v uid=$A; rc2=$?
[ $rc = 0 ] && grep -q 'fenomen account delete OK (approval FN-SIL-TEST-02): auth.users 0, fenomen_saves 0, fenomen_save_backups 0, audit_log_entries 1,' "$OUT/s4.log" && [ $rc2 = 0 ] && [ "$(snap $A)" = "$SB0" ] \
  && pass "S4 delete with the new token + new approval -> OK, verify OK, other users still unchanged" || fail "S4 (exit $rc/$rc2): $(err s4.log)"


echo; echo "######## H. \"Hesabımı sil\" (fenomen_delete_my_account as authenticated) on the same auth schema"
seed; [ "$(fk_left)" = "$FK_BEFORE" ] || fail "H0 seed: $(fk_left)"
SH0=$(snap $A)
R=$(PA -c "set role authenticated" -c "select set_config('request.jwt.claims', json_build_object('sub', '$A', 'role', 'authenticated')::text, false), set_config('request.jwt.claim.sub', '$A', false)" -c "select public.fenomen_delete_my_account()" 2>&1 | tail -1)
[ "$R" = '{"saves": 1, "backups": 2, "deleted": true, "audit_entries": 3}' ] && pass "H1 fenomen_delete_my_account as A  -- $R" || fail "H1 delete_my_account: $R"
[ "$(fk_left)" = "$FK_AFTER" ] && pass "H2 A's refresh tokens (incl. the one without session) and flow_state gone; B's (incl. without session) stay  -- $(fk_left)" || fail "H2 $(fk_left)"
ver v_h.log -v uid=$A; rc=$?
[ $rc = 0 ] && [ "$(snap $A)" = "$SH0" ] && pass "H3 info@ verify OK for A after \"Hesabımı sil\"; every other row unchanged" || fail "H3 verify (exit $rc): $(err v_h.log)"

echo; echo "######## Y. 24-month purge (fenomen_purge_inactive_accounts as postgres) on the same auth schema"
seed; [ "$(fk_left)" = "$FK_BEFORE" ] || fail "Y0 seed: $(fk_left)"
P -c "update auth.users set created_at = now() - interval '3 years', last_sign_in_at = now() - public.fenomen_cfg_inactive_interval() - interval '1 day' where id = '$A'" >/dev/null
SY0=$(snap $A)
R=$(PG -At -F '|' -c "select accounts, saves, backups, audit_entries, remaining from public.fenomen_purge_inactive_accounts()" 2>&1)
[ "$R" = "1|1|2|3|0" ] && pass "Y1 purge deletes only A (inactive 24 months + 1 day): accounts|saves|backups|audit|remaining = $R" || fail "Y1 purge: $R"
[ "$(fk_left)" = "$FK_AFTER" ] && pass "Y2 A's refresh tokens (incl. the one without session) and flow_state gone; B's stay  -- $(fk_left)" || fail "Y2 $(fk_left)"
ver v_y.log -v uid=$A; rc=$?
[ $rc = 0 ] && [ "$(snap $A)" = "$SY0" ] && pass "Y3 info@ verify OK for A after the purge; every other row unchanged" || fail "Y3 verify (exit $rc): $(err v_y.log)"

echo; echo "######## SUMMARY"
for k in T P R E X D S H Y; do printf '%s=%s ' "$k" "${NT[$k]:-0}"; done; echo
echo "account delete checks: $PASSN/$((PASSN+FAILS)) PASS"
[ "$FAILS" = 0 ] && echo "RESULT: ALL PASS" || echo "RESULT: FAILURES ($FAILS)"
exit $([ "$FAILS" = 0 ] && echo 0 || echo 1)
