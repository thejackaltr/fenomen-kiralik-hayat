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

Sunucu şunları kendisi yazar, istemci **göndermez**: `id` (rastgele uuid) ve `created_at` (sunucu saatine göre **İstanbul günü**, yalnızca tarih; bkz. "Gün sınırı"). Bu iki alandan biri gönderilirse istek reddedilir (401 / `42501`). Listede olmayan bir alan gönderilirse (örn. `install_id`) 400 / `PGRST204` döner.

### İzinli `event` ID'leri (22)
`game_open_new`, `character_created`, `path_chosen_vlog`, `path_chosen_oyun`, `path_chosen_luks`, `first_video`, `first_edit_game`, `first_shop_buy`, `first_rent`, `first_ifsa`, `first_ifsa_ozur`, `first_ifsa_gormezden`, `first_staff`, `first_manager`, `followers_1B`, `followers_10B`, `followers_100B`, `followers_1M`, `first_sell`, `first_fame_node`, `kiraliksiz_hayat`, `session_start`

Notlar:
- `B` = bin, `M` = milyon (`followers_10B` = 10.000 takipçi). Eşikler config'te dursa bile sunucu listesi sabittir. Eşik, yol ya da aralık değişirse önce backend migration'ı gerekir, yoksa yeni değerler 400 ile reddedilir.
- `kiraliksiz_hayat` kodda `rent_free` başarımına karşılık gelir (`emit(s,'achievement',{id:'rent_free'})`).
- `path_chosen_egitim` yok (yol oynanabilir değil).
- `first_*` kuralı aşağıda ("`first_*` olayları: cihaz başına en fazla bir kez"). `session_start` 30 dk sınırı da tamamen istemcide yapılır. Bayraklar localStorage'da kalır, sunucuya gitmez.

## Gün sınırı: Europe/Istanbul (TSİ, UTC+3)
- `created_at`, sunucu saatinin **İstanbul tarihidir** (`(now() at time zone 'Europe/Istanbul')::date`). UTC tarihi değildir, istemcinin saati ya da saat dilimi de kullanılmaz.
- Örnek: 23:30 UTC'de gelen olay, İstanbul'da 02:30 olduğu için **ertesi günün** satırı olur.
- Raporlardaki "bugün", "son N gün" ve tarih aralıkları da İstanbul tarihiyle hesaplanır. 180 günlük saklama süresi de İstanbul gününe göre işler: bugün − 180'den eski satırlar silinir.
- İstemci için değişen bir şey yok: tarih gönderilmez, sunucu yazar.

## `first_*` olayları: cihaz başına en fazla bir kez, arada kayıp olabilir
Garanti "tam bir kez" değil, **"cihaz başına en fazla bir kez (başarılı gönderim olarak), arada kayıp olabilir"** şeklindedir.
1. Olay ilk kez tetiklendiğinde istemci isteği gönderir.
2. `sent_<olay>` bayrağını (örn. `sent_first_video`) **yalnızca 2xx cevap aldıktan sonra** yazar. Bayrak varsa olay bir daha gönderilmez.
3. Hata olursa (ağ hatası, zaman aşımı ya da 2xx olmayan herhangi bir cevap) bayrak yazılmaz. Bunun yerine "bekleyen" olarak işaretlenir (örn. `retry_<olay>=1`) ve **bir sonraki açılışta bir kez daha** gönderilir.
4. İkinci deneme de başarısız olursa olay **düşer**: bekleme işareti "vazgeçildi" olarak kapatılır (örn. `retry_<olay>=done`) ve olay bir daha gönderilmez. Toplamda en fazla 2 deneme yapılır, kuyruk ya da ek deneme yoktur.
- **Sunucuda tekilleştirme yok**, çünkü kimlik tutulmuyor. Kural tamamen istemcide işler. Sunucu aynı olayın ikinci satırını reddetmez, reddedemez de.
- **Olası çift sayım:** istek sunucuya ulaşıp satır yazılır ama cevap istemciye ulaşmazsa (bağlantı kopar, zaman aşımı, sekme kapanır), istemci bunu hata sayar ve bir sonraki açılışta tekrar gönderir. Bu durumda aynı olay iki kez sayılır. Rapor bunu **küçük bir hata payı** olarak kabul eder. Oranlar kesin değil, yaklaşık okunmalıdır.
- "Cihaz" aslında tarayıcı depolamasıdır (localStorage). Depolama silinir ya da başka bir tarayıcı/cihaz kullanılırsa aynı kişi yeniden sayılabilir. Bu da aynı hata payının parçasıdır.
- Kayıp da olabilir: iki deneme de başarısız olursa, ya da oyuncu istatistiği kapatırsa olay hiç sayılmaz.

```js
// first_* : flag only after 2xx; one retry on the next app open; then drop
async function sendOnce(event) {               // true only on 2xx
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/anon_stats_events`, {
      method: 'POST', keepalive: true, signal: AbortSignal.timeout(5000),
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ event, version: APP_SEMVER, device_class: deviceClass(), play_bucket: playBucket() }) });
    return r.ok;                               // 2xx
  } catch { return false; }                    // network error / timeout
}
export async function trackFirst(event) {      // call when the milestone happens
  if (!statsAllowed() || localStorage.getItem(`sent_${event}`) || localStorage.getItem(`retry_${event}`)) return;
  if (await sendOnce(event)) localStorage.setItem(`sent_${event}`, 'true');
  else localStorage.setItem(`retry_${event}`, '1');           // try once more on next open
}
export async function retryPendingFirsts() {   // call once per app open
  if (!statsAllowed()) return;
  for (const event of FIRST_EVENTS) {
    if (localStorage.getItem(`retry_${event}`) !== '1' || localStorage.getItem(`sent_${event}`)) continue;
    localStorage.setItem(`retry_${event}`, 'done');            // at most one retry, even if the tab dies
    if (await sendOnce(event)) localStorage.setItem(`sent_${event}`, 'true');
  }
}
```
Bu kod oyun akışını bekletmez (`await` yalnızca bu fonksiyonların içinde; oyun kodu sonucu beklemez). `supabase-js` ile de aynı kural geçerli: `const { error } = await supabase.from('anon_stats_events').insert({...})` çağrısında `!error` 2xx demektir. `fetch` ile `r.ok` kullanılır.

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
- Gönder ve unut. `await` ile oyun akışı bekletilmez, UI'da hata gösterilmez, kuyruk yok (kapsam dışı). `first_*` dışındaki olaylarda (`game_open_new`, `character_created`, `path_chosen_*`, `followers_*`, `kiraliksiz_hayat`, `session_start`) yeniden deneme de yok; internet yoksa olay sessizce düşer. `first_*` için tek yeniden deneme kuralı yukarıda.
- `201`: tamam. `400` (`23514` / `PGRST204` / `23502`): payload hatası, yani kod hatası; yalnızca DEV'de console'a yazılır. `401` (`42501`): yanlış çağrı (`.select()`, fazladan alan) ya da anahtar/config hatası. `429` / `5xx` / ağ hatası: düşürülür.
- `first_*`: `sent_<olay>` bayrağı yalnızca 2xx sonrası yazılır. Hata olursa bir sonraki açılışta tek bir deneme daha yapılır, o da olmazsa olay düşer (bkz. "`first_*` olayları"). Cevap kaybolursa çift sayım olabilir ve bu kabul edilmiş bir hata payıdır.
- İlk açılış bilgilendirmesi kapanmadan ve "Kapat" seçildiyse **hiç istek gitmez**. Ayarlar'daki anahtar kapatılınca gönderim hemen durur.

## Gönderilmeyecekler
Hiçbir kalıcı ya da geçici kimlik gönderilmez: `install_id`, oturum ID'si, oturum numarası, rastgele sayaç/uuid, supabase kullanıcı id'si. Bunlara ek olarak şunlar da gönderilmez: e-posta, isim, takma ad, karakter ya da kanal adı, kayıt dosyası içeriği ya da özeti, IP, user agent, dil/saat dilimi, ekran çözünürlüğü, konum, kesin oynama süresi ya da zaman damgası, referrer/UTM, parmak izi çıkarmaya yarayabilecek herhangi bir alan. İzinli dört alan dışında hiçbir alan eklenmez; eklenirse sunucu isteği zaten reddeder.
