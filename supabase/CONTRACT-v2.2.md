# Fenomen v2.2 bulut kayıt: istemci sözleşmesi (DB / API)

Migration: `migrations/20260929193000_v2_2_fenomen_cloud_save.sql`. API: `https://fenomen-api.teserix.com` (`/rest/v1`, `/auth/v1`). Aşağıdaki HTTP kodları yerel stack'te (GoTrue v2.189.0 + PostgREST v14.12 + supabase-js 2.117.2) gözlendi: `tests/v2_2/results/stack-local-run.txt`. Kong ve Cloudflare WAF test edilmedi.

## 1. Giriş (e-posta kodu, 6 hane)
```js
await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })   // kod e-postası
await supabase.auth.verifyOtp({ email, token, type: 'email' })                        // oturum
```
- `shouldCreateUser: true` zorunlu. `false` verilirse bilinmeyen adres **422 `otp_disabled`** alır.
- Yeni ya da henüz doğrulanmamış adrese "ilk giriş kodun" (confirmation), kayıtlı adrese "giriş kodun" (magic_link) e-postası gider. İkisinde de yalnız kod var, bağlantı yok (`templates/`).
- Aynı adrese 60 sn içinde ikinci istek **429 `over_email_send_rate_limit`** alır. Geri sayım 60 sn olmalı (`auth.login` `{s}`).
- Yanlış ya da kullanılmış kod → **403 `otp_expired`**. Kod 10 dakika geçerlidir (`GOTRUE_MAILER_OTP_EXP=600`, Aryen onayladı).
- Kayıt: canlıda 29 Eyl 20:39 TSİ'den beri `DISABLE_SIGNUP=true`. v2.2 push'unda `false` yapılır (runbook §5.1). Kapalıyken yeni adres kod alamaz ve hata döner; bu hatanın kodu yerelde test edilmedi. Gönderen: "Fenomen: Kiralık Hayat" <fenomen@teserix.com>.
- `emailRedirectTo` gerekmez (bağlantı yok).

## 2. Tablo `public.fenomen_saves` (kullanıcı başına 1 satır)
| Kolon | Tip | İstemci yazabilir mi | Not |
|---|---|---|---|
| `user_id` | uuid PK → auth.users (on delete cascade) | evet (= `auth.uid()`, RLS) | upsert için gönderilir |
| `data` | jsonb | evet | JSON **nesne** olmalı; `octet_length(data::text) ≤ 262144` (256 KiB) |
| `save_version` | int 1..1000000 | evet | istemci kayıt şeması sürümü |
| `revision` | bigint ≥ 1 | evet | ilk kayıt `1`; güncelleme = **sunucudaki + 1** |
| `device` | `'mobil'` \| `'masaustu'` \| null | evet | |
| `created_at`, `updated_at` | timestamptz | **hayır** (kolon yetkisi yok, trigger yazar) | gönderilirse 403 42501 |

Yetkiler: `authenticated` → SELECT; INSERT ve UPDATE yalnız yukarıdaki 5 kolonda. **DELETE yok.** RLS (FORCE): yalnız kendi satırı. `anon` → hiçbir şey (401/42501).

**Kaydetme (upsert):**
```js
await supabase.from('fenomen_saves')
  .upsert({ user_id, data, save_version, revision: serverRevision + 1, device }, { onConflict: 'user_id' })
  .select('revision, updated_at').single()
```
- İlk kayıt: `revision: 1`.
- Sunucudaki revision + 1 değilse **409 `PT409` `stale_revision`** döner. Bu durumda başka bir cihaz ilerlemiştir: kaydı yeniden çek ve **çakışma ekranını** göster. Otomatik üzerine yazma yok.
- İki cihazın aynı anda ilk kaydı yapması → 409 `23505`. Aynı şekilde ele alınır: yeniden çek.
- Boyut aşımı → **400 `23514`**. Nesne olmayan `data` da 400 `23514` alır.
- Başka kullanıcının `user_id`'si → 403 `42501`.
- Okuma: `select('data, save_version, revision, device, updated_at').maybeSingle()`. Satır yoksa `null` döner.

## 3. RPC'ler (`/rest/v1/rpc/<ad>`, POST)
| RPC | Kim | Parametreler | Dönüş | Hatalar |
|---|---|---|---|---|
| `fenomen_reset_save` | authenticated | `p_data` jsonb (yeni oyun durumu, zorunlu), `p_save_version` int = 1, `p_expected_revision` bigint = null, `p_device` text = null | `{revision, backup_id, updated_at}`. Satır yoksa revision 1, `backup_id` null | 22023 `invalid_data` (400), PT409 `stale_revision` (409), 42501 (anon 401) |
| `fenomen_list_save_backups` | authenticated | yok | satırlar: `id, revision, save_version, device, reason, created_at, expires_at, size_bytes, summary`. `summary` alanları: followers, money, fame, fameEarned, sales, playSec, lastSeen. Yeniden eskiye sıralı, `data` yok | — |
| `fenomen_delete_my_account` | authenticated | **yok** (parametre gönderilirse 404 `PGRST202`) | `{deleted: true, saves, backups, audit_entries}` (`audit_entries` = silinen GoTrue denetim kaydı sayısı; istemci kullanmak zorunda değil) | 42501 `not_authenticated` |
| `fenomen_cleanup_save_backups` | service_role | yok | silinen yedek sayısı (int) | anon/authenticated → 401/403 |
| `fenomen_purge_inactive_accounts` | service_role | `p_limit` int = null (üst sınır `fenomen_cfg_purge_batch_max()` = 100) | `accounts, saves, backups, audit_entries, remaining` | anon/authenticated → 401/403 |
| `fenomen_admin_restore_save_backup` | service_role (destek) | `p_backup_id` uuid | `{revision, backup_id, restored_from}` | PT404 `backup_not_found` |

- **"Baştan başla" yalnız `fenomen_reset_save` ile yapılır** (DELETE yetkisi yok; eski DELETE hatası tekrar edilmez). `p_expected_revision` = istemcinin bildiği sunucu revision'ı **gönderilmelidir**; böylece başka cihazın ilerlemesi habersizce sıfırlanmaz (409 → çakışma ekranı). Önceki kayıt 30 gün yedekte kalır, kullanıcı başına en fazla 5 yedek tutulur. İstemcide geri yükleme yok; destek `fenomen_admin_restore_save_backup` kullanır.
- `_fenomen_*` fonksiyonları çağrılamaz (403).

## 4. Ayarlar (tek yer, `immutable` fonksiyonlar; service_role okuyabilir)
`fenomen_cfg_inactive_interval()` = 24 ay · `fenomen_cfg_backup_retention()` = 30 gün · `fenomen_cfg_backup_max_per_user()` = 5 · `fenomen_cfg_purge_batch_max()` = 100. Metinlerdeki `{n}` (30 gün) bu değerle aynı olmalı.

## 5. Yerel kayıt
Giriş, çıkış ve hesap silme yerel kaydı (localStorage) silmez. Bulut kaydı yüklenirken yedek alınmaz (Yazı r2, kural 2).

## 6. Hesabımı sil
`rpc('fenomen_delete_my_account')`: yedekler, kayıt, kullanıcının GoTrue denetim kayıtları (`auth.audit_log_entries`, payload `actor_id` VEYA `traits.user_id` = kullanıcı; başka kullanıcının kayıtlarına dokunulmaz) ve `auth.users` satırı silinir (identities, sessions, refresh_tokens, mfa ve one_time_tokens cascade ile gider). Ardından istemci **`await supabase.auth.signOut({ scope: 'local' })`** çağırmalı. `global` de çalışır; ikisi de hatasız gözlendi.
- Risk: eski access token, süresi dolana kadar (canlı `GOTRUE_JWT_EXP`; yerel testte 3600 sn) imza olarak geçerli kalır. Canlı değer doğrulanmadı. "En geç 1 saat" metni runbook §5.4'e bağlıdır. Bu sürede PostgREST okuma **200 `[]`** döner. Yeniden kayıt yazılamaz (**409 `23503`**, FK). GoTrue `/user` → 403 `user_not_found`, refresh → 400.
- 24 ay hareketsiz hesap temizliği aynı iç fonksiyonu (`_fenomen_delete_user`) kullanır.
- Denetim kayıtları: Satır silinir. Admin işlemlerinde actor = admin, `traits.user_id` = kullanıcı olur; bu satırlar da gider. Silme payload üzerinden sıralı tarama yapar. Tablonun sahibi `supabase_auth_admin` olduğu için indeks eklenemez, büyük tabloda yavaş olabilir. Canlı boyut push sırasında runbook §5.5 ile salt okunur ölçülür. **Kalan risk:** GoTrue aynı olayları stdout loguna da yazar (`auth_audit_event`, e-posta ve IP içerir). Bu loglar SQL ile silinmez; saklama süresi Dokploy/Docker log ayarına bağlıdır (Y).

## 7. 24 ay kuralı ve oturum yenileme
Ölçüt `coalesce(last_sign_in_at, created_at) < now() - 24 ay`. `last_sign_in_at` yalnız kodla girişte güncellenir; **refresh token ile yenilemede güncellenmez** (Y). Oturumu hep açık kalan bir oyuncu, oynamaya devam etse bile 24 ay sonra aday olabilir. Bu risk runbook'taki onay adımında sayım sorgusunun `candidates_with_recent_session` / `candidates_with_recent_save` kolonlarıyla kontrol edilir. Kalıcı çözüm (ör. ölçüte `fenomen_saves.updated_at` eklemek) Aryen kararıdır.
