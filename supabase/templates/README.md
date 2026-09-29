# Fenomen v2.2 giriş kodu e-postaları (GoTrue şablonları)

Metin kaynağı: **Yazı r2** (`/workspace/plans/fenomen-v2.2-metinler-yazi-r2.json`, `email.*`). r1 kullanılmadı. Metinler değiştirilmedi. `{kod}` yerine `{{ .Token }}` konuldu. Bağlantı ya da düğme (`{{ .ConfirmationURL }}`) yok.

| Dosya | GoTrue şablon türü | Ne zaman gider | r2 anahtarı | Konu |
|---|---|---|---|---|
| `confirmation.html` | `confirmation` ("Confirm signup") | `signInWithOtp`: adres yoksa **ya da kullanıcı var ama e-postası henüz doğrulanmamışsa** | `email.codeNew` | `Fenomen: Kiralık Hayat ilk giriş kodun` |
| `magic_link.html` | `magic_link` | `signInWithOtp`: doğrulanmış kullanıcı | `email.codeReturning` | `Fenomen: Kiralık Hayat giriş kodun` |

- `*.subject.txt`: konu satırları (env değerine birebir kopyalanır).
- `*.txt`: düz metin sürüm. **Yalnız başvuru ve önizleme için.** GoTrue v2.189.0 e-postayı yalnız `text/html` olarak gönderir (`internal/mailer/mailmeclient/mailmeclient.go`: `mail.SetBody("text/html", body)`); düz metin şablonu için bir env yok.
- Gönderen: `[GÖNDERİCİ]`. **Açık karar (Aryen).** Şablonda yer almaz; `SMTP_ADMIN_EMAIL` (→ `GOTRUE_SMTP_ADMIN_EMAIL`) ile verilir. Görünen ad `SMTP_SENDER_NAME` ile verilir.
- Üretim: `python3 supabase/templates/build_templates.py`. Kontrol: `python3 supabase/templates/build_templates.py --check` (r2 ile birebir aynı değilse exit 1; stack testi de bunu çalıştırır). HTML dosyalarını elle düzenlemeyin.
- "10 dakika" metni `GOTRUE_MAILER_OTP_EXP=600` ile eşleşir. OTP süresi değişirse metin Yazı'da değişmeli ve dosyalar yeniden üretilmeli.

## Self-hosted GoTrue bağlantısı (Dokploy `fenomen` → compose `supabase`)

| Dokploy env (compose'da var) | GoTrue env | Değer |
|---|---|---|
| `AUTH_SUBJECT_CONFIRMATION` | `GOTRUE_MAILER_SUBJECTS_CONFIRMATION` | `Fenomen: Kiralık Hayat ilk giriş kodun` |
| `AUTH_SUBJECT_MAGIC_LINK` | `GOTRUE_MAILER_SUBJECTS_MAGIC_LINK` | `Fenomen: Kiralık Hayat giriş kodun` |
| `AUTH_TEMPLATE_CONFIRMATION` | `GOTRUE_MAILER_TEMPLATES_CONFIRMATION` | `confirmation.html` dosyasının **URL**'i |
| `AUTH_TEMPLATE_MAGIC_LINK` | `GOTRUE_MAILER_TEMPLATES_MAGIC_LINK` | `magic_link.html` dosyasının **URL**'i |
| `AUTH_MAILER_OTP_EXP` | `GOTRUE_MAILER_OTP_EXP` | `600` |
| `AUTH_MAILER_OTP_LENGTH` | `GOTRUE_MAILER_OTP_LENGTH` | `6` |

**Env adlarının doğrulanması** (resmî kaynak: github.com/supabase/auth, etiket **v2.189.0** = canlı GoTrue sürümü, `internal/conf/configuration.go`, 2026-09-29'da okundu):
- `envconfig.Process("gotrue", config)` → önek `GOTRUE_`.
- `Mailer MailerConfiguration` → `GOTRUE_MAILER_`.
- `Subjects` / `Templates EmailContentConfiguration` → `_SUBJECTS_` / `_TEMPLATES_`.
- Alanlar: `Confirmation` → `CONFIRMATION`, `MagicLink` (`split_words:"true"`) → `MAGIC_LINK`.
- `OtpExp` / `OtpLength` (`split_words`) → `GOTRUE_MAILER_OTP_EXP` / `GOTRUE_MAILER_OTP_LENGTH`. Değer 0 ise 86400 kullanılır; OTP_LENGTH 6–10 dışındaysa 6 kullanılır.

Dört env adı da bu dosyadan **doğrulandı**, ayrıca yerel stack testinde aynı imajla (supabase/gotrue:v2.189.0) çalıştırıldı (`tests/v2_2/results/stack-local-run.txt`, H01b / H04c).

Hangi şablonun gideceği (`internal/api/magic_link.go`, v2.189.0): `isNewUser = kullanıcı yok || !user.IsConfirmed()`. Yeni kullanıcı için autoconfirm kapalıysa Signup çalışır ve **confirmation** gider. Doğrulanmış kullanıcıya **magic_link** gider. Sonuç: kod isteyip doğrulamayan kişi, tekrar kod istediğinde yine "ilk giriş kodun" e-postasını alır. Bu doğru davranıştır.

Şablon URL'inin okunması (`internal/mailer/templatemailer/template.go`, v2.189.0):
- `http` ile başlamıyorsa `GOTRUE_SITE_URL` önüne eklenir.
- GET isteği 10 sn zaman aşımına sahiptir, 200 dışındaki yanıt hata sayılır.
- En fazla `GOTRUE_MAILER_TEMPLATE_MAX_SIZE` (1 MB) okunur.
- Önbellek süresi `GOTRUE_MAILER_TEMPLATE_MAX_AGE` (10 dk).
- **Risk:** İlk yüklemede URL'e erişilemezse GoTrue **varsayılan İngilizce şablonu ve varsayılan konuyu** ("Confirm Your Email" / "Your Magic Link", bağlantılı) kullanır. Önbellekte eski bir kayıt varsa onu kullanmaya devam eder. Bu yüzden şablon sunucusu, auth konteynerinden önce ayakta olmalıdır. Uygulamadan sonra iki e-postanın konusu mutlaka kontrol edilmelidir (runbook).
- Şablon Go `html/template` ile işlenir. `{{ .Token }}` dışında değişken kullanılmıyor.

## AÇIK SORU: şablonlar nereden servis edilecek?
Canlıda bugün `http://mail-templates/magic-link.html` ve `http://mail-templates/confirmation.html` kullanılıyor (infra-status). Bunlar compose içinde `mail-templates` adlı bir servis. Dosyaların oraya nasıl konduğu bu çalışmada **görülmedi**. Seçenekler (karar Aryen / Altyapı):
1. Mevcut `mail-templates` servisi: iki dosya bu repodaki içerikle değiştirilir. Dosya adı `magic_link.html` ya da mevcut `magic-link.html` olabilir; URL env'i buna göre ayarlanır.
2. Dosyaları compose'a volume olarak bağlayan küçük bir statik sunucu (yalnız iç ağda).
3. Herkese açık bir URL (ör. fenomen.teserix.com altında). Önerilmez: şablonu değiştirebilen, giriş e-postasını da değiştirebilir.

Hangisi seçilirse seçilsin, URL auth konteynerinin içinden erişilebilir olmalıdır. Auth konteynerinden `wget -qO- <URL>` ile kontrol edilir (Aryen onayıyla, canlıda).
