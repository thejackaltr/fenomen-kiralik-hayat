# Fenomen: Kiralık Hayat (çalışma adı)

Sıfırdan fenomen ol: **çek → kurgula → yayınla**. İzlenmeler para ve takipçi getirir; ekipman, kurgucu ve menajerle büyü.
Lüksü **satın al ya da kirala** — kiralık eşya videoda aynı gösterişi yapar ama her gün kira öder, Güven'i düşürür ve **İfşa** riski taşır.
Hedef: kiralık hayattan gerçek eşyalara ve yatırımlara geçmek.

**Oyna:** https://thejackaltr.github.io/fenomen-kiralik-hayat/ (yüklenebilir PWA, çevrimdışı çalışır)

## v1 kapsamı
- Karakter yaratma (erkek/kadın, ten, saç, kanal adı) ve kariyer yolu: **Vlog** ve **Oyun yayını** oynanabilir; Eğitim ve Lüks yaşam "yakında".
- Kurgu mini oyunu (oynatıcı yeşil anlardan geçerken KES) → kalite izlenmeyi çarpar. Kurgucu kurguyu sabit kaliteyle yapar, menajer otomatik video yükler (boşta ilerleme).
- Lüks eşyalar (saat ×2, koleksiyonluk ayakkabı, tablo, araba ×2, yat, villa): satın al / kirala / iade et / kiradan kurtul. Kira her oyun günü (`CFG.daySec`) ödenir, ödenemezse eşya geri alınır.
- Güven ve İfşa: kiralık eşya gösteren her video Güven'i düşürür; İfşa ihtimali `base + slope·(100−Güven)/100`. 5 İfşa kartı, "Özür videosu çek" / "Görmezden gel" seçimleri.
- Paper-doll giyim: 2 gövde + 14 giyilebilir (gri tonlamalı, çalışma anında renklendirilir), sabit katman sırası `body, bottom, top, shoes, accessory, glasses`, hepsi aynı tuval ve pivot.
- Yatırımlar (pasif gelir; videoda göstermek ekstra izlenme), FanKutusu (müstehcen olmayan parodi abonelik sayfası).
- Çevrimdışı kazanç + "Tekrar hoş geldin" penceresi (8 saat sınırı), video kapağı tarzında paylaşım kartı (1080×1920, UTM'li bağlantı).
- İlk dakikalar için rehber ipuçları. Arka uç yok: **yalnızca yerel kayıt** (`localStorage`, ID bazlı).

## Geliştirme
```bash
npm ci
npm run dev        # geliştirme sunucusu
npm test           # birim testleri (node:test)
npm run build      # dist/ + sürümlü service worker
npm run preview    # http://localhost:4180
SHOTS=1 npm run smoke                                   # başsız duman testi (390×844 + 1280×800)
BASE=https://thejackaltr.github.io/fenomen-kiralik-hayat/ npm run smoke
npm run balance    # ilk 40 dakikanın denge simülasyonu
npm run art        # görselleri koddan yeniden üret (CHROME=/yol/chrome)
```

## Yapı
- `src/logic/config.js` — **tüm sayılar ve kataloglar** (CFG). `game.js` saf oyun mantığı, `save.js` ID bazlı kayıt + doğrulama, `edit.js` kurgu kuralları.
- `src/logic/i18n.js`, `format.js` — yerelleştirme ve Intl biçimlendirme. `src/locales/tr.json` — **tüm metinler** (kaynak + yedek dil).
- `src/render/` — Canvas 2D: görsel yükleme ve renklendirme, paper-doll, video sahnesi/küçük resim.
- `src/ui/` — DOM arayüzü, paylaşım kartı. `src/controller.js` — döngü, otomatik kayıt, çevrimdışı telafi.
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
Kod MIT (`LICENSE`), görseller CC0 (`CREDITS.md`).
