# v2.2 test sonuçları (yerel, atılabilir; canlıya bağlanılmadı)

| Dosya | Postgres | Nasıl |
|---|---|---|
| `sql-local-run.txt` | box'taki PostgreSQL 17.11 (Debian) + pg_cron 1.6.5, stub Supabase rolleri | `bash supabase/tests/v2_2/run-local.sh` |
| `sql-local-run-136.txt` | **supabase/postgres:17.6.1.136** (canlıdaki imaj) içindeki PostgreSQL 17.6 + pg_cron 1.6.4, stub Supabase rolleri | aynı betik, `fen22-sql136` container'ında (`--network none`, repo salt okunur, `PGBIN=/usr/lib/postgresql/bin`) |
| `stack-local-run.txt` | public.ecr.aws/supabase/postgres:17.6.1.171 (gerçek imaj init'i) + GoTrue v2.189.0 + PostgREST v14.12 | `bash supabase/tests/v2_2/stack/run-stack.sh` |
| `stack-local-run-136.txt` | **supabase/postgres:17.6.1.136** + GoTrue v2.189.0 + PostgREST v14.12 | `PG_IMG=supabase/postgres:17.6.1.136 bash supabase/tests/v2_2/stack/run-stack.sh` |

Tarih: 2026-09-29 (TSİ). .136 ile .171 arasında imaj adı dışında fark yok: aynı test sayıları, aynı hata kodları ve mesajları; postgres auth.users DELETE = true; pg_cron 1.6.4, `cron.timezone=GMT`.

Stack dosyaları 2026-09-29 ~21:25 TSİ'de iki imajla yeniden koşuldu. Nedeni: onaylanan gönderici (`fenomen@teserix.com`, "Fenomen: Kiralık Hayat") ve allow list (yalnız `https://fenomen.teserix.com`). Yeni test H01c (From başlığı) eklendi. Sonuç: HTTP 54/54 + runner 13/13, iki imajda da ALL PASS. SQL dosyaları değişmedi (auth ayarlarından etkilenmez).
