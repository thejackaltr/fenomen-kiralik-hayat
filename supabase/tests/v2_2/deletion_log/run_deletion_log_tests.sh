#!/usr/bin/env bash
# Fenomen: deletion list (fenomen_private.deletion_log) restore test. LOCAL THROWAWAY DATABASES ONLY, never the live DB.
#   delete (info@ + "Hesabımı sil") -> export (ops/fenomen_deletion_log_export.sh) -> restore the dump taken BEFORE the deletes
#   -> reapply from the exports (ops/fenomen_deletion_log_reapply.sh reapply) -> verify 0 -> second reapply = no-op;
#   other users unchanged. Database fd_dl (owner postgres, like the live database postgres), auth schema = auth_schema_fixture.sql.
#   FD_MODE=local (default): own temporary PostgreSQL 17 cluster (unix socket only), deleted at the end (KEEP=1 keeps it).
#   FD_CT=<container>      : a local docker container of supabase/postgres:17.6.1.136 (database fd_dl is created and dropped there).
#   bash supabase/tests/v2_2/deletion_log/run_deletion_log_tests.sh 2>&1 | tee supabase/tests/v2_2/results/deletion-log-local-run.txt
# Groups: T files, B before the backup, S deletes after the backup, X export, R restore, A reapply + verify.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; SB="$(cd "$HERE/../../.." && pwd)"; AD="$HERE/../account_delete"
OPS="$SB/ops"; PRE="$OPS/fenomen_account_delete_preflight.sql"; DEL="$OPS/fenomen_account_delete.sql"; VER="$OPS/fenomen_account_delete_verify.sql"
EXP="$OPS/fenomen_deletion_log_export.sh"; REA="$OPS/fenomen_deletion_log_reapply.sh"
MIG="$SB/migrations/20260929193000_v2_2_fenomen_cloud_save.sql"; COUNTER="$SB/migrations/20260928150000_v2_1_anon_stats_events.sql"
A=aaaaaaaa-0000-4000-8000-00000000000a; B=bbbbbbbb-0000-4000-8000-00000000000b; C=cccccccc-0000-4000-8000-00000000000c
D=dddddddd-0000-4000-8000-0000000000d1; SID_B=bbbbbbbb-5e55-4000-8000-000000000001
OUT="${FD_OUT:-/tmp/fenomen-v22-dltest/out}"; rm -rf "$OUT"; mkdir -p "$OUT"; chmod 700 "$OUT"
DLD="$OUT/exports"   # stands for the directory outside the DB volume (Dokploy host: /etc/dokploy/fenomen-deletion-log)
unset PGHOST PGHOSTADDR PGPORT PGUSER PGPASSWORD PGDATABASE PGSERVICE DATABASE_URL SUPABASE_DB_URL DB_URL PSQL FENOMEN_DB_CT || true
PASSN=0; FAILS=0; declare -A NT=()
pass() { echo "PASS  $*"; PASSN=$((PASSN+1)); local k=${1%%[0-9]*}; NT[$k]=$(( ${NT[$k]:-0} + 1 )); }
fail() { echo "FAIL  $*"; FAILS=$((FAILS+1)); }

if [ -n "${FD_CT:-}" ]; then
  MODE="container $FD_CT ($(docker inspect "$FD_CT" --format '{{.Config.Image}}'))"
  P0() { docker exec -i "$FD_CT" psql -X -q -v ON_ERROR_STOP=1 -U supabase_admin -d postgres "$@"; }
  P()  { docker exec -i "$FD_CT" psql -X -q -v ON_ERROR_STOP=1 -U supabase_admin -d fd_dl "$@"; }
  PG() { docker exec -i -e PGOPTIONS="${PGOPTIONS:-}" "$FD_CT" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d fd_dl "$@"; }
  TOOL_PSQL="docker exec -i $FD_CT psql -X -U postgres -d fd_dl"
  dump()    { docker exec "$FD_CT" pg_dump -U supabase_admin -Fc fd_dl > "$1"; }
  restore() { docker exec -i "$FD_CT" pg_restore -U supabase_admin -d fd_dl --exit-on-error < "$1"; }
  cleanup() { P0 -c "drop database if exists fd_dl with (force)" >/dev/null 2>&1; }
else
  PGBIN="${PGBIN:-/usr/lib/postgresql/17/bin}"; WORK="${WORK:-/tmp/fenomen-v22-dltest}"; DATA="$WORK/cluster"; SOCK="$WORK/sock"; PORT="${PORT:-55464}"
  MODE="local cluster ($("$PGBIN/postgres" --version))"
  P0() { "$PGBIN/psql" -X -q -v ON_ERROR_STOP=1 -h "$SOCK" -p "$PORT" -U supabase_admin -d postgres "$@"; }
  P()  { "$PGBIN/psql" -X -q -v ON_ERROR_STOP=1 -h "$SOCK" -p "$PORT" -U supabase_admin -d fd_dl "$@"; }
  PG() { "$PGBIN/psql" -X -q -v ON_ERROR_STOP=1 -h "$SOCK" -p "$PORT" -U postgres -d fd_dl "$@"; }
  TOOL_PSQL="$PGBIN/psql -X -h $SOCK -p $PORT -U postgres -d fd_dl"
  dump()    { "$PGBIN/pg_dump" -h "$SOCK" -p "$PORT" -U supabase_admin -Fc fd_dl > "$1"; }
  restore() { "$PGBIN/pg_restore" -h "$SOCK" -p "$PORT" -U supabase_admin -d fd_dl --exit-on-error < "$1"; }
  cleanup() { "$PGBIN/pg_ctl" -D "$DATA" -m fast stop >/dev/null 2>&1; [ "${KEEP:-0}" = 1 ] || rm -rf "$DATA" "$SOCK"; }
  rm -rf "$DATA" "$SOCK"; mkdir -p "$SOCK"
  "$PGBIN/initdb" -D "$DATA" -U supabase_admin --auth=trust -E UTF8 --locale=C.UTF-8 >/dev/null || exit 2
  printf "listen_addresses = ''\nunix_socket_directories = '%s'\nport = %s\ntimezone = 'UTC'\n" "$SOCK" "$PORT" >> "$DATA/postgresql.conf"
  "$PGBIN/pg_ctl" -D "$DATA" -l "$WORK/pg.log" -w start >/dev/null || { cat "$WORK/pg.log"; exit 2; }
fi
trap cleanup EXIT
PA() { P -At -F '|' "$@"; }
newdb() { P0 -c "set client_min_messages = warning" -c "drop database if exists fd_dl with (force)" >/dev/null && P0 -c "create database fd_dl template template0" >/dev/null || { echo "create database failed"; exit 2; }; }
# the tools exactly as in the runbook, but PSQL = this throwaway database (role postgres)
export_() { PSQL="$TOOL_PSQL" FENOMEN_DL_DIR="$DLD" bash "$EXP" > "$OUT/$1" 2>&1; }
reapply_() { local m=$1 log=$2; shift 2; PSQL="$TOOL_PSQL" bash "$REA" "$m" "$@" > "$OUT/$log" 2>&1; }
exports() { ls -1 "$DLD" 2>/dev/null | grep -E '^fenomen-deletion-log-[0-9]{8}T[0-9]{6}Z\.csv$' | sort | sed "s|^|$DLD/|"; }
snap() { PA -c "select rel || '=' || md5 from fdtest.snap()" ; }
dl()   { PA -c "select coalesce(string_agg(user_id || '=' || approval_ref || '@' || to_char(deleted_at at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US'), ',' order by user_id), '-') from fenomen_private.deletion_log" | sed 's/@/ /g'; }
rows_of() { PA -c "select md5(string_agg(rel || '=' || md5, ',' order by rel)) from fdtest.rows_of('$1')"; }
users() { PA -c "select coalesce(string_agg(left(id::text, 8), ',' order by id), '-') from auth.users where id in ('$A', '$B', '$C', '$D')"; }
echo "== mode: $MODE"

echo; echo "######## T. files"
python3 - "$DEL" "$OPS/fenomen_deletion_log_reapply.sql" "$OPS/fenomen_deletion_log_verify.sql" <<'PY' && pass "T1 counts query in reapply (2) / verify (1) byte-identical to the info@ preflight / delete / verify one" || fail "T1 counts query differs"
import re, sys
b = lambda f: re.findall(r'-- <fenomen_del_counts>.*?-- </fenomen_del_counts>', open(f).read(), re.S)
d, r, v = (b(f) for f in sys.argv[1:])
sys.exit(0 if len(d) == 2 and len(r) == 2 and len(v) == 1 and len(set(d + r + v)) == 1 else 1)
PY
RS="$OPS/fenomen_deletion_log_reapply.sql"; VS="$OPS/fenomen_deletion_log_verify.sql"
[ "$(tail -1 "$RS")" = "commit;" ] && ! grep -qiE '^\s*(delete\s+from|update|truncate|drop|alter|grant|revoke)\b' "$RS" && grep -q 'public._fenomen_delete_user(r.uid, r.ref)' "$RS" \
  && [ "$(tail -1 "$VS")" = "rollback;" ] && ! grep -qiE '^\s*(insert|update|delete|truncate|create|drop|alter|grant|revoke)\b' "$VS" \
  && pass "T2 reapply: deletes only via _fenomen_delete_user(uid, original ref), ends with commit; verify: no write statement, ends with rollback" || fail "T2 file shape"
grep -q '^begin transaction read only;$' "$EXP" && grep -q '^rollback;$' "$EXP" && ! grep -qiE '^\s*(insert|update|delete|truncate|create|drop|alter)\b' <(sed -n "/<<'SQL'/,/^SQL$/p" "$EXP") \
  && pass "T3 export: read-only transaction (begin transaction read only ... rollback), no write statement" || fail "T3 export SQL"

echo; echo "######## B. before the backup: setup, D deletes itself (Hesabımı sil), dump"
newdb
P -f - < "$AD/auth_schema_fixture.sql" > "$OUT/fixture.log" 2>&1 || { echo "fixture failed"; tail -5 "$OUT/fixture.log"; exit 2; }
P -c "alter database fd_dl owner to postgres" >/dev/null   # like the live / .136 database postgres (owner postgres)
PG -f - < "$COUNTER" > "$OUT/counter.log" 2>&1 || true
PG -f - < "$MIG" > "$OUT/mig.log" 2>&1 || { echo "migration failed"; grep -m3 ERROR "$OUT/mig.log"; exit 2; }
P -f - < "$AD/seed.sql" > "$OUT/seed.log" 2>&1 || { echo "seed failed"; grep -m3 ERROR "$OUT/seed.log"; exit 2; }
P -c "insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at) values ('00000000-0000-0000-0000-000000000000', '$D', 'authenticated', 'authenticated', 'dave@fd-test.invalid', now(), now())" \
  -c "insert into public.fenomen_saves (user_id, data) values ('$D', '{\"v\":2,\"fd\":\"d\"}')" >/dev/null
P >/dev/null <<'SQL'
-- md5 per table of ONE user's rows (auth.*, public.fenomen_*; audit by actor_id / traits.user_id)
create or replace function fdtest.rows_of(p_uid text) returns table (rel text, md5 text) language plpgsql as $f$
declare r record; v text; cond text;
begin
  for r in select format('%I.%I', n.nspname, c.relname) as rel,
                  exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'user_id' and not a.attisdropped) as has_uid
             from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where c.relkind in ('r', 'p') and (n.nspname = 'auth' or (n.nspname = 'public' and c.relname like 'fenomen\_%')) order by 1 loop
    if r.rel = 'auth.users' then cond := format('id::text = %L', p_uid);
    elsif r.rel = 'auth.audit_log_entries' then cond := format('coalesce(lower(payload ->> %L) = %L or lower(payload -> %L ->> %L) = %L, false)', 'actor_id', p_uid, 'traits', 'user_id', p_uid);
    elsif r.has_uid then cond := format('user_id::text = %L', p_uid);
    else continue; end if;
    execute format('select count(*) || '':'' || coalesce(md5(string_agg(t::text, '','' order by t::text)), ''-'') from %s t where %s', r.rel, cond) into v;
    rel := r.rel; md5 := v; return next;
  end loop;
end $f$;
SQL
C0=$(rows_of $C); [ -n "$C0" ] || fail "B0 rows_of"
R=$(PA -c "set role authenticated" -c "select set_config('request.jwt.claims', json_build_object('sub', '$D', 'role', 'authenticated')::text, false)" -c "select public.fenomen_delete_my_account()" 2>&1 | tail -1)
[ "$R" = '{"saves": 1, "backups": 0, "deleted": true, "audit_entries": 0}' ] && [ "$(dl | sed -E 's/ [0-9T:.-]+//g')" = "$D=self:session:no-session" ] \
  && pass "B1 D deleted itself BEFORE the backup (JWT without session_id): on the deletion list as self:session:no-session" || fail "B1 $R / $(dl)"
dump "$OUT/before.dump"; rc=$?
[ $rc = 0 ] && [ -s "$OUT/before.dump" ] && [ "$(users)" = "aaaaaaaa,bbbbbbbb,cccccccc" ] \
  && pass "B2 backup = pg_dump -Fc of the whole database ($(wc -c < "$OUT/before.dump") bytes): A, B, C present, D gone, deletion list = D" || fail "B2 dump (exit $rc)"

echo; echo "######## S. deletes AFTER the backup (info@ for A, Hesabımı sil for B), exported after each"
TA=$(PGOPTIONS='-c default_transaction_read_only=on' PG -At -F '|' -v uid=$A -f - < "$PRE" 2>&1 | grep -E '^OK' | tail -1 | awk -F'|' '{print $NF}')
PG -v uid=$A -v confirm_uid=$A -v approval_ref=FN-DL-TEST-01 -v expect="$TA" -f - < "$DEL" > "$OUT/del_a.log" 2>&1; rc=$?
[ $rc = 0 ] && grep -qE 'fenomen account delete OK \(approval FN-DL-TEST-01\): auth.users 1, .*rows left: 0; deletion list: info:FN-DL-TEST-01 ' "$OUT/del_a.log" \
  && pass "S1 A deleted via info@ (preflight token $TA): deletion list info:FN-DL-TEST-01" || fail "S1 info@ delete (exit $rc): $(grep -m1 -oE 'ERROR: .*' "$OUT/del_a.log")"
export_ x1.log; rc=$?; E1=$(exports | tail -1)
[ $rc = 0 ] && grep -q '^export: 2 rows -> ' "$OUT/x1.log" && pass "S2 export #1 after A: 2 rows (D, A) -> $(basename "$E1")" || fail "S2 export #1 (exit $rc): $(cat "$OUT/x1.log")"
sleep 1.1
R=$(PA -c "set role authenticated" -c "select set_config('request.jwt.claims', json_build_object('sub', '$B', 'role', 'authenticated', 'session_id', '$SID_B')::text, false)" -c "select public.fenomen_delete_my_account()" 2>&1 | tail -1)
[ "$R" = '{"saves": 1, "backups": 1, "deleted": true, "audit_entries": 2}' ] && pass "S3 B deleted via Hesabımı sil  -- $R" || fail "S3 delete_my_account B: $R"
DL_DEL=$(dl)
[ "$(echo "$DL_DEL" | sed -E 's/ [0-9T:.-]+//g')" = "$A=info:FN-DL-TEST-01,$B=self:session:$SID_B,$D=self:session:no-session" ] \
  && [ "$(PA -c "select count(*) from fenomen_private.deletion_log where approval_ref like '%@%'")" = 0 ] \
  && pass "S4 deletion list: A info:FN-DL-TEST-01, B self:session:<session_id>, D self:session:no-session; uid + time + ref only, no e-mail" || fail "S4 deletion list: $DL_DEL"
[ "$(rows_of $C)" = "$C0" ] && pass "S5 C (other user) unchanged" || fail "S5 C changed"

echo; echo "######## X. export (directory outside the DB): 600, no overwrite, unchanged = no new file, md5, prune"
export_ x2.log; rc=$?; E2=$(exports | tail -1)
[ $rc = 0 ] && grep -q '^export: 3 rows -> ' "$OUT/x2.log" && [ "$E2" != "$E1" ] && [ "$(exports | wc -l)" = 2 ] \
  && pass "X1 export #2 after B: 3 rows -> $(basename "$E2") (new file; #1 kept)" || fail "X1 export #2 (exit $rc): $(cat "$OUT/x2.log")"
[ "$(stat -c %a "$DLD")" = 700 ] && [ "$(stat -c %a "$E2")" = 600 ] && [ "$(stat -c %a "$E2.md5")" = 600 ] && [ "$(stat -c %a "$E1")" = 600 ] \
  && pass "X2 permissions: directory 700, export + .md5 files 600" || fail "X2 permissions: $(stat -c '%a %n' "$DLD" "$E1" "$E2" "$E2.md5")"
( cd "$DLD" && md5sum -c --status "$(basename "$E2").md5" ) && [ "$(head -1 "$E2")" = "user_id,deleted_at_utc,approval_ref" ] && ! grep -q '@' "$E2" \
  && [ "$(tail -n +2 "$E2" | cut -d, -f1 | sort | tr '\n' ' ')" = "$A $B $D " ] \
  && pass "X3 md5sum -c OK; CSV user_id,deleted_at_utc,approval_ref; uids A, B, D; no e-mail" || fail "X3 content / md5"
M2=$(md5sum < "$E2")
export_ x3.log; rc=$?
[ $rc = 0 ] && grep -q '^export: unchanged (3 rows' "$OUT/x3.log" && [ "$(exports | wc -l)" = 2 ] && pass "X4 export again without a change: unchanged, no new file" || fail "X4 (exit $rc): $(cat "$OUT/x3.log")"
OLD="fenomen-deletion-log-$(date -u -d '-60 days' +%Y%m%dT%H%M%SZ).csv"
printf 'user_id,deleted_at_utc,approval_ref\n' > "$DLD/$OLD"; echo "$(md5sum < "$DLD/$OLD" | cut -c1-32)  $OLD" > "$DLD/$OLD.md5"; touch "$DLD/unrelated.txt"
export_ x5.log; rc=$?
[ $rc = 0 ] && grep -q 'pruned 1 export(s)' "$OUT/x5.log" && [ ! -e "$DLD/$OLD" ] && [ ! -e "$DLD/$OLD.md5" ] && [ -e "$DLD/unrelated.txt" ] && [ "$(exports | wc -l)" = 2 ] \
  && pass "X5 prune: own export older than 45 days (+ .md5) removed; recent exports and other files kept" || fail "X5 prune (exit $rc): $(cat "$OUT/x5.log")"
rm -f "$DLD/unrelated.txt"
PSQL="$TOOL_PSQL" FENOMEN_DL_DIR="$DLD" bash "$EXP" < /dev/null > "$OUT/x6.log" 2>&1
PGOPTIONS='-c default_transaction_read_only=on' PG -c "select 1" >/dev/null 2>&1 && \
  [ "$(PA -c "select count(*) from fenomen_private.deletion_log")" = 3 ] && pass "X6 exports changed nothing in the DB (3 list rows)" || fail "X6"

echo; echo "######## R. restore the backup taken BEFORE the deletes (drop database, pg_restore)"
SNAP_PRE_RESTORE=$(snap)
P0 -c "drop database fd_dl with (force)" -c "create database fd_dl template template0 owner postgres" >/dev/null
restore "$OUT/before.dump" > "$OUT/restore.log" 2>&1; rc=$?
[ $rc = 0 ] && [ "$(users)" = "aaaaaaaa,bbbbbbbb,cccccccc" ] && [ "$(dl | sed -E 's/ [0-9T:.-]+//g')" = "$D=self:session:no-session" ] \
  && pass "R1 restored (exit $rc): A and B are BACK, D stays deleted, the DB deletion list lost A and B (the reason for the export)" || fail "R1 restore (exit $rc): $(head -3 "$OUT/restore.log") users=$(users) dl=$(dl)"
reapply_ verify r_ver.log $(exports); rc=$?
[ $rc != 0 ] && grep -q 'fenomen deletion list verify FAILED (3 uid(s))' "$OUT/r_ver.log" && pass "R2 verify on the restored DB fails (exit $rc): A and B have rows again, not listed" || fail "R2 verify (exit $rc): $(grep -m1 -oE '(ERROR|NOTICE): .*' "$OUT/r_ver.log")"
TS2=$(basename "$E2" .csv); TS2=${TS2#fenomen-deletion-log-}
PSQL="$TOOL_PSQL" FENOMEN_DL_DIR="$DLD" FENOMEN_DL_TS="$TS2" bash "$EXP" > "$OUT/x4.log" 2>&1; rc=$?
[ $rc = 4 ] && grep -q 'already exists; not overwritten' "$OUT/x4.log" && [ "$(md5sum < "$E2")" = "$M2" ] && ( cd "$DLD" && md5sum -c --status "$(basename "$E2").md5" ) \
  && pass "R3 export with different content (restored list) under an existing file name: refused (exit 4), existing export + md5 unchanged (no overwrite)" || fail "R3 (exit $rc): $(cat "$OUT/x4.log")"
sleep 1.1; PSQL="$TOOL_PSQL" FENOMEN_DL_DIR="$DLD" bash "$EXP" > "$OUT/r_exp.log" 2>&1
grep -q 'WARNING: 2 uid(s) of ' "$OUT/r_exp.log" && grep -q '^export: 1 rows -> ' "$OUT/r_exp.log" && [ "$(exports | wc -l)" = 3 ] \
  && pass "R4 a scheduled export after the restore writes a NEW file (1 row) and warns: 2 uids missing; older exports kept" || fail "R4 $(cat "$OUT/r_exp.log")"

echo; echo "######## A. reapply from the exports, verify, second run = no-op"
cp "$E2" "$OUT/tampered.csv.tmp"; TAMP="$OUT/tamper/$(basename "$E2")"; mkdir -p "$OUT/tamper"; cp "$E2.md5" "$TAMP.md5"
sed '2s/^./0/' "$OUT/tampered.csv.tmp" > "$TAMP"; rm -f "$OUT/tampered.csv.tmp"
S0=$(snap); L0=$(dl)
reapply_ reapply a0.log "$TAMP"; rc=$?
[ $rc != 0 ] && grep -q 'md5 mismatch' "$OUT/a0.log" && [ "$(snap)" = "$S0" ] && [ "$(dl)" = "$L0" ] && pass "A1 changed export (md5 mismatch): refused (exit $rc), nothing changed" || fail "A1 (exit $rc): $(cat "$OUT/a0.log")"
BAD="$OUT/bad/fenomen-deletion-log-20260101T000000Z.csv"; mkdir -p "$OUT/bad"
printf 'user_id,deleted_at_utc,approval_ref\n%s,2026-10-03T00:00:00.000000Z,info:x@y.invalid\n' "$C" > "$BAD"; echo "$(md5sum < "$BAD" | cut -c1-32)  $(basename "$BAD")" > "$BAD.md5"
reapply_ reapply a1.log "$BAD" $(exports); rc=$?
[ $rc != 0 ] && grep -q 'invalid line(s) in fenomen-deletion-log-20260101T000000Z.csv' "$OUT/a1.log" && [ "$(snap)" = "$S0" ] && [ "$(dl)" = "$L0" ] && [ "$(rows_of $C)" = "$C0" ] \
  && pass "A2 export with an invalid line (e-mail in the ref, valid md5): refused (exit $rc), nothing changed (also not C)" || fail "A2 (exit $rc): $(grep -m1 -oE 'ERROR: .*' "$OUT/a1.log")"
reapply_ reapply a2.log $(exports); rc=$?
grep -m1 -oE 'fenomen deletion list reapply OK.*' "$OUT/a2.log" > "$OUT/a2.ok"
[ $rc = 0 ] && grep -qE '^fenomen deletion list reapply OK: 6 line\(s\), 3 uid\(s\); deletion list rows restored 2; re-deleted 2 \(auth.users 2, fenomen_saves 2, fenomen_save_backups 3, audit_log_entries 5\); skipped \(nothing to delete\) 1$' "$OUT/a2.ok" \
  && pass "A3 reapply with all exports (3 files incl. the post-restore one, 6 lines -> 3 uids): A and B re-deleted, D skipped (nothing to delete)  -- $(cat "$OUT/a2.ok")" || fail "A3 reapply (exit $rc): $(cat "$OUT/a2.ok") $(grep -m1 -oE 'ERROR: .*' "$OUT/a2.log")"
reapply_ verify a3.log $(exports); rc=$?
[ $rc = 0 ] && grep -q 'fenomen deletion list verify OK: 6 line(s), 3 uid(s), 0 rows left, 3 on the deletion list' "$OUT/a3.log" \
  && pass "A4 verify: 3 uids, 0 rows left in every counted table, all 3 on the deletion list" || fail "A4 verify (exit $rc): $(grep -m1 -oE '(ERROR|NOTICE): .*' "$OUT/a3.log")"
ok=1; for u in $A $B; do PGOPTIONS='-c default_transaction_read_only=on' PG -v uid=$u -f - < "$VER" > "$OUT/v_$u.log" 2>&1 || ok=0; grep -q "verify OK: 0 rows left for $u" "$OUT/v_$u.log" || ok=0; done
[ $ok = 1 ] && pass "A5 info@ verify OK for A and B too" || fail "A5 info@ verify"
[ "$(dl)" = "$DL_DEL" ] && [ "$(users)" = "cccccccc" ] && pass "A6 deletion list identical to before the restore (uid, ref, deleted_at to the microsecond); only C left of A/B/C/D" || fail "A6 list $(dl) vs $DL_DEL; users $(users)"
[ "$(snap)" = "$SNAP_PRE_RESTORE" ] && pass "A7 every auth.* / fenomen_* table byte-identical to the state before the restore" || fail "A7 snapshot differs from before the restore"
[ "$(rows_of $C)" = "$C0" ] && pass "A8 C (other user) unchanged from the start" || fail "A8 C changed"
S1=$(snap); L1=$(dl)
reapply_ reapply a4.log $(exports); rc=$?
[ $rc = 0 ] && grep -q 'reapply OK: 6 line(s), 3 uid(s); deletion list rows restored 0; re-deleted 0 (auth.users 0, fenomen_saves 0, fenomen_save_backups 0, audit_log_entries 0); skipped (nothing to delete) 3' "$OUT/a4.log" \
  && [ "$(snap)" = "$S1" ] && [ "$(dl)" = "$L1" ] && pass "A9 second reapply: no-op (restored 0, re-deleted 0, skipped 3; nothing changed)" || fail "A9 (exit $rc): $(grep -m1 -oE '(ERROR|NOTICE): .*' "$OUT/a4.log")"
sleep 1.1; export_ a5.log; rc=$?
[ $rc = 0 ] && grep -q "^export: 3 rows -> " "$OUT/a5.log" && [ "$(tail -n +2 "$(exports | tail -1)" | md5sum)" = "$(tail -n +2 "$E2" | md5sum)" ] \
  && pass "A10 export after the reapply: same 3 rows as before the restore" || fail "A10 (exit $rc): $(cat "$OUT/a5.log")"

echo; echo "######## SUMMARY"
for k in T B S X R A; do printf '%s=%s ' "$k" "${NT[$k]:-0}"; done; echo
echo "deletion list checks: $PASSN/$((PASSN+FAILS)) PASS"
[ "$FAILS" = 0 ] && echo "RESULT: ALL PASS" || echo "RESULT: FAILURES ($FAILS)"
exit $([ "$FAILS" = 0 ] && echo 0 || echo 1)
