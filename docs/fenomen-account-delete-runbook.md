# Fenomen: e-postayla gelen hesap silme talepleri (info@)

Oyuncu hesabını oyundaki **"Hesabımı sil"** düğmesiyle kendisi silebilir. Bu runbook, talebin info@ adresine e-postayla geldiği durum içindir. Kodhane'deki süreç örnek alındı (`kodhane-account-delete-runbook.md`, `2be25eb`). Fenomen'de tek oyun ve tek mod var: hesabın tamamı silinir.

Kurallar:
- **Talep yalnız hesabın kayıtlı e-postasından geldiyse işlenir.** Başka adresten, sosyal medyadan, telefondan ya da üçüncü kişiden gelen talepte silme yapılmaz; aşağıdaki A taslağı önerilir. Bu kuralın istisnası yok.
- **Her talep için Aryen'in yazılı onayı gerekir** (adım 4). Onay yoksa silme yapılmaz.
- E-posta adresi git'e, ticket başlığına, loglara ya da onay referansına yazılmaz. Ekip içi yazışmada uid ve maskeli e-posta kullanılır.
- Yanıt e-postası bu runbook'ta yalnız taslaktır. Gönderimi info@ sorumlusu ya da Aryen yapar.
- Süre: talep alındıktan sonra en geç 30 gün içinde tamamlanır (Gizlilik metni: "Bu en geç 30 gün içinde tamamlanır").

Dosyalar (hepsi Fenomen'in kendi Supabase'inde, `postgres` rolüyle; bağlantı ve `$PSQL` kısaltması: `v2.2-bulut-kayit-runbook.md` başı):
- `supabase/ops/fenomen_account_delete_preflight.sql`: ön kontrol, salt okunur (`begin transaction read only … rollback`). Hesabı e-postayla (ya da uid ile) bulur, tablo tablo satır sayılarını ve `expect` token'ını verir.
- `supabase/ops/fenomen_account_delete.sql`: silme, tek transaction. `uid`, `confirm_uid`, `approval_ref`, `expect` zorunlu.
- `supabase/ops/fenomen_account_delete_verify.sql`: doğrulama, salt okunur. Kullanıcıya ait satır kalırsa hata verir (exit ≠ 0).
- Testler: `supabase/tests/v2_2/account_delete/run_account_delete_tests.sh` (sonuç: `supabase/tests/v2_2/results/account-delete-local-run.txt`).
- Silme listesi (geri yükleme sonrası yeniden silme): `fenomen_private.deletion_log`, `supabase/ops/fenomen_deletion_log_export.sh`, `supabase/ops/fenomen_deletion_log_reapply.sh`. Ayrıntı: v2.2 runbook §13.

## Ne silinir
Silme dosyası, "Hesabımı sil" ve 24 ay temizliğiyle **aynı iç fonksiyonu** kullanır: `public._fenomen_delete_user(uid, 'info:<approval_ref>')`. Sıra:
1. Kullanıcının `auth.users` satırı kilitlenir (`for update`); `expect` token'ı yeniden hesaplanır. Eşleşmezse hiçbir şey silinmez.
2. `_fenomen_delete_user(uid, 'info:<approval_ref>')`:
   - `auth.refresh_tokens` (`user_id = uid::text`; oturuma bağlı olan ve olmayan) ve `auth.flow_state` (`user_id`). Bu iki tablonun kullanıcıya FK'si yok; silinmezse oturumsuz eski refresh token ve PKCE kayıtları kalırdı. Silme dosyasında ayrı bir adım yok; ön kontrol ve verify bu tabloları saymaya devam eder.
   - `auth.audit_log_entries`: payload `actor_id` **VEYA** `traits.user_id` kullanıcıya eşit olan kayıtlar (büyük/küçük harf duyarsız). Başka kullanıcının kayıtlarına dokunulmaz; yalnız kullanıcının e-postasını anan başka kullanıcı kaydı da kalır.
   - `fenomen_save_backups`, `fenomen_saves`;
   - `auth.users`. `identities`, `sessions`, `mfa_*`, `one_time_tokens`, `oauth_*` ve `webauthn_*` cascade ile gider.
   - **Silme listesi:** aynı transaction'da `fenomen_private.deletion_log` tablosuna `(uid, silme zamanı, 'info:<approval_ref>')` yazılır. E-posta yazılmaz. Satır 45 gün kalır. DB yedekten geri yüklenirse hesap bu listeyle yeniden silinir (§"Geri yüklemeden sonra"). Verify bu satırı "kalan satır" saymaz, yalnız gösterir.
3. Kontrol: sayılan her tabloda kullanıcının 0 satırı kalmalı. Kalırsa her şey geri alınır.

Fenomen dışında `auth.users`'a bağlı bir tabloda (başka şema ya da `fenomen_` ile başlamayan tablo) kullanıcının satırı varsa ön kontrol `BLOCKED` der ve silme durur. O satırlar cascade ile silinir ya da sahipsiz kalırdı. Aryen'e sorulur.

**Silinmeyenler:**
- Oyuncunun cihazındaki yerel kayıt.
- GoTrue'nun stdout'a yazdığı denetim logları (`auth_audit_event`, e-posta ve IP içerir). Bunlar Dokploy/Docker log saklama süresine tabidir (v2.2 CONTRACT §6).
- Veritabanı yedekleri (Dokploy ya da pg_dump); kendi saklama sürelerince eski veriyi tutar.
- Geri alma yok. Commit sonrası veri yalnız DB yedeğinden dönülebilir.

## `expect` token'ı
`expect` = md5'in ilk 12 hanesi. Şunları kapsar:
- `auth.users`: `id`, `email`, `created_at`;
- Fenomen satır sayıları (`fenomen_saves`, `fenomen_save_backups`) ve varsa Fenomen dışı satırlar.

Böylece ön kontrolden sonra e-posta değişirse, hesap silinip yeniden açılırsa ya da kayıt/yedek sayısı değişirse silme reddedilir. Başka kullanıcının token'ı da işe yaramaz (testler E1–E5).

`last_sign_in_at`, oturumlar, refresh token'lar ve denetim kayıtları token'a **girmez**. Oyuncu oturumu açıkken her girişte ve token yenilemesinde değişirler. Token bu yüzden oyuncu oyundayken de kararlı kalır (test E7). Bunlar yine de silinir ve kontrol edilir.

## Adımlar
1. **Talebi al ve göndereni doğrula.**
   - Talep info@ kutusuna gelir. Gönderen adres (`From`) not edilir, ama git'e ya da ticket'a yazılmaz.
   - Gmail'de "Orijinali göster" ile SPF ve DKIM `PASS` olmalı. Değilse ya da `Reply-To` farklı bir adres gösteriyorsa talep kayıtlı adresten gelmiş sayılmaz.
   - Talep hesabın tamamının silinmesi mi? Yalnız "kaydımı sıfırla" gibi bir istekse oyundaki "Kaydı sil ve baştan başla" önerilir; bu runbook uygulanmaz.
2. **Ön kontrol (e-postayla).** E-posta komut satırına ya da shell geçmişine yazılmasın diye geçici bir dosyayla verilir:
   ```bash
   umask 077; printf "\\set email '%s'\n" "$TALEP_EPOSTA" > /tmp/fn_pre_$$.sql
   cat supabase/ops/fenomen_account_delete_preflight.sql >> /tmp/fn_pre_$$.sql
   PGOPTIONS='-c default_transaction_read_only=on' $PSQL -f - < /tmp/fn_pre_$$.sql; rm -f /tmp/fn_pre_$$.sql
   ```
   Çıktıda:
   - Hedef DB ve `read_only = on`.
   - `email_matches`, `uid` ve maskeli e-posta (ör. `a***@ornek.com`).
   - Hesabın açılış ve son giriş zamanı.
   - Tablo tablo satır sayıları. `act` kolonu silmenin her tabloya ne yapacağını söyler: `function`, `cascade` ya da `block`.
   - Kayıt ve yedek özeti (içerik yok).
   - `verdict | uid | expect` satırı.

   Kararlar:
   - `STOP: no auth user with this e-mail` → bu adresle hesap yok; C taslağı.
   - `STOP: N auth users …` ya da `BLOCKED: …` → **dur**, Aryen'e çıktıyla birlikte sor.
   - `OK: …` → devam. Maskeli e-posta talebin geldiği adresle uyuşmalı.
3. **Gerekirse onay e-postası.** Kayıtlı adresten geldiği şüpheliyse ya da Aryen isterse, onay sorusu **kayıtlı adrese** yeni bir e-postayla gönderilir; yanıtla değil. B1 taslağı. Olumlu yanıt gelene kadar silme yapılmaz.
4. **Aryen'in yazılı onayını al (zorunlu).**
   - Aryen'e gönderilir: uid, maskeli e-posta, ön kontrol tablosu, `expect` token'ı, talebin geliş zamanı (TSİ) ve göndereni nasıl doğruladığın (SPF/DKIM).
   - Aryen bu uid için açıkça yazılı onay verir.
   - Onay referansı verilir, ör. `FN-SIL-2026-10-03-01`. Referansta kişisel veri olmaz: e-posta (`@`) ve kontrol karakteri içeremez, en fazla 195 karakter olabilir. Referans silme listesine `info:<ref>` olarak yazılır.
   - Onay yoksa, belirsizse ya da başka bir uid içinse silme yapılmaz.
5. **Silme.** `-1` kullanma; `postgres` (ya da `supabase_admin`) rolüyle çalıştır:
   ```bash
   $PSQL -v uid=<uid> -v confirm_uid=<uid> -v approval_ref=FN-SIL-2026-10-03-01 -v expect=<token> \
         -f - < supabase/ops/fenomen_account_delete.sql
   ```
   Hiçbir şey silmeden reddettiği durumlar:
   - Parametre eksik, uid nil uuid ya da uuid değil.
   - `confirm_uid` farklı; `approval_ref` boş, `@` ya da kontrol karakteri içeriyor veya 195 karakterden uzun.
   - Silinecek bir şey yok.
   - `BLOCKED`.
   - Token eşleşmiyor: hesabın `id` / `email` / `created_at` alanı ya da Fenomen satırları ön kontrolden sonra değişmiş, veya token başka kullanıcıya ait. Bu durumda adım 2'den yeniden başlanır; yeni token yeni onay ister.

   Transaction ortasındaki her hata her şeyi geri alır (test X1). Başarılı olursa `fenomen account delete OK (approval …)` satırında her adımın sayısı yazar. Satır `deletion list: info:<ref> <UTC zaman>` ile biter; `NOT LISTED` görünürse dur ve Aryen'e bildir. `statement_timeout` 120 sn'dir. Denetim tablosu çok büyükse süre için v2.2 runbook §5.5'e bakılır.
6. **Doğrula (hemen):**
   ```bash
   PGOPTIONS='-c default_transaction_read_only=on' $PSQL -v uid=<uid> -f - < supabase/ops/fenomen_account_delete_verify.sql
   ```
   Her satır 0 olmalı ve sonuç `fenomen account delete verify OK: 0 rows left for <uid>; deletion list: info:<ref> <UTC zaman>` olmalı (`NOT LISTED` olmamalı). Kapsanan tablolar: `auth.users`, `identities`, `sessions`, `refresh_tokens`, `flow_state`, `mfa_*`, `one_time_tokens`, `oauth_*`, `webauthn_*`, `audit_log_entries`, `fenomen_saves`, `fenomen_save_backups` ve `auth.users`'a bağlı diğer tablolar.
7. **Aryen'e bildir:** onay referansı, uid ve adım sayıları. E-posta yazılmaz.
8. **İkinci doğrulama (JWT süresi dolunca).**
   - Silmeden **`GOTRUE_JWT_EXP` + 5 dakika** sonra adım 6 yeniden çalıştırılır. `GOTRUE_JWT_EXP`, v2.2 runbook §5.4'te doğrulanan canlı değerdir; 3600 ise 1 saat 5 dakika sonra. Değer doğrulanmadıysa önce §5.4 yapılır.
   - Neden: oyuncunun cihazlarında verilmiş access token süresi dolana kadar imza olarak geçerli kalır. Kayıt yazması FK hatasıyla reddedilir. Yine de bu pencerede bir satırın sonradan oluşup oluşmadığı kontrol edilir.
   - **Satır çıkarsa** (verify exit ≠ 0):
     1. Durum Aryen'e bildirilir.
     2. Yeni ön kontrol yapılır; bu kez uid ile, çünkü hesap artık e-postayla bulunamaz: `PGOPTIONS='-c default_transaction_read_only=on' $PSQL -v uid=<uid> -f - < supabase/ops/fenomen_account_delete_preflight.sql`. Sonuç `OK (leftovers): …` ve **yeni** `expect` olur.
     3. Yeni Aryen onayı alınır (yeni referans).
     4. Adım 5 yeni token'la çalıştırılır, ardından adım 6 ve 8 tekrarlanır.

     Eski token reddedilir (test S3).
   - Sonuç Aryen'e bildirilir. Ardından oyuncuya B2 taslağı gönderilebilir.

Not: Aynı e-postayla sonradan açılan hesap **yeni bir hesaptır** (yeni uid). Verify onu saymaz; yeni bir talep olmadan silinmez.

## Geri yüklemeden sonra
Fenomen DB'si yedekten geri yüklenirse, yedekten sonra silinen hesaplar (info@, "Hesabımı sil", 24 ay) geri gelir. DB içindeki silme listesi de yedekteki hâline döner. Bu yüzden liste DB dışındaki dışa aktarımlardan yeniden uygulanır. Tam akış v2.2 runbook §13.4'tedir:
1. **Geri yüklemeden önce** API durdurulur (GoTrue + PostgREST/Kong; yeni silme ya da yazma olmasın). Mevcut DB açılabiliyorsa son liste dışa aktarılır: `FENOMEN_DL_DIR=… FENOMEN_DB_CT=… bash supabase/ops/fenomen_deletion_log_export.sh`.
2. Yedek geri yüklenir (Altyapı).
3. **Yeniden uygula:** `bash supabase/ops/fenomen_deletion_log_reapply.sh reapply <dizindeki tüm fenomen-deletion-log-*.csv>`. Komut idempotenttir: silinecek şeyi olmayan uid atlanır, ikinci çalıştırma hiçbir şeyi değiştirmez.
4. **Doğrula:** `… reapply.sh verify <aynı dosyalar>` → `verify OK: … 0 rows left, N on the deletion list`. İstenirse info@ ile silinen uid'ler için adım 6 da çalıştırılır.
5. API açılır. Sonuç (uid sayısı, yeniden silinen ve atlanan sayısı) Aryen'e bildirilir. Oyunculara yeniden e-posta gönderilmez; silme zaten onaylanmış ve bildirilmişti.

## Yanıt taslakları (gönderim yok; Aryen / info@ sorumlusu gönderir)
Taslaklar, Gizlilik metninin üslubuyla yazıldı. Yayından önce Yazı'nın gözden geçirmesi önerilir. Hesabın var olup olmadığı yalnız kayıtlı adrese söylenir.

**A. Talep kayıtlı adresten gelmedi** (yanıt talebin geldiği adrese):
> Konu: Fenomen hesap silme talebin
>
> Merhaba,
>
> Hesap silme talebini aldık. Hesabını korumak için yalnızca hesabın kayıtlı olduğu e-posta adresinden gelen talepleri işleyebiliyoruz. Bu yüzden bu adresle ilgili bir hesap olup olmadığını da paylaşamıyoruz.
>
> Hesabını silmek için iki yol var:
> - Oyunda giriş yapıp Ayarlar'daki "Hesabımı sil" düğmesine basabilirsin.
> - Ya da bu talebi, Fenomen'e giriş yaptığın e-posta adresinden bu adrese yeniden gönderebilirsin.
>
> Teserix

**B1. Kayıtlı adrese onay sorusu** (yeni e-posta, yalnız adım 3 gerekiyorsa):
> Konu: Fenomen hesabını silmemizi istedin mi?
>
> Merhaba,
>
> Fenomen hesabının silinmesi için bir talep aldık. Talep sana aitse bu e-postaya "Evet, sil" diye yanıt ver. Hesabın, e-posta adresin ve bulut kaydın yedekleriyle birlikte silinecek. Bu işlem geri alınamaz. Cihazındaki oyun kaydı silinmez.
>
> Talep sana ait değilse bu e-postayı yok sayabilirsin; hesabına dokunulmaz.
>
> Teserix

**B2. Silme tamamlandı** (kayıtlı adrese, adım 8'den sonra):
> Konu: Fenomen hesabın silindi
>
> Merhaba,
>
> Talebin üzerine Fenomen hesabını sildik. Hesabın, e-posta adresin ve bulut kaydın yedekleriyle birlikte silindi. Cihazındaki oyun kaydı silinmedi; dilersen oyunu o kayıtla misafir olarak oynamaya devam edebilirsin.
>
> Aynı e-posta adresiyle yeniden giriş yaparsan yeni ve boş bir hesap açılır.
>
> Teserix

"En geç 1 saat" gibi bir oturum süresi, ancak v2.2 runbook §5.4'te doğrulanırsa eklenebilir.

**C. Kayıtlı adresten geldi ama bu adresle hesap yok** (ön kontrol `STOP: no auth user`):
> Konu: Fenomen hesap silme talebin
>
> Merhaba,
>
> Bu e-posta adresiyle kayıtlı bir Fenomen hesabı bulamadık. Oyunda başka bir e-posta adresiyle giriş yapmış olabilirsin. Öyleyse talebini o adresten gönderebilirsin.
>
> Teserix

## Testler (yerel, canlıya bağlanmaz)
```bash
bash supabase/tests/v2_2/account_delete/run_account_delete_tests.sh                    # FD_MODE=local: atılabilir PG17 + gerçek GoTrue auth şeması (fixture)
FD_CT=fen22-db bash supabase/tests/v2_2/account_delete/run_account_delete_tests.sh     # .136 container (KEEP=1 run-stack.sh sonrası)
```
Gruplar:
- **T** dosyalar: sayım sorgusu üç dosyada birebir aynı; preflight/verify salt okunur.
- **P** ön kontrol.
- **R** parametre redleri.
- **E** token.
- **X** tek transaction / BLOCKED.
- **D** silme ve verify; başka kullanıcılara dokunulmaz.
- **S** ikinci verify.
- **H** aynı seed'de "Hesabımı sil" (`fenomen_delete_my_account`, authenticated): oturumsuz refresh token ve flow_state dahil 0 satır; başka kullanıcınınki kalır.
- **Y** aynı seed'de 24 ay temizliği (`fenomen_purge_inactive_accounts`): aynı kontroller.

Silme listesi ve geri yükleme testi: `bash supabase/tests/v2_2/deletion_log/run_deletion_log_tests.sh` (`FD_CT=<.136 konteyneri>` ile de). Akış: sil (info@ + Hesabımı sil) → dışa aktar → silmeden önceki dump'ı geri yükle → yeniden uygula → verify 0. İkinci uygulama no-op olmalı; başka kullanıcılar değişmemeli.
