# v2.2 test sonuçları (yerel, atılabilir; canlıya bağlanılmadı)

| Dosya | Postgres | Nasıl |
|---|---|---|
| `sql-local-run.txt` | box'taki PostgreSQL 17.11 (Debian) + pg_cron 1.6.5, stub Supabase rolleri | `bash supabase/tests/v2_2/run-local.sh` |
| `sql-local-run-136.txt` | **supabase/postgres:17.6.1.136** (canlıdaki imaj) içindeki PostgreSQL 17.6 + pg_cron 1.6.4, stub Supabase rolleri | aynı betik, `fen22-sql136` container'ında (`--network none`, repo salt okunur, `PGBIN=/usr/lib/postgresql/bin`) |
| `stack-local-run.txt` | public.ecr.aws/supabase/postgres:17.6.1.171 (gerçek imaj init'i) + GoTrue v2.189.0 + PostgREST v14.12 | `bash supabase/tests/v2_2/stack/run-stack.sh` |
| `stack-local-run-136.txt` | **supabase/postgres:17.6.1.136** + GoTrue v2.189.0 + PostgREST v14.12 | `PG_IMG=supabase/postgres:17.6.1.136 bash supabase/tests/v2_2/stack/run-stack.sh` |

Tarih: 2026-09-29 (TSİ). .136 ile .171 arasında imaj adı dışında fark yok: aynı test sayıları, aynı hata kodları ve mesajları; postgres auth.users DELETE = true; pg_cron 1.6.4, `cron.timezone=GMT`.

Stack dosyaları 2026-09-29 ~21:25 TSİ'de iki imajla yeniden koşuldu. Nedeni: onaylanan gönderici (`fenomen@teserix.com`, "Fenomen: Kiralık Hayat") ve allow list (yalnız `https://fenomen.teserix.com`). Yeni test H01c (From başlığı) eklendi. Sonuç: HTTP 54/54 + runner 13/13, iki imajda da ALL PASS. SQL dosyaları değişmedi (auth ayarlarından etkilenmez).

### 2026-10-01 (TSİ): hesap silme GoTrue denetim kayıtlarını da siliyor
`_fenomen_delete_user`, `auth.audit_log_entries` satırlarını siler: payload `actor_id` VEYA `traits.user_id` kullanıcıya eşit olmalı. Hem "Hesabımı sil" hem 24 ay temizliği bu fonksiyonu kullanır. Verify sonucu artık 16/16.

| Dosya | Durum |
|---|---|
| `sql-local-run-136.txt` | **Yeniden koşuldu.** İmaj `public.ecr.aws/supabase/postgres:17.6.1.136` (ID f519727303f0). Sonuç: SQL 91/91 + runner 32/32, ALL PASS. Yeni testler: D11a, D11b, P07a, P07b. D04/D08/D15/P02/P03/P08 artık `audit_entries` da kontrol ediyor. |
| `db-probe-136-audit.txt` | **Yeni.** Aynı imajın kendi auth şemasına (stub yok) migration + verify (16/16) uygulandı. Ardından gerçek tabloda iki silme yolu denendi: delete_my_account (authenticated) ve purge (postgres). Başka kullanıcının satırları korundu. authenticated, service_role ve anon tabloda DELETE yetkisine sahip değil. |
| `sql-local-run.txt` | **Eski** (ef99189, 87/87). Box'ta artık host PostgreSQL yok, yeniden koşulmadı. |
| `stack-local-run*.txt` | **Eski** (29 Eyl). Box'ta GoTrue/PostgREST imajı yok ve yeni imaj çekilmedi. Stack testleri güncellendi (run-stack.sh §4 audit sayımı, H53b, H57b) ama **koşulmadı**. |
