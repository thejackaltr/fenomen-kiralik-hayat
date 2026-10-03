#!/usr/bin/env bash
# Fenomen: SİLME LİSTESİ DIŞA AKTARIMI — fenomen_private.deletion_log'u DB'nin DIŞINA (DB volume'u dışında bir dizine) yazar.
# DB'de yalnız okur (begin transaction read only ... rollback). Runbook: docs/v2.2-bulut-kayit-runbook.md §13.
#
#   FENOMEN_DL_DIR=/etc/dokploy/fenomen-deletion-log FENOMEN_DB_CT=<Fenomen db konteyneri> bash supabase/ops/fenomen_deletion_log_export.sh
#   (ya da FENOMEN_DB_CT yerine PSQL='<stdin'den SQL okuyan, postgres rolüyle bağlanan psql komutu>')
#
# Yazdığı: $FENOMEN_DL_DIR/fenomen-deletion-log-<UTC yyyymmddThhmmssZ>.csv  (+ .csv.md5, md5sum biçimi)
#   - dizin 700, dosyalar 600 (umask 077); var olan dosyanın ÜZERİNE YAZMAZ (aynı ad varsa çıkış 4, hiçbir şey değişmez);
#   - içerik en yeni dışa aktarımla aynıysa yeni dosya yazmaz ("unchanged");
#   - kendi dışa aktarımlarından saklama süresinden (DB'den okunur: fenomen_cfg_deletion_log_retention() = 45 gün) eski olanları
#     siler; en yeni dosyayı hiçbir zaman silmez. Başka dosyaya dokunmaz.
# Çıktı yalnız sayılardır (uid / ref yazmaz: Dokploy logları). Parola: konteynerin POSTGRES_PASSWORD env'i (hiçbir yere yazılmaz).
# CSV: user_id,deleted_at_utc,approval_ref (e-posta yok). Geri yükleme sonrası: fenomen_deletion_log_reapply.sh.
set -euo pipefail
umask 077
DIR="${FENOMEN_DL_DIR:?set FENOMEN_DL_DIR (directory OUTSIDE the DB volume)}"
if [ -z "${PSQL:-}" ]; then
  CT="${FENOMEN_DB_CT:?set FENOMEN_DB_CT (the Fenomen db container) or PSQL}"
  PSQL="docker exec -i $CT sh -c 'PGPASSWORD=\"\$POSTGRES_PASSWORD\" exec psql -X -h localhost -U postgres -d postgres'"
fi
TS="${FENOMEN_DL_TS:-$(date -u +%Y%m%dT%H%M%SZ)}"   # FENOMEN_DL_TS: yalnız testler (aynı ad -> üzerine yazmama testi)
[[ "$TS" =~ ^[0-9]{8}T[0-9]{6}Z$ ]] || { echo "export: bad timestamp $TS" >&2; exit 2; }
HEADER='user_id,deleted_at_utc,approval_ref'
mkdir -p "$DIR"; chmod 700 "$DIR"
NAME="fenomen-deletion-log-$TS.csv"; FINAL="$DIR/$NAME"
TMP="$(mktemp "$DIR/.export.XXXXXX")"; trap 'rm -f "$TMP" "$TMP.raw"' EXIT

eval "$PSQL" > "$TMP.raw" <<'SQL'
\set ON_ERROR_STOP on
\set QUIET on
\pset pager off
\pset tuples_only on
\pset format unaligned
begin transaction read only;
do $chk$
begin
  if exists (select 1 from pg_catalog.pg_class where relname in ('kodhane_saves', 'acik_ofis_saves')) then
    raise exception 'WRONG TARGET: kodhane_saves/acik_ofis_saves present in database %', current_database();
  end if;
  if to_regclass('fenomen_private.deletion_log') is null or to_regprocedure('public.fenomen_cfg_deletion_log_retention()') is null then
    raise exception 'fenomen_private.deletion_log missing: apply migration 20260929193000_v2_2_fenomen_cloud_save.sql first';
  end if;
end $chk$;
select 'retention_days=' || (extract(epoch from public.fenomen_cfg_deletion_log_retention()) / 86400)::bigint;
copy (select d.user_id, to_char(d.deleted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as deleted_at_utc, d.approval_ref
        from fenomen_private.deletion_log d order by d.deleted_at, d.user_id) to stdout with (format csv, header true);
rollback;
SQL
RET="$(sed -n '1s/^retention_days=\([0-9][0-9]*\)$/\1/p' "$TMP.raw")"
[ -n "$RET" ] && [ "$(sed -n 2p "$TMP.raw")" = "$HEADER" ] || { echo "export: unexpected psql output; nothing written" >&2; exit 3; }
tail -n +2 "$TMP.raw" > "$TMP"
ROWS=$(( $(wc -l < "$TMP") - 1 ))
SUM="$(md5sum < "$TMP" | cut -c1-32)"

LATEST="$(ls -1 "$DIR" | grep -E '^fenomen-deletion-log-[0-9]{8}T[0-9]{6}Z\.csv$' | sort | tail -1 || true)"
if [ -n "$LATEST" ] && [ -f "$DIR/$LATEST.md5" ] && [ "$(cut -c1-32 "$DIR/$LATEST.md5")" = "$SUM" ]; then
  echo "export: unchanged ($ROWS rows, md5 $SUM = $LATEST); no new file"
else
  if [ -n "$LATEST" ]; then
    MISSING=$(comm -23 <(tail -n +2 "$DIR/$LATEST" | cut -d, -f1 | sort) <(tail -n +2 "$TMP" | cut -d, -f1 | sort) | wc -l)
    [ "$MISSING" = 0 ] || echo "export: WARNING: $MISSING uid(s) of $LATEST are not in the DB list any more (45-day cleanup, or a restore: run fenomen_deletion_log_reapply.sh with ALL exports)"
  fi
  if [ -e "$FINAL" ] || [ -e "$FINAL.md5" ]; then echo "export: $NAME already exists; not overwritten, nothing written" >&2; exit 4; fi
  ln "$TMP" "$FINAL" 2>/dev/null || { echo "export: $NAME already exists; not overwritten, nothing written" >&2; exit 4; }   # ln never replaces a file
  (set -o noclobber; echo "$SUM  $NAME" > "$FINAL.md5") || { echo "export: $NAME.md5 already exists; not overwritten" >&2; exit 4; }
  chmod 600 "$FINAL" "$FINAL.md5"
  echo "export: $ROWS rows -> $FINAL (md5 $SUM)"
fi

# prune own exports older than the retention (never the newest one)
CUT="$(date -u -d "-$RET days" +%Y%m%dT%H%M%SZ)"; NEWEST="$(ls -1 "$DIR" | grep -E '^fenomen-deletion-log-[0-9]{8}T[0-9]{6}Z\.csv$' | sort | tail -1)"; PR=0
for f in $(ls -1 "$DIR" | grep -E '^fenomen-deletion-log-[0-9]{8}T[0-9]{6}Z\.csv$' | sort); do
  t="${f#fenomen-deletion-log-}"; t="${t%.csv}"
  if [ "$f" != "$NEWEST" ] && [[ "$t" < "$CUT" ]]; then rm -f "$DIR/$f" "$DIR/$f.md5"; PR=$((PR+1)); fi
done
echo "export: retention $RET days; pruned $PR export(s) older than $CUT"
