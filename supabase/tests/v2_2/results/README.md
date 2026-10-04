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
| `stack-local-run*.txt` | 1 Eki'de koşulmadı; .136 dosyası aşağıda yeniden koşuldu. |

### 2026-10-01 ~21:00 TSİ: stack (HTTP) testi .136 ile yeniden koşuldu (`8a536a5` kodu)
YY onayıyla yalnız `supabase/gotrue:v2.189.0` ve `postgrest/postgrest:v14.12` çekildi.

| Dosya | Durum |
|---|---|
| `stack-local-run-136.txt` | **Yeniden koşuldu.** `PG_IMG=public.ecr.aws/supabase/postgres:17.6.1.136`. Sonuç: HTTP 56/56 (H53b, H57b dahil) + runner 14/14, ALL PASS. Verify 16/16. Temizlik gerçek GoTrue satırlarını sildi (traits yolu, 2 satır); sayım = temizlik sonucu. Host'ta psql/pg_dump yok: aynı imajın istemcisi `fen22-pgcli` yardımcı container'ından kullanıldı (`--network host`, repo salt okunur). supabase-js 2.117.2, `/tmp`'ye npm ile kuruldu. |
| `stack-local-run.txt` | **Eski** (29 Eyl, .171). .171 imajı box'ta yok, çekilmedi. |
| `audit-size-readonly-136.txt` | **Yeni.** `ops/audit_log_size_readonly.sql` yerel denemesi (200 000 sentetik satır, .136). Canlı ölçüm değildir. |

### 2026-10-03 ~02:30 TSİ: e-postayla gelen hesap silme talepleri (info@)
Box yeniden kurulmuştu: docker, dockerd ve imajların hiçbiri (.136, GoTrue, PostgREST) box'ta yoktu. Kural gereği imaj çekilmedi. Bu yüzden testler .136'da **koşulmadı**. Yerine box'a apt ile PostgreSQL 17.11 + pg_cron 1.6.5 kuruldu. Hesap silme testleri bu kümede, gerçek GoTrue auth şemasıyla koşuldu.

| Dosya | Durum |
|---|---|
| `account-delete-local-run.txt` | **Yeni.** `account_delete/run_account_delete_tests.sh`, FD_MODE=local, auth şeması `account_delete/auth_schema_fixture.sql`. Şema, .136 şema dökümünün auth kısmından alındı (23 tablo, FK'ler ve yetkiler aynı). Sonuç: 40/40 PASS (T3 P10 R6 E7 X3 D7 S4). `FD_CT=<.136 container>` modu yazıldı ama koşulmadı. |
| `sql-local-run.txt` | **Yeniden koşuldu** (host PG17.11). 91/91 + 32/32, ALL PASS. Kod `e730b8d`; migration bu commit'te değişmedi. |
| `sql-local-run-136.txt`, `stack-local-run-136.txt` | Değişmedi (1 Eki). Docker yok, yeniden koşulamadı. Test edilen kod bu commit'te değişmedi. |

### 2026-10-03 ~02:50 TSİ: refresh_tokens / flow_state `_fenomen_delete_user` içinde (YY onayı)
`_fenomen_delete_user` artık `auth.refresh_tokens` (`user_id = uid::text`) ve `auth.flow_state` (`user_id` uuid) satırlarını da siliyor. Bu tablolarda auth.users'a FK yok, cascade ile gitmiyorlardı. Hesabımı sil, 24 ay temizliği ve info@ betiği aynı fonksiyonu kullanıyor. info@ betiğindeki ayrı silme adımı kaldırıldı. Migration yerinde güncellendi (canlıda değil). Rollback değişmedi (`drop function`); round-trip testi geçiyor. Verify 16/16 (check 16 iki satırı da arıyor). Testler yeniden imaj çekilmeden, box'taki `public.ecr.aws/supabase/postgres:17.6.1.136` (ID f519727303f0) ile koşuldu.

| Dosya | Durum |
|---|---|
| `sql-local-run-136.txt` | **Yeniden koşuldu** (.136, `fen22-sql136`). 95/95 + 32/32, ALL PASS. Yeni: D11c, D11d (Hesabımı sil: oturumsuz refresh token + flow_state siliniyor, B'ninki kalıyor), P07c, P07d (24 ay: aynısı, P1/B kalıyor). |
| `sql-local-run.txt` | **Yeniden koşuldu** (host PG 17.11). 95/95 + 32/32, ALL PASS. |
| `account-delete-run-136.txt` | **Yeni.** `FD_CT=fen22-adtest` (.136, imajın auth şeması fixture ile değiştirildi). 47/47 PASS (T3 P10 R6 E7 X3 D8 S4 H3 Y3). Yeni: D4b (info@ yolu: oturumsuz refresh token + flow_state siliniyor, B'ninki kalıyor), H (aynı seed'de Hesabımı sil), Y (aynı seed'de 24 ay temizliği). |
| `account-delete-local-run.txt` | **Yeniden koşuldu** (host). 47/47 PASS. |
| `account-delete-run-136-f587eb5.txt`, `sql-local-run-136-f587eb5.txt` | `f587eb5` kodunun önceki .136 koşusu (40/40; 91/91 + 32/32). Referans için `/workspace/tmp/fenomen-account-delete-136/` klasöründen alındı. |
| `stack-local-run*.txt` | Koşulmadı: GoTrue ve PostgREST imajları box'ta yok, çekilmedi. `fenomen_delete_my_account` JSON anahtarları değişmedi. |

### 2026-10-03 ~03:20 TSİ: silme listesi (geri yüklemeden sonra silinmiş hesaplar geri gelmesin; YY isteği)
`fenomen_private.deletion_log` (uid, silme zamanı, onay ref; e-posta yok, 45 gün). `_fenomen_delete_user(uid, ref)` aynı transaction'da yazar. Dışa aktarım ve yeniden uygulama araçları: `ops/fenomen_deletion_log_export.sh`, `ops/fenomen_deletion_log_reapply.sh`. Migration yerinde güncellendi (canlıda değil), rollback listeyi ve şemayı da kaldırıyor (round trip geçiyor). Verify artık 18/18. İmaj çekilmedi; .136 box'taki `public.ecr.aws/supabase/postgres:17.6.1.136` (ID f519727303f0).

| Dosya | Durum |
|---|---|
| `sql-local-run-136.txt`, `sql-local-run.txt` | **Yeniden koşuldu** (.136 `fen22-sql136` ve host PG 17.11). 111/111 + 33/33, ALL PASS. Yeni testler: L01–L07 (Hesabımı sil listeye `self:session:<id>` yazar; anon/authenticated/service_role okuyamaz; `@`'lı ya da öneksiz ref reddedilir; 45 gün temizliği), P07e (24 ay → `purge:24m:<tarih>`). Ek runner kontrolü: pg_cron liste temizliği (canlı çalıştırma). |
| `account-delete-run-136.txt`, `account-delete-local-run.txt` | **Yeniden koşuldu.** 51/51 PASS (T3 P10 R7 E7 X3 D8 S5 H4 Y4). Yeni testler: R7 (`@`'lı approval_ref reddi), D1/D2 (liste `info:<ref>`), S5, H4, Y4. |
| `deletion-log-run-136.txt`, `deletion-log-local-run.txt` | **Yeni.** `deletion_log/run_deletion_log_tests.sh`. 30/30 PASS (T3 B2 S5 X6 R4 A10). Akış: D yedekten önce kendini siler → tam DB `pg_dump -Fc` → A info@ ile, B Hesabımı sil ile silinir → dışa aktarım (600, üzerine yazmaz, md5, değişmediyse yeni dosya yok, 45 gün budama) → DB drop + `pg_restore` (A ve B geri gelir) → reapply (A, B yeniden silinir, D atlanır) → verify 0. Liste ve tüm tablolar geri yüklemeden önceki hâliyle birebir aynı; ikinci reapply no-op; C değişmedi; md5 tutmayan ya da geçersiz satırlı dosya reddedilir ve hiçbir şey değişmez. |
| `stack-local-run*.txt` | Koşulmadı: GoTrue ve PostgREST imajları box'ta yok. `http_tests.mjs` H51'e `p_ref` eklendi (yeni imza); doğrulanmadı. |
