# Fenomen v2.2: Supabase Auth (GoTrue) ayar listesi (ARYEN ONAYI İÇİN)

Hedef: Dokploy `fenomen` → compose `supabase` → Environment (fenomen-api.teserix.com). **Bu dosya yalnız öneridir; hiçbir ayar değiştirilmedi, canlıya bağlanılmadı.** Secret değerleri yazılmaz, yalnız değişken adları kullanılır.

Kaynaklar (2026-09-29'da okundu):
- Resend SMTP dokümanı (resend.com/docs/send-with-smtp)
- GoTrue kaynak kodu, **v2.189.0** etiketi (canlıdaki sürüm): `internal/conf/configuration.go`, `internal/api/magic_link.go`, `internal/mailer/templatemailer/*.go`, `internal/mailer/mailmeclient/mailmeclient.go` (github.com/supabase/auth); ayrıca `README.md`
- Supabase dokümanları: auth-smtp ve auth/rate-limits

Dokploy env → GoTrue env eşlemesi: `/workspace/fenomen-infra/new-compose.yml`. Canlı değerler: `plans/fenomen-infra-status.md` (28 Eyl).
Yerel doğrulama: `supabase/tests/v2_2/stack/run-stack.sh` aynı GoTrue sürümüyle (v2.189.0) bu değişkenleri gerçekten kullandı. Sonuç dosyası: `supabase/tests/v2_2/results/stack-local-run.txt`.

İşaretler: **D** = resmî kaynaktan doğrulandı · **Y** = yerel GoTrue v2.189.0'da çalıştırılarak doğrulandı · **doğrulanmadı** = açıkça belirtildi.

## 1. SMTP (Resend)
| Ayar | Dokploy env → GoTrue env | Öneri | Canlı (infra-status) | Durum |
|---|---|---|---|---|
| Host | `SMTP_HOST` → `GOTRUE_SMTP_HOST` | `smtp.resend.com` | Resend (Kodhane ile aynı) | D |
| Port | `SMTP_PORT` → `GOTRUE_SMTP_PORT` | `465` (SMTPS) ya da `587` (STARTTLS). Resend 25/465/587/2465/2587 portlarını destekler | Kodhane ile aynı | D |
| Kullanıcı | `SMTP_USER` → `GOTRUE_SMTP_USER` | `resend` | Kodhane ile aynı | D |
| Parola | `SMTP_PASS` → `GOTRUE_SMTP_PASS` | Resend API anahtarı. Plan: **Fenomen'e ayrı, yalnız gönderim yetkili ve alan adıyla sınırlı** anahtar | **Kodhane'nin anahtarı kopyalanmış → plandan sapma** | D; değer yazılmaz |
| Gönderen adres | `SMTP_ADMIN_EMAIL` → `GOTRUE_SMTP_ADMIN_EMAIL` | `[GÖNDERİCİ]`: Fenomen'e özel adres (plan). **Açık karar (Aryen)** | `noreply@teserix.com` → sapma | D |
| Gönderen adı | `SMTP_SENDER_NAME` → `GOTRUE_SMTP_SENDER_NAME` | `Fenomen Kiralık Hayat` | aynı | D, Y |

**DNS:** Gönderen alan adı Resend panelinde "verified" durumda olmalı. Resend, alan adına özel DKIM (`resend._domainkey` TXT) ve SPF kayıtları (gönderim alt alanında MX + TXT) üretir. Kayıt değerleri panelde görülmediği için burada yazılmadı: **doğrulanmadı**. DMARC (`_dmarc` TXT, en az `p=none`) önerilir (Supabase auth-smtp rehberi). Resend'in veri bölgesi avukat listesine girmeli (yurt dışı aktarım).

## 2. OTP ve e-posta şablonları (Yazı r2)
Şablon dosyaları: `supabase/templates/` (üretici, düz metin sürümleri, bağlantı notları: `supabase/templates/README.md`). `signInWithOtp` iki ayrı şablon kullanır: yeni ya da henüz doğrulanmamış kullanıcıya **confirmation**, doğrulanmış kullanıcıya **magic_link** gider (kaynak: `internal/api/magic_link.go` v2.189.0; yerel olarak H01b / H04c ile doğrulandı). İkisi de yalnız `{{ .Token }}` gösterir; bağlantı yoktur. Varsayılan "hesabını onayla" konusu artık hiçbir yerde kullanılmıyor.

| Ayar | Dokploy env → GoTrue env | Değer | Canlı (bugün) | Durum |
|---|---|---|---|---|
| Kod uzunluğu | `AUTH_MAILER_OTP_LENGTH` → `GOTRUE_MAILER_OTP_LENGTH` | `6` (6–10 dışı → 6) | 6 | D (v2.189.0 conf), Y |
| Kod süresi | `AUTH_MAILER_OTP_EXP` → `GOTRUE_MAILER_OTP_EXP` | **`600`** (10 dakika; e-postadaki "Kod 10 dakika içinde geçerli." ile eşleşir; 0 → 86400) | 3600 → değişmeli | D, Y (stack 600 ile) |
| Yeni oyuncu konusu | `AUTH_SUBJECT_CONFIRMATION` → `GOTRUE_MAILER_SUBJECTS_CONFIRMATION` | `Fenomen: Kiralık Hayat ilk giriş kodun` | "…hesabını onayla" → değişmeli | D, Y |
| Kayıtlı oyuncu konusu | `AUTH_SUBJECT_MAGIC_LINK` → `GOTRUE_MAILER_SUBJECTS_MAGIC_LINK` | `Fenomen: Kiralık Hayat giriş kodun` | aynı | D, Y |
| Yeni oyuncu şablonu | `AUTH_TEMPLATE_CONFIRMATION` → `GOTRUE_MAILER_TEMPLATES_CONFIRMATION` | `supabase/templates/confirmation.html` dosyasının URL'i (r2 `email.codeNew`) | `http://mail-templates/confirmation.html` (eski metin, bağlantılı) | D, Y |
| Kayıtlı oyuncu şablonu | `AUTH_TEMPLATE_MAGIC_LINK` → `GOTRUE_MAILER_TEMPLATES_MAGIC_LINK` | `supabase/templates/magic_link.html` dosyasının URL'i (r2 `email.codeReturning`) | `http://mail-templates/magic-link.html` (eski metin, bağlantılı) | D, Y |
| Gönderen | `SMTP_ADMIN_EMAIL` → `GOTRUE_SMTP_ADMIN_EMAIL` | **`[GÖNDERİCİ]`: açık karar (Aryen)**. r2'de `email.from` | `noreply@teserix.com` | D |

- D: env adları GoTrue **v2.189.0** etiketindeki `internal/conf/configuration.go` dosyasından doğrulandı (`envconfig.Process("gotrue")`, `Mailer.Subjects` / `Mailer.Templates`, `Confirmation`, `MagicLink` `split_words`, `OtpExp`, `OtpLength`).
- **Açık soru: şablon URL'i nereden servis edilecek?** Canlıda compose içindeki `mail-templates` servisi kullanılıyor; dosyaların oraya nasıl konduğu görülmedi. Seçenekler `supabase/templates/README.md` içinde.
- **Risk:** GoTrue şablon URL'ini ilk yüklemede okuyamazsa varsayılan İngilizce şablonu ve konuyu (bağlantılı) kullanır (`template.go`). Uygulamadan sonra iki e-postanın konusu kontrol edilmeli.
- Düz metin: GoTrue yalnız `text/html` gönderir; `*.txt` dosyaları yalnız başvuru içindir.
- GoTrue'da kod başına deneme sayacı yok. Kaba kuvvete karşı korumalar: IP başına `/verify` limiti, Cloudflare rate limit (plan adım 4), 10 dakikalık süre ve her yeni kodun eskisini geçersiz kılması (Y: kullanılmış ya da yanlış kod → 403 `otp_expired`).

## 3. Adresler
| Ayar | Dokploy env → GoTrue env | Öneri | Canlı | Durum |
|---|---|---|---|---|
| Site URL | `SITE_URL` → `GOTRUE_SITE_URL` | `https://fenomen.teserix.com` | aynı | D |
| İzinli yönlendirmeler | `ADDITIONAL_REDIRECT_URLS` → `GOTRUE_URI_ALLOW_LIST` | yalnız `https://fenomen.teserix.com/**` | github.io adresi de var. Plan "github.io'da giriş yok" diyor → **çıkarılması önerilir** | D |
| API dış adresi | `API_EXTERNAL_URL` | `https://fenomen-api.teserix.com` | aynı | D |

## 4. Kayıt, onay ve hız limitleri
| Ayar | Dokploy env → GoTrue env | Öneri | Canlı | Durum |
|---|---|---|---|---|
| Kayıt | `DISABLE_SIGNUP` → `GOTRUE_DISABLE_SIGNUP` | `false`: ilk kodla hesap açılır, istemci `shouldCreateUser: true` gönderir | açık | D, Y |
| E-posta ile giriş | `ENABLE_EMAIL_SIGNUP` → `GOTRUE_EXTERNAL_EMAIL_ENABLED` | `true` | açık | D |
| Otomatik onay | `ENABLE_EMAIL_AUTOCONFIRM` → `GOTRUE_MAILER_AUTOCONFIRM` | `false`: kodu doğrulamak e-postayı onaylar | kapalı | D, Y |
| Telefon / anonim | `ENABLE_PHONE_SIGNUP` / `ENABLE_ANONYMOUS_USERS` → `GOTRUE_EXTERNAL_PHONE_ENABLED` / `GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED` | `false` / `false` | kapalı | D |
| Proje geneli e-posta / saat | `AUTH_RATE_LIMIT_EMAIL_SENT` → `GOTRUE_RATE_LIMIT_EMAIL_SENT` | Başlangıç `30`. Resend planının günlük ve aylık kotasıyla birlikte değerlendirilmeli; dolarsa herkes 429 alır | 30 | D |
| Aynı adrese yeni kod aralığı | `AUTH_SMTP_MAX_FREQUENCY` → `GOTRUE_SMTP_MAX_FREQUENCY` | `60s`. İstemcideki geri sayım buna uymalı; erken istek 429 `over_email_send_rate_limit` alır | 60 sn | D, Y |
| OTP isteği / IP | `AUTH_RATE_LIMIT_OTP` → `GOTRUE_RATE_LIMIT_OTP` | 15 (canlı) uygun | 15 | D. Supabase dokümanı "5 dakikada 30, 30'luk burst" diyor; GoTrue kaynağında pencere birimi **doğrulanmadı** |
| Kod doğrulama / IP | compose'da yok → `GOTRUE_RATE_LIMIT_VERIFY` | Varsayılan 30 (dokümana göre 5 dk'da). Düşürmek için compose'a eklenmesi gerekir | varsayılan | D (alan var); pencere birimi **doğrulanmadı** |
| IP başlığı | `AUTH_RATE_LIMIT_HEADER` → `GOTRUE_RATE_LIMIT_HEADER` | `CF-Connecting-IP` (tunnel arkasında gerçek IP) | aynı | D |

## 5. Captcha ve JWT
| Ayar | Env | Öneri | Durum |
|---|---|---|---|
| Captcha | `GOTRUE_SECURITY_CAPTCHA_ENABLED`, `GOTRUE_SECURITY_CAPTCHA_PROVIDER` (`hcaptcha` / `turnstile`), `GOTRUE_SECURITY_CAPTCHA_SECRET` (compose'da yok) | v2.2'de **kapalı** önerilir (Cloudflare + GoTrue limitleri yeterli). Açılırsa Turnstile; istemci `options.captchaToken` gönderir | D (conf); Turnstile ile uçtan uca **doğrulanmadı** |
| JWT süresi | `JWT_EXPIRY` → `GOTRUE_JWT_EXP` (+ `PGRST_APP_SETTINGS_JWT_EXP`) | `3600`. "Hesabımı sil" sonrasında eski token en fazla bu süre kadar geçerli kalır (CONTRACT §6). Canlı değer infra-status'ta yok: **doğrulanmadı** | D, Y |

## 6. SQL ile görülemeyen ayarlar (preflight bunları kontrol EDEMEZ)
GoTrue ayarları DB'de değil, auth konteynerinin env'inde durur. Preflight yalnız `auth.schema_migrations` sürümünü görür. Uygulamadan önce Dokploy env'inde gözle kontrol edilmesi gerekenler:
- `GOTRUE_SMTP_*`: host, port, user; pass dolu mu (değer açılmadan)
- `GOTRUE_SMTP_ADMIN_EMAIL`
- `GOTRUE_MAILER_OTP_LENGTH` (6), `GOTRUE_MAILER_OTP_EXP` (600)
- `GOTRUE_MAILER_TEMPLATES_CONFIRMATION` / `_MAGIC_LINK` (URL auth konteynerinden erişilebilir mi, içerik repo ile aynı mı) ve `GOTRUE_MAILER_SUBJECTS_CONFIRMATION` / `_MAGIC_LINK`
- `GOTRUE_SITE_URL`, `GOTRUE_URI_ALLOW_LIST`
- `GOTRUE_DISABLE_SIGNUP`, `GOTRUE_MAILER_AUTOCONFIRM`
- `GOTRUE_RATE_LIMIT_*`, `GOTRUE_SMTP_MAX_FREQUENCY`
- `GOTRUE_SECURITY_CAPTCHA_*`, `GOTRUE_JWT_EXP`
- GoTrue imaj sürümü (canlı v2.189.0)

Dışarıdan salt okunur kontrol: `GET https://fenomen-api.teserix.com/auth/v1/settings` (anon anahtarla). Yanıtta `external.email=true`, `disable_signup=false`, `mailer_autoconfirm=false` görünmeli. (Bu istek bu çalışmada yapılmadı.)
