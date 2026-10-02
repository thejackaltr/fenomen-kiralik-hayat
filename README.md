# Fenomen: Kiralık Hayat (çalışma adı)

Sıfırdan fenomen ol: **çek → kurgula → yayınla**. İzlenmeler para ve takipçi getirir; ekipman, kurgucu ve menajerle büyü.
Lüksü **satın al ya da kirala** — kiralık eşya videoda aynı gösterişi yapar ama her gün kira öder, Güven'i düşürür ve **İfşa** riski taşır.
Hedef: kiralık hayattan gerçek eşyalara ve yatırımlara geçmek.

**Oyna:** https://fenomen.teserix.com/ (yüklenebilir PWA, çevrimdışı çalışır). Eski adres GitHub Pages'teydi; taşıma için bkz. v2.1.

## v1 kapsamı
- Karakter yaratma (erkek/kadın, ten, saç, kanal adı) ve kariyer yolu: **Vlog** ve **Oyun yayını** oynanabilir (v2: Lüks yaşam da); Eğitim "yakında".
- Kurgu mini oyunu (oynatıcı yeşil anlardan geçerken KES) → kalite izlenmeyi çarpar. Kurgucu kurguyu sabit kaliteyle yapar, menajer otomatik video yükler (boşta ilerleme).
- Lüks eşyalar (saat ×2, koleksiyonluk ayakkabı, tablo, araba ×2, yat, villa): satın al / kirala / iade et / kiradan kurtul. Kira her oyun günü (`CFG.daySec`) ödenir, ödenemezse eşya geri alınır.
- Güven ve İfşa: kiralık eşya gösteren her video Güven'i düşürür; İfşa ihtimali `base + slope·(100−Güven)/100`. 5 İfşa kartı, "Özür videosu çek" / "Görmezden gel" seçimleri.
- Paper-doll giyim: 2 gövde + 14 giyilebilir (gri tonlamalı, çalışma anında renklendirilir), sabit katman sırası `body, bottom, top, shoes, accessory, glasses`, hepsi aynı tuval ve pivot.
- Yatırımlar (pasif gelir; videoda göstermek ekstra izlenme), FanKutusu (müstehcen olmayan parodi abonelik sayfası).
- Çevrimdışı kazanç + "Tekrar hoş geldin" penceresi (8 saat sınırı), video kapağı tarzında paylaşım kartı (1080×1920, UTM'li bağlantı).
- İlk dakikalar için rehber ipuçları. Arka uç yok: **yalnızca yerel kayıt** (`localStorage`, ID bazlı).

## v2 kapsamı
- **Lüks yaşam** kariyeri oynanabilir: kiralık eşyalar takipçiyi en çok burada artırır (`PATHS.luks.rentFollowMult`), İfşa riski (`ifsaMult`) ve Güven kaybı (`rentTrustMult`) da en yüksek. Kendi arka planı (`bg_lounge_01`) ve başlığı var.
- **Kiralık kıyafet**: gösterişli parçalar (`CFG.rent.wearMinPrice` üstü) kiralanabilir, satın alınarak kiradan kurtarılabilir ya da iade edilebilir. Aynı KİRALIK etiket katmanı: etiket yalnızca mağaza/dolapta, videoda ise ancak İfşa'dan sonra görünür (yeni kart: Etiket ifşası). Menajer kiralık kıyafet giymez.
- **Kanalı Sat** (prestij): en yüksek takipçi `FAME.minFollowers` (200 B) olunca kanal satılır, yeni hesap açılır ve kalıcı **Şöhret** kazanılır: `floor(√(en yüksek takipçi / FAME.unit))`. Kazanılan her Şöhret takipçi kazanımını +%6 artırır; harcanmamış her puan izlenmeye +%1 verir (en çok +%50).
- **Şöhret ağacı** (4 dal × 3 sıralı düğüm: Saat ve moda, Garaj, Ev ve stil, Ekip): alınan düğüm hemen ve her yeni hesapta baştan sahip olunan eşya/kıyafet/ekip/ekipman verir.
- **Başarım "Kiralıksız Hayat"**: tüm gösteriş eşyalarına aynı anda gerçekten sahip ol (+5 Şöhret, bir kez).
- **Ses**: yalnızca 3 efekt (bildirim, yazar kasa, İfşa alarmı), WebAudio ile kodda üretilir; varsayılan açık, tek dokunuşla kapanır ve hatırlanır (`fenomen_sound`).
- **Denge**: izleyici doygunluğu (`CFG.video.satFollowers/satExp`) v1'deki 30. dakikadan sonraki kontrolsüz büyümeyi durdurur; ilk Kanalı Sat 31–40. dakikada açılır, Kiralıksız Hayat tipik olarak 3.–4. hesapta (~2,5–3 saat). `npm run balance` zaman tablosunu yazdırır.
- Kayıt v1 → v2 kayıpsız taşınır (anahtar aynı: `fenomen_save_v1`, alan `v: 2`).

## v2.1 kapsamı (istemci)
- **Adres tek yerde**: `src/config.js` (`OLD_ORIGIN`, `NEW_ORIGIN`, `BASE_URL`, `MOVE`, `TELEMETRY`). Paylaşım bağlantısı (UTM etiketleri aynen), `og:image`/`og:url`/canonical `BASE_URL`'e gider. Eski adres metni yalnızca bu dosyada geçer (birim testi denetler).
- **İsimsiz sayaç** (`src/telemetry.js`): 22 sabit olay, satır başına yalnızca `event`, `version` (semver), `device_class`, `play_bucket`. Kimlik, çerez, UTM yok. İlk açılışta bilgilendirme bandı (Tamam / Kapat / Ayrıntılar), Ayarlar > Gizlilik'te anahtar. Bant yanıtlanmadan istek gitmez. `first_*` bayrağı yalnızca 2xx sonrası yazılır, başarısızsa bir sonraki açılışta bir kez yeniden denenir. `VITE_TELEMETRY_URL` + `VITE_TELEMETRY_KEY` (derleme zamanı) verilmedikçe **mock** (console.debug + bellek) çalışır. Sözleşme dosyanın başında.
- **Kaydı dışa/içe aktar** (Ayarlar > Kayıt): JSON dosya + kopyalanabilir kod, sürüm + checksum; içe aktarmadan önce iki kaydın özeti ve onay; değiştirilen kayıt `fenomen_save_backup`'ta kalır. Yedek **tek yuvadır** ve asla sessizce ezilmez: yuva doluyken yeni bir içe aktarma (dosya/kod, `#import` taşıması, seçim penceresi) onu ezecekse önce "Mevcut yedeği indir" (varsayılan; yedeği dosya olarak indirip devam eder) / "Yedeği sil ve devam et" / "Vazgeç" (hiçbir şey değişmez) adımı çıkar.
- **Sayaç bilgilendirmesi**: "Tamam" ve "Kapat" aynı sınıfla, eşit görsel ağırlıkta (KVKK). `telemetry.details` içindeki boş madde ekranda paragraf oluşturmaz.
- **Tek tıkla taşıma**: eski adreste `MOVE.startDate` ayarlanınca 60 gün (`MOVE.graceDays`) oyun + "taşındı" bandı, sonra yönlendirme sayfası. Kayıt `#import=` içinde (deflate-raw + base64url, en çok `MOVE.maxHashChars` = 16 KB; üstünde yalnızca "Kaydı indir"). Eski kayıt silinmez, `fenomen_migrated_at` ile işaretlenir; yönlendirme sayfası kendi service worker'ını ve `fenomen-*` önbelleklerini siler. Yeni adres içe aktarır, `#`'yı `history.replaceState` ile temizler; bu cihazda dolu kayıt varsa seçim penceresi çıkar, seçilmeyen yedekte kalır.

## v2.2 kapsamı (istemci): isteğe bağlı giriş + bulut kayıt
- **Giriş isteğe bağlı**: e-posta + 6 haneli kod (Supabase GoTrue, SDK yok: `src/cloud/api.js`). Girişsiz oyun hiç değişmez. Giriş yalnızca `CLOUD.loginOrigin` (fenomen.teserix.com) adresinde ve `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` derlemeye verildiyse görünür; boşsa hiçbir istek gitmez. Eski adres (github.io) girişi göstermez, Ayarlar'da "yeni adrese geç" notu çıkar (Pages'e env eklenmez).
- **Bulut kayıt** (`src/cloud/sync.js`, kurallar `src/logic/cloud.js`): cihaz kaydı esas kalır; buluta `CLOUD.syncEverySec`'te bir (değiştiyse), sayfa gizlenince / kapanınca hemen (keepalive) ve video yayınlanınca kısa süre sonra (`pushDelayMs` 2 sn, art arda olanlar tek istek, son yazımdan en az `pushGapMs` 15 sn sonra) yazılır. Revision ile iyimser kilit (sözleşme: `supabase/CONTRACT-v2.2.md`). Bulut boş → yükle; ilk videosu yayınlanmamış cihaz → bulut kaydı yedeksiz yüklenir; farklı iki kayıt → v2.1 seçim ekranı (meta, metaLast, "Önerilen": satış > toplam Şöhret > takipçi); seçilmeyenin kodu bir kez gösterilir. Başka cihazda sıfırlanan kayıt ezilmez.
- **Baştan başla (girişli)** `rpc/fenomen_reset_save` (sunucuda 30 gün yedek, oyuncu geri yükleyemez); **Hesabımı sil** `rpc/fenomen_delete_my_account`; çıkış ve silme cihaz kaydını bırakır. Sayaç ve Umami hesaba bağlanmaz.
- Giriş açık bir derleme `account.privacy.details`'te `[yer tutucu]` kaldıkça durur (`tools/legal-guard.mjs`). Testler sahte Supabase ile: `ONLY=v22 npm run smoke` (`tests/smoke/fake-supabase.mjs`).

## Geliştirme
```bash
npm ci
npm run dev        # geliştirme sunucusu
npm test           # birim testleri (node:test)
npm run build      # dist/ + sürümlü service worker (yasal metin eksikse DURUR, aşağıya bak)
ALLOW_EMPTY_LEGAL=1 npm run build   # geliştirme/test derlemesi: yasal metin boşken de derler (YAYINLANMAZ)
npm run preview    # http://localhost:4180
SHOTS=1 npm run smoke                                   # başsız duman testi (390×844 + 1280×800)
BASE=http://127.0.0.1:4191/ OLD_BASE=http://127.0.0.1:4192/ npm run smoke   # v2.1 taşıma testleri ikinci bir origin ister (dist'i ALLOW_EMPTY_LEGAL=1 ile derleyin)
ONLY=v21 npm run smoke                                  # yalnızca v2.1 akışları
npm run balance    # denge simülasyonu: tek hesap + Kanalı Sat kampanyası
npm run art        # görselleri koddan yeniden üret (CHROME=/yol/chrome)
```

### Yasal metin koruması (`ALLOW_EMPTY_LEGAL`)
`src/locales/tr.json` → `telemetry.details` son maddesi (veri sorumlusu, alıcılar, haklar) hukuk onayından sonra yazılacak. Bu madde (ya da herhangi bir madde) boşken **`npm run build` hata verir** (`tools/legal-guard.mjs`, Vite eklentisi, yalnız derlemede çalışır):
```
[legal-guard] src/locales/tr.json telemetry.details boş: son madde #8 (veri sorumlusu, alıcılar, haklar). Yasal metin yazılmadan yayın derlemesi yapılamaz. …
```
Geliştirme ve test için kaçış: `ALLOW_EMPTY_LEGAL=1 npm run build` (uyarı basar, derler). `npm run dev` ve `npm test` bu kontrolden etkilenmez. GitHub Pages iş akışı (`npm run build`) da metin yazılana kadar bilerek başarısız olur; yayın derlemesinde bu değişkeni kullanmayın.

## Yapı
- `src/logic/config.js` — **tüm sayılar ve kataloglar** (CFG). `game.js` saf oyun mantığı, `save.js` ID bazlı kayıt + doğrulama, `edit.js` kurgu kuralları.
- `src/logic/i18n.js`, `format.js` — yerelleştirme ve Intl biçimlendirme. `src/locales/tr.json` — **tüm metinler** (kaynak + yedek dil).
- `src/render/` — Canvas 2D: görsel yükleme ve renklendirme, paper-doll, video sahnesi/küçük resim.
- `src/ui/` — DOM arayüzü, paylaşım kartı, `sound.js` (WebAudio efektleri). `src/controller.js` — döngü, otomatik kayıt, çevrimdışı telafi.
- `tools/art/` — prosedürel görsel üretimi. `tools/balance.mjs` — denge simülasyonu.

Neden Phaser değil de DOM + Canvas 2D? Oyun ağırlıklı olarak menü/kart arayüzü ve katmanlı karakter çizimi; Canvas 2D ile JS paketi ~26 KB gzip kalıyor (Phaser tek başına ~340 KB).

## Yerelleştirme kuralları
- Kodda sabit metin yok; eşya/kıyafet/kariyer adları dahil her şey `tr.json`'da. Kayıtlar yalnızca ID tutar (`car_01`).
- Görsellerde metin yok; KİRALIK etiketi ve paylaşım kartı yazıları çalışma anında çizilir.
- Sayılar `Intl.NumberFormat` (tr "1,5 Mn", en "1.5M"); Intl'in kompakt aralığından sonra dilin kendi ekleri (`fmt.bigSuffixes`), sonra bilimsel gösterim. Para birimi kurgusal ve nötr (¤).
- Çoğullar `Intl.PluralRules` ile `x.one` / `x.other` anahtarları. Büyük harf `toLocaleUpperCase(locale)` (KİRALIK, İFŞA).
- Dil cihazdan algılanır, `<html lang>` güncellenir; eksik anahtar Türkçeye düşer ve geliştirme modunda konsola uyarı yazar. Dil seçici birden fazla dil olduğunda Ayarlar'da görünür. Yeni dil = `src/locales/<kod>.json`.
- `?pseudo=30` tüm metinleri %30 uzatır (arayüz taşma testi).
- Parodi isimler çevrilmez, her dilde yerel karşılığı bulunur; `tr.json` → `_notes` açıklamaları içerir.

## Lisans
Kod MIT (`LICENSE`), görseller ve sesler CC0 (`CREDITS.md`).
