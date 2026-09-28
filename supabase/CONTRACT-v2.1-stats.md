# v2.1 isimsiz istatistik: Frontend sözleşmesi

Kaynak: `plans/fenomen-v2.1-2.3-kapsam.md` (v2.1), KVKK gerekçesi `plans/fenomen-kvkk-arastirma.md` §7(b).
Sunucu tarafı: `supabase/migrations/20260928150000_v2_1_anon_stats_events.sql`.
Bu belgede gerçek anahtar yok; `<SUPABASE_URL>` ve `<ANON_KEY>` yer tutucudur.

## Tablo ve uç nokta
- Tablo: **`public.anon_stats_events`**. İstemci yalnızca **INSERT** yapabilir. Okuma, güncelleme ve silme reddedilir (401 / `42501`).
- REST: `POST <SUPABASE_URL>/rest/v1/anon_stats_events` (`<SUPABASE_URL>` = `https://fenomen-api.teserix.com`, config'te `SUPABASE_URL` / `BASE_URL` gibi tek değer).
- Giriş ve anonim auth gerekmez. Anon (publishable) anahtar kullanılır; service anahtarı istemciye asla girmez.

## Alanlar (yalnızca bu 4 alan gönderilir)
| Alan | Tip | İzinli değerler |
|---|---|---|
| `event` | text | Aşağıdaki 22 ID'den biri. Büyük/küçük harf birebir. |
| `version` | text | Yalın semver `^\d{1,3}\.\d{1,3}\.\d{1,3}$`, 5–11 karakter, örn. `"2.1.0"`. **`__APP_VERSION__` doğrudan gönderilmez**: içinde commit sha ve build zamanı var (`2.1.0-f29b9b4-mfx…`) ve reddedilir. Şöyle gönderin: `__APP_VERSION__.split('-')[0]` (ya da package.json sürümü). |
| `device_class` | text | `"mobil"` / `"masaustu"`. Sınıf istemcide hesaplanır; user agent, ekran boyu gibi ham veriler gönderilmez. |
| `play_bucket` | text | `"0-10"`, `"10-30"`, `"30-60"`, `"60-120"`, `"120+"`. Toplam oynama dakikası `m` için aralık `[0,10)`, `[10,30)`, `[30,60)`, `[60,120)`, `≥120`. Kesin dakika gönderilmez. |

Sunucu şunları kendisi yazar, istemci **göndermez**: `id` (rastgele uuid) ve `created_at` (sunucunun UTC günü, yalnızca tarih). Bu iki alandan biri gönderilirse istek reddedilir (401 / `42501`). Listede olmayan bir alan gönderilirse (örn. `install_id`) 400 / `PGRST204` döner.

### İzinli `event` ID'leri (22)
`game_open_new`, `character_created`, `path_chosen_vlog`, `path_chosen_oyun`, `path_chosen_luks`, `first_video`, `first_edit_game`, `first_shop_buy`, `first_rent`, `first_ifsa`, `first_ifsa_ozur`, `first_ifsa_gormezden`, `first_staff`, `first_manager`, `followers_1B`, `followers_10B`, `followers_100B`, `followers_1M`, `first_sell`, `first_fame_node`, `kiraliksiz_hayat`, `session_start`

Notlar:
- `B` = bin, `M` = milyon (`followers_10B` = 10.000 takipçi). Eşikler config'te dursa bile sunucu listesi sabittir. Eşik, yol ya da aralık değişirse önce backend migration'ı gerekir, yoksa yeni değerler 400 ile reddedilir.
- `kiraliksiz_hayat` kodda `rent_free` başarımına karşılık gelir (`emit(s,'achievement',{id:'rent_free'})`).
- `path_chosen_egitim` yok (yol oynanabilir değil).
- `first_*` tekilleştirmesi ve `session_start` 30 dk sınırı tamamen istemcide yapılır (`sent_<olay>=true` bayrakları localStorage'da kalır, sunucuya gitmez).

### Limitler
- Her istekte **1 satır** gönderin. Sunucu bir istekte en fazla 5 satır kabul eder, fazlası 400 / `23514` ile reddedilir.
- Tabloda serbest metin alanı yok. Bütün değerler kapalı liste ya da sıkı formatlıdır.

## Örnek: supabase-js (`.select()` YOK)
```js
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

// fire-and-forget: never await this in gameplay code
export function track(event) {
  if (!statsAllowed()) return;                      // info band "Tamam" + Ayarlar > Gizlilik anahtarı açık
  supabase.from('anon_stats_events')
    .insert({ event, version: APP_SEMVER, device_class: deviceClass(), play_bucket: playBucket() })
    .then(({ error }) => { if (error && import.meta.env.DEV) console.warn('stats', error.code, error.message); })
    .catch(() => {});                              // offline / blocked: drop silently
}
```
`.insert(...)` çağrısının arkasına **`.select()` eklemeyin**. `.select()` satırı geri ister (`Prefer: return=representation`). Bunun için SELECT yetkisi gerekir, yetki olmadığı için istek 401 / `42501` ile reddedilir ve satır yazılmaz. Test sonucu: `.select()` olmadan supabase-js `Prefer` başlığı hiç göndermiyor, PostgREST de varsayılan olarak minimal yanıt dönüyor (201, boş gövde).

## Örnek: REST / fetch (supabase-js'siz; v2.1'de auth olmadığı için daha hafif seçenek)
```http
POST <SUPABASE_URL>/rest/v1/anon_stats_events
apikey: <ANON_KEY>
Content-Type: application/json
Prefer: return=minimal

{"event":"first_video","version":"2.1.0","device_class":"mobil","play_bucket":"10-30"}
```
Başarılı olunca `201 Created` ve boş gövde döner.
```js
fetch(`${SUPABASE_URL}/rest/v1/anon_stats_events`, {
  method: 'POST', keepalive: true, signal: AbortSignal.timeout(5000),
  headers: { apikey: ANON_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
  body: JSON.stringify({ event, version: APP_SEMVER, device_class, play_bucket })
}).catch(() => {});
```
- Klasik JWT anon anahtarı kullanılıyorsa `Authorization: Bearer <ANON_KEY>` de eklenebilir. supabase-js bunu kendisi yapar. Yalnızca `apikey` başlığıyla da istek anon rolüne düşer. **Yayından önce staging'de doğrulanmalı**, çünkü Kong/anahtar tipi gerçek sunucuda test edilmedi.
- `navigator.sendBeacon` kullanmayın: özel başlık (`apikey`) ekleyemez.

## Hata yönetimi (oyunu asla bloklamaz)
- Gönder ve unut. `await` ile oyun akışı bekletilmez, UI'da hata gösterilmez, yeniden deneme ya da kuyruk yok (kapsam dışı). İnternet yoksa olay sessizce düşer.
- `201`: tamam. `400` (`23514` / `PGRST204` / `23502`): payload hatası, yani kod hatası; yalnızca DEV'de console'a yazılır. `401` (`42501`): yanlış çağrı (`.select()`, fazladan alan) ya da anahtar/config hatası. `429` / `5xx` / ağ hatası: düşürülür.
- `first_*` bayrağı olay tetiklendiği anda yazılsın (en fazla bir kez). Yanıt kaybolunca yeniden gönderme yapılmasın, çünkü çift sayım olur. Bu bir öneridir, ürün kararı (bkz. rapor).
- İlk açılış bilgilendirmesi kapanmadan ve "Kapat" seçildiyse **hiç istek gitmez**. Ayarlar'daki anahtar kapatılınca gönderim hemen durur.

## Gönderilmeyecekler
Hiçbir kalıcı ya da geçici kimlik gönderilmez: `install_id`, oturum ID'si, oturum numarası, rastgele sayaç/uuid, supabase kullanıcı id'si. Bunlara ek olarak şunlar da gönderilmez: e-posta, isim, takma ad, karakter ya da kanal adı, kayıt dosyası içeriği ya da özeti, IP, user agent, dil/saat dilimi, ekran çözünürlüğü, konum, kesin oynama süresi ya da zaman damgası, referrer/UTM, parmak izi çıkarmaya yarayabilecek herhangi bir alan. İzinli dört alan dışında hiçbir alan eklenmez; eklenirse sunucu isteği zaten reddeder.
