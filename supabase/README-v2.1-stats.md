# supabase/: Fenomen v2.1 isimsiz sayaç (sunucu tarafı)

| Dosya | Ne |
|---|---|
| `migrations/20260928150000_v2_1_anon_stats_events.sql` | Tablo, CHECK'ler, RLS (enabled + forced), yetkiler, 180 gün temizlik fonksiyonu, pg_cron işi (varsa) |
| `rollback/20260928150000_v2_1_anon_stats_events_down.sql` | Geri alma: cron işi, policy'ler, tablo, fonksiyonlar. **Tüm sayaç verisini siler.** Idempotent. |
| `ops/anon_stats_schedule_cleanup.sql` | pg_cron migration'dan SONRA açılırsa günlük işi kurar |
| `reports/v2.1-funnel.sql` | Huni raporu (adım oranları, 5'ten küçük sayılar bastırılır) |
| `CONTRACT-v2.1-stats.md` | Frontend sözleşmesi |
| `tests/run-local.sh` | Yerel, geçici Postgres + PostgREST + supabase-js testi. Gerçek DB'ye bağlanmaz. |
| `tests/results/2026-09-28-local-run.txt` | Son yerel test çıktısı |

## Uygulama (henüz HİÇBİR gerçek DB'ye uygulanmadı)
Fenomen Supabase'inde (Kodhane'de değil!) tablo sahibi olacak rolle (`postgres`), tek transaction içinde çalıştırın:
`psql -1 -v ON_ERROR_STOP=1 -f supabase/migrations/20260928150000_v2_1_anon_stats_events.sql`
Studio SQL editörü de dosyanın tamamını tek transaction olarak çalıştırır.
- **Tekrar çalıştırma:** bilerek idempotent değil. İkinci çalıştırma `CREATE TABLE` adımında `42P07 relation already exists` hatası verir, atomik olduğu için hiçbir şey değişmez (yerelde test edildi). Yeniden kurmak için önce rollback çalıştırın.
- supabase CLI kullanılırsa dosya `migrations/` altında olduğu için olduğu gibi alınır. Rollback bilerek bu klasörün dışında.
- Uyguladıktan sonra PostgREST şema önbelleği yenilenmeli (`notify pgrst, 'reload schema';` ya da rest konteynerini yeniden başlatmak).

## Temizlik zamanlaması
- pg_cron varsa migration `fenomen_anon_stats_cleanup` işini kurar: her gün `17 0 * * *` UTC (03:17 TSİ), komutu `select public.anon_stats_cleanup()`. Fonksiyon 180 günden eski satırları siler (bugün − 180'den eski `created_at`) ve silinen satır sayısını döner.
- pg_cron yoksa migration yalnızca NOTICE verir ve iş kurulmaz. Seçenekler:
  1. **Önerilen:** pg_cron'u açın. supabase/postgres imajı eklentiyi önyüklüyor; admin olarak `create extension if not exists pg_cron with schema pg_catalog; grant usage on schema cron to postgres;` çalıştırın. Sonra `ops/anon_stats_schedule_cleanup.sql` dosyasını `postgres` rolüyle çalıştırın.
  2. Dokploy zamanlanmış işi ya da puffin crontab'ı, günde bir kez db konteyneri içinde: `sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -h localhost -U postgres -d postgres -c "select public.anon_stats_cleanup()"'`. Parola konteynerin kendi ortamından okunur, hiçbir dosyaya yazılmaz.
  3. Son çare: service anahtarıyla `POST /rest/v1/rpc/anon_stats_cleanup`. Yalnızca `service_role` EXECUTE yetkisine sahip. Anahtar yalnızca zamanlayıcının gizli deposunda durur.
- Elle kontrol: `select public.anon_stats_cleanup();` (postgres veya service_role). pg_cron kayıtları `cron.job_run_details` tablosunda.
- Yasal üst sınır: süre dolduktan sonra 3 ay (KVKK araştırması §5.2). Hedef günlük silmek.

## Güvenlik modeli (özet)
- `anon` ve `authenticated`: yalnızca 4 payload kolonunda INSERT (kolon bazlı GRANT). Tabloda SELECT, UPDATE, DELETE ya da TRUNCATE yetkisi yok, fonksiyonlarda EXECUTE yok. INSERT policy'si yalnızca "bugün" tarihli satıra izin verir. Bir istekte en fazla 5 satır (trigger).
- Supabase'in varsayılan "public'teki her şeyi anon'a ver" yetkileri migration'da açıkça geri alınıyor (testte bu varsayılanlar da taklit edildi).
- FORCE RLS olduğu için sahip (`postgres`) de RLS'e tabi. Sahibe iki policy verildi: rapor için SELECT ve yalnızca süresi dolmuş satırlar için DELETE (temizlik fonksiyonu). UPDATE policy'si hiç kimse için yok. `service_role` (BYPASSRLS) için: SELECT, INSERT, DELETE var, UPDATE yok.
- Tabloda kimlik, IP ya da serbest metin yok. `id` sıralı değil, rastgele uuid. `created_at` yalnızca tarih. Kong/Cloudflare erişim loglarındaki IP ayrı bir konu (aydınlatma metni ve log saklama süresi).
