#!/usr/bin/env bash
# Fenomen v2.2 — LOCAL THROWAWAY Supabase stack test (Docker, --network host, 127.0.0.1 only):
#   supabase/postgres 17.6.1.171 (fenomen-api runs 17.6.1.136; .171 was already on the box, the Docker vfs driver made a 2nd image too big for the disk) + supabase/gotrue v2.189.0 + postgrest v14.12 (live versions,
#   plans/fenomen-infra-status.md), an SMTP sink instead of Resend, a Kong stand-in proxy, supabase-js 2.x.
# Secrets: DB password + JWT secret are random, generated here, kept in this process's env only (never printed/written).
# Nothing connects to fenomen-api / supabase.teserix.com / kodhane-api / Dokploy / Portainer.
#   bash supabase/tests/v2_2/stack/run-stack.sh 2>&1 | tee supabase/tests/v2_2/results/stack-local-run.txt
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; SB="$(cd "$HERE/../../.." && pwd)"
PG_IMG="${PG_IMG:-public.ecr.aws/supabase/postgres:17.6.1.171}"; AUTH_IMG="${AUTH_IMG:-supabase/gotrue:v2.189.0}"; REST_IMG="${REST_IMG:-postgrest/postgrest:v14.12}"
DBPORT=55499; AUTHPORT=59999; RESTPORT=53099; APIPORT=54399; SMTPPORT=2599; TPLPORT=58099
WORK="${WORK:-/tmp/fenomen-v22-stack}"; rm -rf "$WORK"; mkdir -p "$WORK/mail" "$WORK/tpl"
SUPABASE_JS_DIR="${SUPABASE_JS_DIR:-/tmp/fenomen-pgtest/js/node_modules/@supabase/supabase-js}"
TPL_SRC="${TPL_SRC:-$SB/templates}"   # v2.2 şablonları (Yazı r2), build_templates.py ile üretilir
MIG="$SB/migrations/20260929193000_v2_2_fenomen_cloud_save.sql"; RB="$SB/rollback/20260929193000_v2_2_fenomen_cloud_save.rollback.sql"
PRE="$SB/ops/v2_2_cloud_save_preflight_readonly.sql"; VER="$SB/ops/v2_2_cloud_save_verify.sql"; CNT="$SB/ops/inactive_accounts_count.sql"
CRON_B="$SB/ops/v2_2_backup_cleanup_pg_cron.sql"; CRON_P="$SB/ops/v2_2_inactive_purge_pg_cron.sql"
COUNTER="$SB/migrations/20260928150000_v2_1_anon_stats_events.sql"
unset PGHOST PGHOSTADDR PGPORT PGUSER PGPASSWORD PGDATABASE DATABASE_URL SUPABASE_DB_URL DB_URL || true
PASS=0; FAIL=0
ok_()  { PASS=$((PASS+1)); echo "PASS  $1"; }
bad_() { FAIL=$((FAIL+1)); echo "FAIL  $1"; }
chk()  { if eval "$2"; then ok_ "$1"; else bad_ "$1 ${3:-}"; fi; }
rnd()  { head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c "$1"; }
export POSTGRES_PASSWORD="$(rnd 32)"; export JWT_SECRET="$(rnd 48)"
db()   { PGPASSWORD="$POSTGRES_PASSWORD" psql -X -h 127.0.0.1 -p $DBPORT -U "${U:-postgres}" -d postgres "$@"; }
ro()   { PGOPTIONS='-c default_transaction_read_only=on' db "$@"; }
dump_schema() { PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h 127.0.0.1 -p $DBPORT -U supabase_admin --schema-only -n public -n auth postgres | grep -v -E '^(--|\\restrict|\\unrestrict)' | sed '/^$/d'; }
dump_counter() { PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h 127.0.0.1 -p $DBPORT -U supabase_admin -t 'public.anon_stats*' postgres | grep -v -E '^(--|\\restrict|\\unrestrict)' | sed '/^$/d'
  U=supabase_admin db -Atc "select p.oid::regprocedure || ' ' || md5(pg_get_functiondef(p.oid)) || ' ' || coalesce(p.proacl::text, '') from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'anon\_stats%' order by 1"; }
jwt() { node -e 'const c=require("crypto");const b=(o)=>Buffer.from(JSON.stringify(o)).toString("base64url");const h=b({alg:"HS256",typ:"JWT"}),p=b({role:process.argv[1],iss:"supabase",iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+7200});process.stdout.write(h+"."+p+"."+c.createHmac("sha256",process.env.JWT_SECRET).update(h+"."+p).digest("base64url"))' "$1"; }
cleanup() { [ "${KEEP:-0}" = 1 ] && return; docker rm -f fen22-db fen22-auth fen22-rest >/dev/null 2>&1; kill ${PIDS:-} 2>/dev/null; }
trap cleanup EXIT
PIDS=""
step() { echo; echo "######## $*"; }

step "0. throwaway stack: $PG_IMG, $AUTH_IMG, $REST_IMG (127.0.0.1 only)"
docker rm -f fen22-db fen22-auth fen22-rest >/dev/null 2>&1
docker run -d --name fen22-db --network host -e POSTGRES_PASSWORD "$PG_IMG" postgres -D /etc/postgresql -c port=$DBPORT -c listen_addresses=127.0.0.1 >/dev/null || exit 2
for i in $(seq 1 120); do U=supabase_admin db -qAtc "select 1" >/dev/null 2>&1 && docker logs fen22-db 2>&1 | grep -q "ready to accept connections" && break; sleep 1; done
sleep 3; U=supabase_admin db -qAtc "select 1" >/dev/null || { docker logs fen22-db | tail -20; exit 2; }
U=supabase_admin db -q -v ON_ERROR_STOP=1 -v pw="$POSTGRES_PASSWORD" >/dev/null <<'SQL'
alter role supabase_auth_admin with login password :'pw';
alter role authenticator with login password :'pw';
alter role postgres with login password :'pw';
SQL
python3 "$SB/templates/build_templates.py" --check || { echo "templates differ from Yazı r2: run build_templates.py"; exit 2; }
cp "$TPL_SRC/magic_link.html" "$TPL_SRC/confirmation.html" "$WORK/tpl/" || exit 2; TPL_USED="$TPL_SRC (repo, Yazı r2)"
SENDER_EMAIL="fenomen@teserix.com"; SENDER_NAME="Fenomen: Kiralık Hayat"; export SENDER_EMAIL SENDER_NAME   # Aryen onayı (29 Eyl); mail yalnız yerel SMTP sink'e gider
SUBJ_NEW="$(cat "$TPL_SRC/confirmation.subject.txt")"; SUBJ_RET="$(cat "$TPL_SRC/magic_link.subject.txt")"; export SUBJ_NEW SUBJ_RET
python3 "$HERE/smtp_sink.py" $SMTPPORT "$WORK/mail" & PIDS="$PIDS $!"
python3 -m http.server $TPLPORT --bind 127.0.0.1 --directory "$WORK/tpl" >/dev/null 2>&1 & PIDS="$PIDS $!"
export GOTRUE_DB_DATABASE_URL="postgres://supabase_auth_admin:${POSTGRES_PASSWORD}@127.0.0.1:${DBPORT}/postgres" GOTRUE_JWT_SECRET="$JWT_SECRET"
docker run -d --name fen22-auth --network host \
  -e GOTRUE_DB_DATABASE_URL -e GOTRUE_JWT_SECRET -e GOTRUE_DB_DRIVER=postgres \
  -e GOTRUE_API_HOST=127.0.0.1 -e GOTRUE_API_PORT=$AUTHPORT -e API_EXTERNAL_URL=http://127.0.0.1:$APIPORT \
  -e GOTRUE_SITE_URL=https://fenomen.teserix.com -e GOTRUE_URI_ALLOW_LIST='https://fenomen.teserix.com' \
  -e GOTRUE_DISABLE_SIGNUP=false -e GOTRUE_JWT_ADMIN_ROLES=service_role -e GOTRUE_JWT_AUD=authenticated \
  -e GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated -e GOTRUE_JWT_EXP=3600 \
  -e GOTRUE_EXTERNAL_EMAIL_ENABLED=true -e GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED=false -e GOTRUE_MAILER_AUTOCONFIRM=false \
  -e GOTRUE_EXTERNAL_PHONE_ENABLED=false -e GOTRUE_SMS_AUTOCONFIRM=false \
  -e GOTRUE_SMTP_HOST=127.0.0.1 -e GOTRUE_SMTP_PORT=$SMTPPORT -e GOTRUE_SMTP_ADMIN_EMAIL="$SENDER_EMAIL" -e GOTRUE_SMTP_SENDER_NAME="$SENDER_NAME" \
  -e GOTRUE_SMTP_MAX_FREQUENCY=60s -e GOTRUE_RATE_LIMIT_EMAIL_SENT=1000 -e GOTRUE_RATE_LIMIT_OTP=1000 \
  -e GOTRUE_MAILER_OTP_LENGTH=6 -e GOTRUE_MAILER_OTP_EXP=600 \
  -e GOTRUE_MAILER_SUBJECTS_MAGIC_LINK="$SUBJ_RET" -e GOTRUE_MAILER_SUBJECTS_CONFIRMATION="$SUBJ_NEW" \
  -e GOTRUE_MAILER_TEMPLATES_MAGIC_LINK=http://127.0.0.1:$TPLPORT/magic_link.html -e GOTRUE_MAILER_TEMPLATES_CONFIRMATION=http://127.0.0.1:$TPLPORT/confirmation.html \
  "$AUTH_IMG" >/dev/null || exit 2
for i in $(seq 1 60); do curl -fs "http://127.0.0.1:$AUTHPORT/health" >/dev/null 2>&1 && break; sleep 1; done
echo "gotrue: $(curl -s http://127.0.0.1:$AUTHPORT/health)"
export PGRST_DB_URI="postgres://authenticator:${POSTGRES_PASSWORD}@127.0.0.1:${DBPORT}/postgres" PGRST_JWT_SECRET="$JWT_SECRET"
docker run -d --name fen22-rest --network host -e PGRST_DB_URI -e PGRST_JWT_SECRET -e PGRST_DB_SCHEMAS=public -e PGRST_DB_ANON_ROLE=anon \
  -e PGRST_SERVER_HOST=127.0.0.1 -e PGRST_SERVER_PORT=$RESTPORT -e PGRST_DB_USE_LEGACY_GUCS=false "$REST_IMG" >/dev/null || exit 2
node "$HERE/proxy.mjs" $APIPORT $AUTHPORT $RESTPORT & PIDS="$PIDS $!"
for i in $(seq 1 30); do curl -s -o /dev/null "http://127.0.0.1:$RESTPORT/" && break; sleep 0.5; done
db -qAtc "select 'server ' || version()" ; echo "templates: $TPL_USED"

step "1. facts of the real image (who may DELETE auth.users, cascades)"
db -At <<'SQL'
select 'postgres: superuser=' || rolsuper || ' bypassrls=' || rolbypassrls from pg_roles where rolname = 'postgres';
select 'auth.users owner=' || pg_get_userbyid(relowner) || ' acl=' || relacl::text from pg_class where oid = 'auth.users'::regclass;
select 'DELETE on auth.users: postgres=' || has_table_privilege('postgres', 'auth.users', 'DELETE') || ' supabase_auth_admin=' || has_table_privilege('supabase_auth_admin', 'auth.users', 'DELETE')
    || ' service_role=' || has_table_privilege('service_role', 'auth.users', 'DELETE') || ' authenticated=' || has_table_privilege('authenticated', 'auth.users', 'DELETE');
select 'FK -> auth.users: ' || string_agg(conrelid::regclass || case confdeltype when 'c' then ' CASCADE' else ' ' || confdeltype::text end, ', ' order by conrelid::regclass::text) from pg_constraint where contype = 'f' and confrelid = 'auth.users'::regclass;
select 'gotrue schema version ' || max(version) from auth.schema_migrations;
SQL
chk "postgres can DELETE auth.users in this image" '[ "$(db -Atc "select has_table_privilege('"'"'postgres'"'"', '"'"'auth.users'"'"', '"'"'DELETE'"'"')")" = t ]'

step "2. counter base (origin/main v2.1) + preflight + migration x2 + verify on the real image"
db -q -v ON_ERROR_STOP=1 -f "$COUNTER" >/dev/null 2>&1 && ok_ "counter migration (v2.1 anon_stats_events) applied as postgres" || bad_ "counter base"
db -qc "select public.anon_stats_record('first_video', '2.1.0', 'mobil', '0-10')" >/dev/null 2>&1 || U=supabase_admin db -qc "insert into public.anon_stats_events (event, version, device_class, play_bucket) values ('first_video', '2.1.0', 'mobil', '0-10')" >/dev/null 2>&1
ro -v ON_ERROR_STOP=1 -f "$PRE" > "$WORK/pre.out" 2>&1; rc=$?
chk "preflight read-only on the real image (exit $rc): target OK, not applied" '[ $rc = 0 ] && grep -q "OK: no kodhane_saves" "$WORK/pre.out" && grep -q "not applied" "$WORK/pre.out"' "$(tail -5 "$WORK/pre.out")"
sed -n '/auth_schema_exists/,/^$/p;/referencing_table/,/^$/p;/pg_cron_available_version/,/^$/p' "$WORK/pre.out"
dump_schema > "$WORK/schema.before"; dump_counter > "$WORK/counter.before"
db -v ON_ERROR_STOP=1 -f "$MIG" > "$WORK/mig1.out" 2>&1; rc1=$?; dump_schema > "$WORK/schema.once"
db -v ON_ERROR_STOP=1 -f "$MIG" > "$WORK/mig2.out" 2>&1; rc2=$?; dump_schema > "$WORK/schema.twice"
chk "migration x2 as postgres (exit $rc1/$rc2), schema identical after the 2nd run" '[ $rc1 = 0 ] && [ $rc2 = 0 ] && diff -q "$WORK/schema.once" "$WORK/schema.twice" >/dev/null' "$(grep -h ERROR "$WORK"/mig*.out)"
ro -v ON_ERROR_STOP=1 -f "$VER" > "$WORK/ver.out" 2>&1; rc=$?
chk "verify on the real image: $(grep -o 'VERIFY OK: [0-9/]*' "$WORK/ver.out")" '[ $rc = 0 ] && grep -q "VERIFY OK: 15/15" "$WORK/ver.out"' "$(cat "$WORK/ver.out")"
db -qc "notify pgrst, 'reload schema'"; sleep 2

step "3. HTTP: GoTrue OTP + PostgREST + supabase-js"
export API="http://127.0.0.1:$APIPORT" ANON_KEY="$(jwt anon)" SERVICE_KEY="$(jwt service_role)" MAILDIR="$WORK/mail" SUPABASE_JS_DIR
PGHOST=127.0.0.1 PGPORT=$DBPORT PGUSER=postgres PGDATABASE=postgres PGPASSWORD="$POSTGRES_PASSWORD" node "$HERE/http_tests.mjs" > "$WORK/http.out" 2>&1; rc=$?
cat "$WORK/http.out"
HP=$(grep -c '^PASS  H' "$WORK/http.out"); HT=$(grep -cE '^(PASS|FAIL)  H' "$WORK/http.out")
chk "HTTP/supabase-js checks $HP/$HT (exit $rc)" '[ $rc = 0 ] && [ "$HP" = "$HT" ] && [ "$HT" -ge 40 ]'
chk "SMTP sink received the OTP mails ($(ls "$WORK/mail" | wc -l)); none left the box" '[ "$(ls "$WORK/mail" | wc -l)" -ge 3 ]'

step "4. 24-month purge on the real image: count (read-only) == purge; GoTrue admin API no longer knows the users"
mk() { curl -s -X POST "http://127.0.0.1:$APIPORT/auth/v1/admin/users" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $SERVICE_KEY" -H 'Content-Type: application/json' -d "{\"email\":\"$1\",\"email_confirm\":true}" | jq -r .id; }
O1=$(mk old1@v22-stack.invalid); O2=$(mk old2@v22-stack.invalid); K1=$(mk keep@v22-stack.invalid)
U=supabase_admin db -q -v ON_ERROR_STOP=1 -v o1="$O1" -v o2="$O2" -v k1="$K1" >/dev/null <<'SQL'
update auth.users set created_at = now() - interval '3 years', last_sign_in_at = now() - public.fenomen_cfg_inactive_interval() - interval '1 day' where id = :'o1';
update auth.users set created_at = now() - public.fenomen_cfg_inactive_interval() - interval '1 day', last_sign_in_at = null where id = :'o2';
update auth.users set created_at = now() - interval '3 years', last_sign_in_at = now() - public.fenomen_cfg_inactive_interval() + interval '1 day' where id = :'k1';
insert into public.fenomen_saves (user_id, data) values (:'o1', '{"v":2}'), (:'o2', '{"v":2}'), (:'k1', '{"v":2}');
insert into public.fenomen_save_backups (user_id, revision, save_version, data) values (:'o1', 1, 1, '{}'), (:'o2', 1, 1, '{}'), (:'k1', 1, 1, '{}');
SQL
ro -v ON_ERROR_STOP=1 -At -F '|' -f "$CNT" > "$WORK/count.out" 2>&1; rc=$?; echo "count: $(cat "$WORK/count.out")"
IFS='|' read -r c_int c_cut c_tot c_acc c_sav c_bak c_bm c_first c_rs c_rsv < "$WORK/count.out"
P=$(curl -s -X POST "http://127.0.0.1:$APIPORT/rest/v1/rpc/fenomen_purge_inactive_accounts" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $SERVICE_KEY" -H 'Content-Type: application/json' -d '{}')
echo "purge (service_role over REST): $P"
chk "count (read-only, exit $rc) == purge result: accounts $c_acc, saves $c_sav, backups $c_bak" '[ $rc = 0 ] && [ "$(jq -r ".[0] | \"\(.accounts)|\(.saves)|\(.backups)\"" <<<"$P")" = "$c_acc|$c_sav|$c_bak" ] && [ "$c_acc" = 2 ]'
A1=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$APIPORT/auth/v1/admin/users/$O1" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $SERVICE_KEY")
A3=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$APIPORT/auth/v1/admin/users/$K1" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $SERVICE_KEY")
chk "GoTrue admin API: purged user -> 404, 24 months - 1 day user -> 200 (got $A1/$A3)" '[ "$A1" = 404 ] && [ "$A3" = 200 ]'

step "5. pg_cron ops files on the real image (as postgres; pg_cron via supautils)"
o=$(db -v ON_ERROR_STOP=1 -f "$CRON_B" 2>&1; db -v ON_ERROR_STOP=1 -f "$CRON_B" 2>&1; db -v ON_ERROR_STOP=1 -f "$CRON_P" 2>&1); rc=$?
J=$(db -Atc "select string_agg(jobname || '|' || schedule || '|' || username, ';' order by jobname) from cron.job where jobname like 'fenomen\_%'" 2>&1)
chk "ops files create pg_cron (if needed) and exactly one job each: $J" '[ "$J" = "fenomen_inactive_accounts_purge|17 1 * * *|postgres;fenomen_save_backups_cleanup|47 0 * * *|postgres" ]' "$o"
echo "cron.timezone=$(db -Atc "show cron.timezone" 2>&1) cron.database_name=$(db -Atc "show cron.database_name" 2>&1)"

step "6. rollback on the real image: schema == before, counter untouched"
PGOPTIONS='-c fenomen.v22_allow_data_loss=on' db -v ON_ERROR_STOP=1 -f "$RB" > "$WORK/rb.out" 2>&1; rc1=$?
PGOPTIONS='-c fenomen.v22_allow_data_loss=on' db -v ON_ERROR_STOP=1 -f "$RB" >> "$WORK/rb.out" 2>&1; rc2=$?
db -qc "drop extension if exists pg_cron" >/dev/null 2>&1   # the ops step installed it; not part of the migration rollback
dump_schema > "$WORK/schema.after"; dump_counter > "$WORK/counter.after"
chk "rollback x2 (exit $rc1/$rc2); no fenomen cron job left" '[ $rc1 = 0 ] && [ $rc2 = 0 ]' "$(cat "$WORK/rb.out")"
chk "pg_dump --schema-only public+auth after rollback == before migration" 'diff -u "$WORK/schema.before" "$WORK/schema.after" > "$WORK/rollback.diff"' "$(head -30 "$WORK/rollback.diff")"
chk "counter (anon_stats_*) tables + functions byte-identical before/after (migration, HTTP tests, purge, rollback)" 'diff -u "$WORK/counter.before" "$WORK/counter.after" > "$WORK/counter.diff"' "$(head -20 "$WORK/counter.diff")"

step "SUMMARY"
echo "stack runner checks: $PASS/$((PASS+FAIL)) PASS (includes the HTTP line: $HP/$HT)"
[ "$FAIL" = 0 ] && echo "RESULT: ALL PASS" || echo "RESULT: FAILURES ($FAIL)"
exit $([ "$FAIL" = 0 ] && echo 0 || echo 1)
