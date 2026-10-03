#!/usr/bin/env bash
# Fenomen: SİLME LİSTESİNİ GERİ YÜKLEMEDEN SONRA YENİDEN UYGULAMA (reapply) ve DOĞRULAMA (verify).
# Runbook: docs/v2.2-bulut-kayit-runbook.md §13.4. ÖNCE API kapalı olmalı (GoTrue/PostgREST durdurulmuş; yeni silme/yazma yok).
#
#   FENOMEN_DB_CT=<Fenomen db konteyneri> bash supabase/ops/fenomen_deletion_log_reapply.sh reapply <export.csv> [<export.csv> ...]
#   FENOMEN_DB_CT=<Fenomen db konteyneri> bash supabase/ops/fenomen_deletion_log_reapply.sh verify  <export.csv> [<export.csv> ...]
#   (ya da FENOMEN_DB_CT yerine PSQL='<stdin'den SQL okuyan, postgres rolüyle bağlanan psql komutu>')
#
# Girdi: fenomen_deletion_log_export.sh dosyaları; saklama süresindeki HEPSİ + geri yükleme öncesi son dışa aktarım verilir
#   (birleşim; aynı uid birden çok dosyada olabilir, en erken silme zamanı + onun referansı esas alınır).
#   Her dosyanın .md5'i doğrulanır, başlık satırı kontrol edilir; biri tutmazsa HİÇBİR ŞEY yapılmaz.
# reapply (tek transaction; hata = hiçbir şey değişmez): her uid için
#   1. fenomen_private.deletion_log'a özgün satır (uid, silme zamanı, ref) geri yazılır (varsa dokunulmaz);
#   2. kullanıcının sayılan tablolarda satırı varsa (info@ silmesiyle aynı sayım, <fenomen_del_counts>)
#      public._fenomen_delete_user(uid, özgün ref) ile yeniden silinir; yoksa atlanır ("silinecek şey yok");
#   3. Fenomen dışı satır (block) varsa durur: hiçbir şey değişmez, Aryen'e sorulur. Silme sonrası 0 satır kalmalı.
#   İkinci çalıştırma no-op'tur (hepsi atlanır).
# verify (değişiklik yok, sonunda rollback): her uid için sayılan her tabloda 0 satır + silme listesinde satır.
# Çıktı yalnız sayılar (hata mesajında ilgili uid görünür; e-posta hiçbir yerde yok).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
MODE="${1:-}"; shift || true
case "$MODE" in
  reapply) SQL="$HERE/fenomen_deletion_log_reapply.sql" ;;
  verify)  SQL="$HERE/fenomen_deletion_log_verify.sql" ;;
  *) echo "usage: $0 reapply|verify <export.csv> [<export.csv> ...]" >&2; exit 2 ;;
esac
[ $# -ge 1 ] || { echo "$MODE: pass at least one export file (all exports within the retention + the pre-restore export)" >&2; exit 2; }
if [ -z "${PSQL:-}" ]; then
  CT="${FENOMEN_DB_CT:?set FENOMEN_DB_CT (the Fenomen db container) or PSQL}"
  PSQL="docker exec -i $CT sh -c 'PGPASSWORD=\"\$POSTGRES_PASSWORD\" exec psql -X -h localhost -U postgres -d postgres'"
fi
HEADER='user_id,deleted_at_utc,approval_ref'
LINES=0
for f in "$@"; do
  b="$(basename "$f")"; d="$(cd "$(dirname "$f")" && pwd)"
  [[ "$b" =~ ^fenomen-deletion-log-[0-9]{8}T[0-9]{6}Z\.csv$ ]] || { echo "$MODE: $f is not an export file (fenomen-deletion-log-<ts>.csv); nothing done" >&2; exit 3; }
  [ -f "$d/$b.md5" ] || { echo "$MODE: $b.md5 missing; nothing done" >&2; exit 3; }
  [ "$(cut -c1-32 "$d/$b.md5")" = "$(md5sum < "$d/$b" | cut -c1-32)" ] || { echo "$MODE: md5 mismatch for $b (file changed or damaged); nothing done" >&2; exit 3; }
  [ "$(head -1 "$d/$b")" = "$HEADER" ] || { echo "$MODE: $b: unexpected header; nothing done" >&2; exit 3; }
  LINES=$(( LINES + $(wc -l < "$d/$b") - 1 ))
done
echo "$MODE: $# file(s), md5 OK, $LINES line(s)"
{
  printf '%s\n' '\set ON_ERROR_STOP on' '\set QUIET on' 'begin;' "set local lock_timeout = '5s';" "set local statement_timeout = '600s';" \
    'create temp table fenomen_dl_in (src text not null, user_id text, deleted_at_utc text, approval_ref text) on commit drop;' \
    'copy fenomen_dl_in (src, user_id, deleted_at_utc, approval_ref) from stdin with (format csv);'
  for f in "$@"; do awk -v src="$(basename "$f")" 'NR > 1 { print "\"" src "\"," $0 }' "$f"; done
  printf '%s\n' '\.'
  cat "$SQL"
} | eval "$PSQL"
