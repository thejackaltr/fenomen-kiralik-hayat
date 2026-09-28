# supabase/: Fenomen v2.1 isimsiz sayaç (sunucu tarafı)

| Dosya | Ne |
|---|---|
| `migrations/20260928150000_v2_1_anon_stats_events.sql` | Tablo, CHECK'ler, RLS (enabled + forced), yetkiler, 180 gün temizlik fonksiyonu, pg_cron işi (varsa) |
| `rollback/20260928150000_v2_1_anon_stats_events_down.sql` | Geri alma: cron işi, policy'ler, tablo, fonksiyonlar. **Tüm sayaç verisini siler.** Idempotent. |
| `ops/anon_stats_schedule_cleanup.sql` | pg_cron migration'dan SONRA açılırsa günlük işi kurar |
| `reports/v2.1-funnel.sql` | Huni raporu (adım oranları, 5'ten küçük sayılar bastırılır). Tarih aralığı ve "son N gün" İstanbul tarihiyle hesaplanır (varsayılan: son 30 gün). |
| `CONTRACT-v2.1-stats.md` | Frontend sözleşmesi |
| `tests/run-local.sh` | Yerel, geçici Postgres + PostgREST + supabase-js testi. Gerçek DB'ye bağlanmaz. Adım 10: libfaketime ile sunucu saati kaydırılmış geçici cluster'da İstanbul gün sınırı testi (`tests/50_day_boundary_tests.sql`). |
| `tests/results/2026-09-28-local-run.txt` | Son yerel test çıktısı |

## Gün sınırı
Gün sınırı **Europe/Istanbul** (TSİ, UTC+3, yaz saati yok). `created_at` varsayılanı, istemci INSERT policy'si, 180 gün saklama sınırı ve rapor aynı ifadeyi kullanır: `(now() at time zone 'Europe/Istanbul')::date`.
- Tek kaynak: `public.anon_stats_today()` (STABLE, `search_path=''`). Saklama sınırı (`anon_stats_retention_cutoff()` = bugün − 180) ve rapor bu helper'ı çağırır. anon/authenticated bu helper'ı çalıştıramaz, `service_role` çalıştırabilir.
- Kolon varsayılanı ve INSERT policy'si aynı ifadeyi **inline** kullanır. Sebebi: Postgres kolon varsayılanını da policy ifadesini de INSERT yapan rolün yetkisiyle çalıştırır. Helper'ı çağırsalardı anon'a EXECUTE yetkisi vermek gerekirdi ve helper `/rest/v1/rpc/anon_stats_today` olarak dışarı açılırdı (yerelde denendi: EXECUTE olmadan insert 42501 ile düşüyor). Metnin helper'dan sapmadığını testler kontrol ediyor (H5/H6).

## Uygulama (henüz HİÇBİR gerçek DB'ye uygulanmadı)
Önce aşağıdaki **Uygulama öncesi kontrol listesi**ni tamamlayın.
Fenomen Supabase'inde (Kodhane'de değil!) tablo sahibi olacak rolle (`postgres`), tek transaction içinde çalıştırın:
`psql -1 -v ON_ERROR_STOP=1 -f supabase/migrations/20260928150000_v2_1_anon_stats_events.sql`
Studio SQL editörü de dosyanın tamamını tek transaction olarak çalıştırır.
- **Tekrar çalıştırma:** bilerek idempotent değil. İkinci çalıştırma `CREATE TABLE` adımında `42P07 relation already exists` hatası verir, atomik olduğu için hiçbir şey değişmez (yerelde test edildi). Yeniden kurmak için önce rollback çalıştırın.
- supabase CLI kullanılırsa dosya `migrations/` altında olduğu için olduğu gibi alınır. Rollback bilerek bu klasörün dışında.
- Uyguladıktan sonra PostgREST şema önbelleği yenilenmeli (`notify pgrst, 'reload schema';` ya da rest konteynerini yeniden başlatmak).

## Temizlik zamanlaması
- pg_cron varsa migration `fenomen_anon_stats_cleanup` işini kurar: her gün `17 0 * * *` **UTC = 03:17 TSİ**, komutu `select public.anon_stats_cleanup()`. Fonksiyon İstanbul gününe göre 180 günden eski satırları siler (İstanbul bugünü − 180'den eski `created_at`) ve silinen satır sayısını döner. 03:17 TSİ'de İstanbul günü çoktan başlamış olur, yani iş her zaman "yeni" İstanbul gününde çalışır. Zamanlama değişmedi.
- pg_cron saatleri `cron.timezone` ayarına göre yorumlar (varsayılan GMT). Hedefte `show cron.timezone;` ile kontrol edin. `Europe/Istanbul` ayarlıysa aynı ifade 00:17 TSİ'de çalışır. Bu da doğru sonuç verir, ama README'deki saat artık geçerli olmaz.
- pg_cron yoksa migration yalnızca NOTICE verir ve iş kurulmaz. Seçenekler:
  1. **Önerilen:** pg_cron'u açın. supabase/postgres imajı eklentiyi önyüklüyor; admin olarak `create extension if not exists pg_cron with schema pg_catalog; grant usage on schema cron to postgres;` çalıştırın. Sonra `ops/anon_stats_schedule_cleanup.sql` dosyasını `postgres` rolüyle çalıştırın.
  2. Dokploy zamanlanmış işi ya da puffin crontab'ı, günde bir kez db konteyneri içinde: `sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -h localhost -U postgres -d postgres -c "select public.anon_stats_cleanup()"'`. Parola konteynerin kendi ortamından okunur, hiçbir dosyaya yazılmaz.
  3. Son çare: service anahtarıyla `POST /rest/v1/rpc/anon_stats_cleanup`. Yalnızca `service_role` EXECUTE yetkisine sahip. Anahtar yalnızca zamanlayıcının gizli deposunda durur.
- Elle kontrol: `select public.anon_stats_cleanup();` (postgres veya service_role). pg_cron kayıtları `cron.job_run_details` tablosunda.
- Yasal üst sınır: süre dolduktan sonra 3 ay (KVKK araştırması §5.2). Hedef günlük silmek.

## Güvenlik modeli (özet)
- `anon` ve `authenticated`: yalnızca 4 payload kolonunda INSERT (kolon bazlı GRANT). Tabloda SELECT, UPDATE, DELETE ya da TRUNCATE yetkisi yok, fonksiyonlarda EXECUTE yok. INSERT policy'si yalnızca "bugün" (İstanbul tarihi) tarihli satıra izin verir. Bir istekte en fazla 5 satır (trigger).
- Supabase'in varsayılan "public'teki her şeyi anon'a ver" yetkileri migration'da açıkça geri alınıyor (testte bu varsayılanlar da taklit edildi).
- FORCE RLS olduğu için sahip (`postgres`) de RLS'e tabi. Sahibe iki policy verildi: rapor için SELECT ve yalnızca süresi dolmuş satırlar için DELETE (temizlik fonksiyonu). UPDATE policy'si hiç kimse için yok. `service_role` (BYPASSRLS) için: SELECT, INSERT, DELETE var, UPDATE yok.
- Tabloda kimlik, IP ya da serbest metin yok. `id` sıralı değil, rastgele uuid. `created_at` yalnızca tarih. Kong/Cloudflare erişim loglarındaki IP ayrı bir konu (aydınlatma metni ve log saklama süresi).

## Uygulama öncesi kontrol listesi
Hepsi işaretlenmeden migration gerçek DB'ye uygulanmaz. Komutlardaki `<...>` alanları yer tutucudur. Anahtarları komut satırına ya da dosyaya yazmayın, gizli depodan ortam değişkenine alın.

- [ ] **1. Hedef DB gerçekten Fenomen Supabase'i mi?** Fenomen'in API'si `fenomen-api.teserix.com`. Kodhane'nin `supabase.teserix.com` adresi **değil**. Doğrulama:
  - Bağlantıyı Dokploy'da **Fenomen** stack'inin db konteynerinden açın (`docker exec` / Dokploy terminali). Kodhane stack'inin konteyneri ya da portu olmamalı. Studio kullanılıyorsa adres çubuğunda Fenomen'in Studio'su olmalı.
  - DB içinde kimlik kontrolü: `select current_database(), inet_server_addr(), inet_server_port(), (select system_identifier from pg_control_system());`. `system_identifier` her cluster için tektir. Değeri Fenomen db konteynerinde bir kez not edin, her uygulamadan önce karşılaştırın. `pg_control_system()` admin yetkisi ister.
  - Uygulamayı yapan kişi dışında ikinci bir göz: Kodhane'ye özgü tabloların bu DB'de **olmadığını** ve `select to_regclass('public.anon_stats_events')` sorgusunun `NULL` döndüğünü (henüz uygulanmamış olmalı) kontrol etsin.
- [ ] **2. pg_cron var mı?**
  - `select * from pg_available_extensions where name = 'pg_cron';` (kurulabilir mi?) ve `select * from pg_extension where extname = 'pg_cron';` (kurulu mu?). Ek olarak `show shared_preload_libraries;`, `show cron.database_name;` (`postgres` olmalı) ve `show cron.timezone;`.
  - Yoksa: yukarıdaki "Temizlik zamanlaması" bölümündeki seçenekler (1. pg_cron'u aç + `ops/anon_stats_schedule_cleanup.sql`, 2. Dokploy zamanlanmış işi / crontab ile `select public.anon_stats_cleanup()`, 3. son çare olarak service anahtarıyla RPC). Migration pg_cron olmadan da uygulanır, yalnız temizlik kurulmaz. Hangi seçeneğin seçildiği uygulama notuna yazılmalı.
- [ ] **3. Yeni tip publishable anahtar ve `Authorization: Bearer` staging'de geçiyor mu?** İstemci `apikey: sb_publishable_…` gönderir. supabase-js oturum yokken aynı anahtarı `Authorization: Bearer sb_publishable_…` olarak da ekler. Self-hosted gateway (Kong ya da 2026-08'den itibaren varsayılan olan Envoy) opak anahtarı iç JWT'ye çevirmezse PostgREST Bearer değerini JWT diye doğrulamaya çalışır ve 401 döner. Bu yüzden **staging'de**, iki başlıkla birlikte deneyin:
  ```sh
  # SB_PUBLISHABLE_KEY gizli depodan ortam değişkenine alınır; komut geçmişine yazılmaz
  curl -sS -i -X POST "https://<STAGING_HOST>/rest/v1/anon_stats_events" \
    -H "apikey: $SB_PUBLISHABLE_KEY" \
    -H "Authorization: Bearer $SB_PUBLISHABLE_KEY" \
    -H "Content-Type: application/json" -H "Prefer: return=minimal" \
    -d '{"event":"session_start","version":"2.1.0","device_class":"masaustu","play_bucket":"0-10"}'
  ```
  Beklenen: `201`, boş gövde. Aynısını `Authorization` başlığı olmadan da deneyin (beklenen `201`). `GET .../rest/v1/anon_stats_events?select=*` isteği `401`/`42501` dönmeli. Bu smoke testi staging'e gerçek bir satır yazar. Prod'da çalıştırılmaz. Staging yoksa bu madde açık kalır ve yayın bekler.
- [ ] **4. Cloudflare WAF hız sınırı (öneri).** Bu bölüm bir **öneridir**, kural henüz kurulmadı. Eşikler ölçüme dayanmıyor, **başlangıç önerisidir**. İlk hafta Cloudflare Security Events izlenip ayarlanmalı.
  - Gerekçe: meşru istemci bir oturumda birkaç istek atar (`session_start` en fazla 30 dakikada bir, `first_*` ömür boyu en fazla 2 deneme). Toplu sahte yazma ise sayıları bozar.
  - Örnek kural (Security → WAF → Rate limiting rules):
    - Eşleşme ifadesi: `(http.request.uri.path eq "/rest/v1/anon_stats_events")`. Free planda ifadede yalnızca path alanı kullanılabilir. Business ve üstünde `and http.request.method eq "POST"` ile `http.host eq "fenomen-api.teserix.com"` eklenebilir.
    - Karakteristik: IP (Free/Pro'da zorunlu).
    - Eşik: **10 saniyede 20 istek (başlangıç önerisi)**. Aşılırsa Block, süre 10 saniye (Free planda sabit). Pro ve üstünde 60 saniyede 60 istek, 10 dakika blok gibi daha uzun bir pencere düşünülebilir (yine başlangıç önerisi).
  - Not: Okul, iş yeri ve mobil operatör NAT'ında (CGNAT) çok sayıda oyuncu aynı IP'yi paylaşır. Eşik bu yüzden cömert tutuldu. 429/blok alan istemci olayı düşürür (`first_*` için bir sonraki açılışta tek bir deneme daha yapılır).
  - Free planda tek rate limiting kuralı var. Başka bir uç nokta bu kuralı zaten kullanıyorsa hangisinin korunacağına karar verilmeli.
- [ ] **5. Kong/Envoy ve Cloudflare loglarında IP (KVKK) — AÇIK KONU.** Tabloda IP yok, ama gateway (Kong/Envoy) erişim logları, Cloudflare logları ve Security Events istemci IP'sini tutar. Karar verilmesi gerekenler:
  - Gateway ve Cloudflare log **saklama süresi** kaç gün? (henüz belirlenmedi)
  - `/rest/v1/anon_stats_events` için gateway access log'u kapatılacak ya da IP maskelenecek mi?
  - Aydınlatma metninde log IP'si ve saklama süresi nasıl anlatılacak? (KVKK araştırması §5.2 / §7b)
  - Sorumlu kişi ve karar tarihi: (boş)
