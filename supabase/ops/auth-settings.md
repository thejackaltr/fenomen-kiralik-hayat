# Fenomen v2.2: Supabase Auth (GoTrue) ayar listesi

Hedef: Dokploy `fenomen` → compose `supabase` → Environment (fenomen-api.teserix.com). Secret değerleri yazılmaz, yalnız değişken adları kullanılır. Bu çalışmada canlıya bağlanılmadı, hiçbir ayar değiştirilmedi.

**Durum (2026-09-29):**
- Aşağıdaki değerleri Aryen onayladı: gönderici `fenomen@teserix.com` / "Fenomen: Kiralık Hayat", OTP 600 sn, ayrı Resend anahtarı, github.io'nun kaldırılması.
- **Uygulama v2.2 push'uyla birlikte ve ayrı bir Aryen onayıyla yapılır** (runbook §5, onay **O2**).
- Canlıda 20:39 TSİ'den beri `DISABLE_SIGNUP=true` (Aryen onayladı, DevOps uyguladı). v2.2 push'unda `false` yapılır, ama yalnız runbook §5.1'deki kontrol listesi tamamsa.

**Tek bakışta v2.2 değerleri** (Dokploy env → GoTrue env):
| Dokploy env | GoTrue env | v2.2 değeri |
|---|---|---|
| `SMTP_ADMIN_EMAIL` | `GOTRUE_SMTP_ADMIN_EMAIL` | `fenomen@teserix.com` |
| `SMTP_SENDER_NAME` | `GOTRUE_SMTP_SENDER_NAME` | `Fenomen: Kiralık Hayat` |
| `SMTP_PASS` | `GOTRUE_SMTP_PASS` | Fenomen'e ayrı, yalnız gönderme yetkili Resend anahtarı. **Değer yazılmaz**; DevOps oluşturur ve Dokploy env'ine koyar |
| `AUTH_MAILER_OTP_EXP` | `GOTRUE_MAILER_OTP_EXP` | `600` |
| `AUTH_MAILER_OTP_LENGTH` | `GOTRUE_MAILER_OTP_LENGTH` | `6` |
| `AUTH_SUBJECT_CONFIRMATION` / `AUTH_SUBJECT_MAGIC_LINK` | `GOTRUE_MAILER_SUBJECTS_CONFIRMATION` / `_MAGIC_LINK` | `Fenomen: Kiralık Hayat ilk giriş kodun` / `Fenomen: Kiralık Hayat giriş kodun` |
| `AUTH_TEMPLATE_CONFIRMATION` / `AUTH_TEMPLATE_MAGIC_LINK` | `GOTRUE_MAILER_TEMPLATES_CONFIRMATION` / `_MAGIC_LINK` | `supabase/templates/confirmation.html` / `magic_link.html` dosyalarının URL'i (açık soru: `templates/README.md`) |
| `SITE_URL` | `GOTRUE_SITE_URL` | `https://fenomen.teserix.com` |
| `ADDITIONAL_REDIRECT_URLS` | `GOTRUE_URI_ALLOW_LIST` | `https://fenomen.teserix.com` (yalnız bu; github.io **kaldırıldı**) |
| `DISABLE_SIGNUP` | `GOTRUE_DISABLE_SIGNUP` | `false` (bugün canlıda `true`; runbook §5.1 kontrol listesine bağlı) |

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
| Parola | `SMTP_PASS` → `GOTRUE_SMTP_PASS` | **Onaylandı:** Fenomen'e ayrı, yalnız gönderme yetkili (Resend "Sending access") ve mümkünse teserix.com alan adıyla sınırlı Resend API anahtarı. DevOps oluşturur ve Dokploy env'ine koyar; değer hiçbir dosyaya yazılmaz. Kodhane'nin anahtarı Fenomen'den çıkar | Kodhane'nin anahtarı kopyalanmış → v2.2'de değişir | D; değer yazılmaz |
| Gönderen adres | `SMTP_ADMIN_EMAIL` → `GOTRUE_SMTP_ADMIN_EMAIL` | **`fenomen@teserix.com`** (onaylandı) | `noreply@teserix.com` → değişir | D, Y |
| Gönderen adı | `SMTP_SENDER_NAME` → `GOTRUE_SMTP_SENDER_NAME` | **`Fenomen: Kiralık Hayat`** (onaylandı; iki nokta dahil) | `Fenomen Kiralık Hayat` → değişir | D, Y |

**DNS:** `fenomen@teserix.com` için teserix.com Resend panelinde "verified" durumda olmalı. Resend, alan adına özel DKIM (`resend._domainkey` TXT) ve SPF kayıtları (gönderim alt alanında MX + TXT) üretir. Kayıt değerleri panelde görülmediği için burada yazılmadı: **doğrulanmadı**. DMARC (`_dmarc` TXT, en az `p=none`) önerilir (Supabase auth-smtp rehberi). Resend'in veri bölgesi avukat listesine girmeli (yurt dışı aktarım).

## 2. OTP ve e-posta şablonları (Yazı r2)
Şablon dosyaları: `supabase/templates/` (üretici, düz metin sürümleri, bağlantı notları: `supabase/templates/README.md`). `signInWithOtp` iki ayrı şablon kullanır: yeni ya da henüz doğrulanmamış kullanıcıya **confirmation**, doğrulanmış kullanıcıya **magic_link** gider (kaynak: `internal/api/magic_link.go` v2.189.0; yerel olarak H01b / H04c ile doğrulandı). İkisi de yalnız `{{ .Token }}` gösterir; bağlantı yoktur. Varsayılan "hesabını onayla" konusu artık hiçbir yerde kullanılmıyor.

| Ayar | Dokploy env → GoTrue env | Değer | Canlı (bugün) | Durum |
|---|---|---|---|---|
| Kod uzunluğu | `AUTH_MAILER_OTP_LENGTH` → `GOTRUE_MAILER_OTP_LENGTH` | `6` (6–10 dışı → 6) | 6 | D (v2.189.0 conf), Y |
| Kod süresi | `AUTH_MAILER_OTP_EXP` → `GOTRUE_MAILER_OTP_EXP` | **`600`** (onaylandı; 10 dakika; e-postadaki "Kod 10 dakika içinde geçerli." ile eşleşir; 0 → 86400) | 3600 → değişmeli | D, Y (stack 600 ile) |
| Yeni oyuncu konusu | `AUTH_SUBJECT_CONFIRMATION` → `GOTRUE_MAILER_SUBJECTS_CONFIRMATION` | `Fenomen: Kiralık Hayat ilk giriş kodun` | "…hesabını onayla" → değişmeli | D, Y |
| Kayıtlı oyuncu konusu | `AUTH_SUBJECT_MAGIC_LINK` → `GOTRUE_MAILER_SUBJECTS_MAGIC_LINK` | `Fenomen: Kiralık Hayat giriş kodun` | aynı | D, Y |
| Yeni oyuncu şablonu | `AUTH_TEMPLATE_CONFIRMATION` → `GOTRUE_MAILER_TEMPLATES_CONFIRMATION` | `supabase/templates/confirmation.html` dosyasının URL'i (r2 `email.codeNew`) | `http://mail-templates/confirmation.html` (eski metin, bağlantılı) | D, Y |
| Kayıtlı oyuncu şablonu | `AUTH_TEMPLATE_MAGIC_LINK` → `GOTRUE_MAILER_TEMPLATES_MAGIC_LINK` | `supabase/templates/magic_link.html` dosyasının URL'i (r2 `email.codeReturning`) | `http://mail-templates/magic-link.html` (eski metin, bağlantılı) | D, Y |
| Gönderen | `SMTP_ADMIN_EMAIL` / `SMTP_SENDER_NAME` → `GOTRUE_SMTP_ADMIN_EMAIL` / `GOTRUE_SMTP_SENDER_NAME` | `fenomen@teserix.com`, görünen ad `Fenomen: Kiralık Hayat` (onaylandı; r2 `email.from`) | `noreply@teserix.com` | D, Y |

- D: env adları GoTrue **v2.189.0** etiketindeki `internal/conf/configuration.go` dosyasından doğrulandı (`envconfig.Process("gotrue")`, `Mailer.Subjects` / `Mailer.Templates`, `Confirmation`, `MagicLink` `split_words`, `OtpExp`, `OtpLength`).
- **Açık soru: şablon URL'i nereden servis edilecek?** Canlıda compose içindeki `mail-templates` servisi kullanılıyor; dosyaların oraya nasıl konduğu görülmedi. Seçenekler `supabase/templates/README.md` içinde.
- **Risk:** GoTrue şablon URL'ini ilk yüklemede okuyamazsa varsayılan İngilizce şablonu ve konuyu (bağlantılı) kullanır (`template.go`). Uygulamadan sonra iki e-postanın konusu kontrol edilmeli.
- Düz metin: GoTrue yalnız `text/html` gönderir; `*.txt` dosyaları yalnız başvuru içindir.
- GoTrue'da kod başına deneme sayacı yok. Kaba kuvvete karşı korumalar: IP başına `/verify` limiti, Cloudflare rate limit (plan adım 4), 10 dakikalık süre ve her yeni kodun eskisini geçersiz kılması (Y: kullanılmış ya da yanlış kod → 403 `otp_expired`).

## 3. Adresler
| Ayar | Dokploy env → GoTrue env | Öneri | Canlı | Durum |
|---|---|---|---|---|
| Site URL | `SITE_URL` → `GOTRUE_SITE_URL` | `https://fenomen.teserix.com` | aynı | D |
| İzinli yönlendirmeler | `ADDITIONAL_REDIRECT_URLS` → `GOTRUE_URI_ALLOW_LIST` | yalnız `https://fenomen.teserix.com` (onaylandı). Kod akışı yönlendirme kullanmadığı için yeterli; alt yol gerekirse (`/**`) ayrı karar | eski GitHub Pages adresi vardı → **kaldırıldı** (onaylandı) | D, Y |
| API dış adresi | `API_EXTERNAL_URL` | `https://fenomen-api.teserix.com` | aynı | D |

## 4. Kayıt, onay ve hız limitleri
| Ayar | Dokploy env → GoTrue env | Öneri | Canlı | Durum |
|---|---|---|---|---|
| Kayıt | `DISABLE_SIGNUP` → `GOTRUE_DISABLE_SIGNUP` | v2.2 push'unda `false`: ilk kodla hesap açılır, istemci `shouldCreateUser: true` gönderir. **Yalnız runbook §5.1 kontrol listesi tamamsa** | **`true`** (29 Eyl 20:39 TSİ'den beri) | D, Y |
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
- `GOTRUE_SMTP_ADMIN_EMAIL` (`fenomen@teserix.com`), `GOTRUE_SMTP_SENDER_NAME` (`Fenomen: Kiralık Hayat`)
- `GOTRUE_MAILER_OTP_LENGTH` (6), `GOTRUE_MAILER_OTP_EXP` (600)
- `GOTRUE_MAILER_TEMPLATES_CONFIRMATION` / `_MAGIC_LINK` (URL auth konteynerinden erişilebilir mi, içerik repo ile aynı mı) ve `GOTRUE_MAILER_SUBJECTS_CONFIRMATION` / `_MAGIC_LINK`
- `GOTRUE_SITE_URL` ve `GOTRUE_URI_ALLOW_LIST`: ikisi de yalnız `https://fenomen.teserix.com`
- `GOTRUE_DISABLE_SIGNUP` (bugün `true`, v2.2'de `false`), `GOTRUE_MAILER_AUTOCONFIRM` (`false`)
- `GOTRUE_RATE_LIMIT_*`, `GOTRUE_SMTP_MAX_FREQUENCY`
- `GOTRUE_SECURITY_CAPTCHA_*`, `GOTRUE_JWT_EXP`
- GoTrue imaj sürümü (canlı v2.189.0)

Dışarıdan salt okunur kontrol: `GET https://fenomen-api.teserix.com/auth/v1/settings` (anon anahtarla). v2.2 sonrasında yanıtta `external.email=true`, `disable_signup=false`, `mailer_autoconfirm=false` görünmeli (bugün `disable_signup=true` beklenir). (Bu istek bu çalışmada yapılmadı.)
