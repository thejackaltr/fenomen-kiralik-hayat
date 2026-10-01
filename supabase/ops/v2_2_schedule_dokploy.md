# v2.2 zamanlama: pg_cron YOKSA ya da istenmezse Dokploy alternatifi

İki iş var ve **her biri ayrı bir Aryen onayı** ister. Migration ikisini de kurmaz, çalıştırmaz.

| İş | Fonksiyon | Zaman (TSİ) | pg_cron dosyası | Onay |
|---|---|---|---|---|
| A. 30 gün yedek temizliği | `public.fenomen_cleanup_save_backups()` → silinen yedek sayısı | her gece 03:47 | `v2_2_backup_cleanup_pg_cron.sql` (`47 0 * * *` UTC) | Onay A |
| B. 24 ay hareketsiz hesap temizliği | `public.fenomen_purge_inactive_accounts()` → accounts / saves / backups / audit_entries / remaining | her gece 04:17 | `v2_2_inactive_purge_pg_cron.sql` (`17 1 * * *` UTC) | Onay B2 (ilk elle çalıştırmadan **sonra**; runbook §6) |

Tercih sırası: **1) pg_cron**, **2) Dokploy'da db konteynerinde psql**, **3) service_role ile RPC**. Üç yol da aynı fonksiyonu çağırır. EXECUTE yetkisi yalnız `postgres` (sahip) ve `service_role`'de var.

**Saat dilimi:** pg_cron UTC ile çalışır (`cron.timezone` varsayılanı GMT; yerel Supabase imajında `GMT` görüldü). TSİ = UTC+3, yaz saati uygulanmaz. Dokploy schedule'ının hangi saat dilimini kullandığı **doğrulanmadı**. Aşağıdaki cron ifadeleri UTC varsayar. Scheduler Europe/Istanbul ile çalışıyorsa A için `47 3 * * *`, B için `17 4 * * *` kullanılır.

## Seçenek 2: Fenomen db konteynerinin içinde psql
Dokploy'daki schedule/cron özelliğiyle `fenomen` → `supabase` compose'unun **db** servisinde çalışır. Parola konteynerin kendi ortam değişkeninden okunur; değer hiçbir yere yazılmaz.

A (yedek temizliği):
```sh
sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -X -h localhost -U postgres -d postgres -v ON_ERROR_STOP=1 -Atc "select public.fenomen_cleanup_save_backups()"'
```
B (24 ay temizliği; yalnız Onay B2'den sonra):
```sh
sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -X -h localhost -U postgres -d postgres -v ON_ERROR_STOP=1 -At -F " " -c "select accounts, saves, backups, audit_entries, remaining from public.fenomen_purge_inactive_accounts()"'
```
- Önkoşul: iş gerçekten **Fenomen**'in db konteynerinde çalışmalı. İlk kurulumda bir kez şunu çalıştırın: `select current_database(), (select count(*) from pg_class where relname in ('kodhane_saves','acik_ofis_saves'))`. İkinci değer `0` olmalı.
- `POSTGRES_PASSWORD`, Dokploy Supabase şablonundaki db değişkeninin adıdır. Değer kopyalanmaz.
- B her çalıştırmada en fazla `fenomen_cfg_purge_batch_max()` (100) hesap siler. `remaining > 0` ise ertesi gece devam eder.

## Seçenek 3: service_role ile RPC (son çare)
Scheduler `teserix_network` üzerindeyse istek Kong'a içeriden gider:
```sh
curl -sS -f -X POST "http://fenomen-supabase-kong:8000/rest/v1/rpc/fenomen_cleanup_save_backups" \
  -H "apikey: $FENOMEN_SERVICE_ROLE_KEY" -H "Authorization: Bearer $FENOMEN_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" -d '{}'
```
B için yol `/rest/v1/rpc/fenomen_purge_inactive_accounts` olur. `FENOMEN_SERVICE_ROLE_KEY` yalnız scheduler'ın gizli env'inde durur: repoya, loga ya da dosyaya yazılmaz, `set -x` kullanılmaz. Bu anahtar RLS'siz tam erişim verdiği için seçenek 2 tercih edilir.

## İzleme (salt okuma)
- A: `select count(*) from public.fenomen_save_backups where created_at <= now() - public.fenomen_cfg_backup_retention();` → 0 olmalı (en fazla bir günlük gecikme normal).
- B: `supabase/ops/inactive_accounts_count.sql` → `accounts_to_delete` 0'a yakın kalmalı.

## Geri alma
pg_cron için: `v2_2_backup_cleanup_pg_cron.rollback.sql` ve `v2_2_inactive_purge_pg_cron.rollback.sql`. Dokploy için: zamanlanmış işi silin ya da pasifleştirin. Silinmiş hesaplar ve yedekler geri gelmez.
