# Fenomen: Kiralık Hayat — Yazı için metinler

Kaynak: `src/locales/tr.json` (bu dosya `node tools/yazi-doc.mjs` ile üretilir). Düzenleme doğrudan tr.json üzerinden yapılır.

## v2.1 — Sayaç, kayıt dosyası ve yeni adrese taşıma (Yazı'nın kesin metinleri uygulandı; GEÇİCİ olanlar işaretli)

Yazı'nın kesin metinleri uygulandı (move, import, saveFile, telemetry, settings.*). GEÇİCİ (Yazı'nın metnini bekliyor): backup.* (yedek yuvası doluyken yeni içe aktarmadan önce çıkan adım: backup.title/body/summary/download/discard/cancel/downloaded/cancelled/fileName). telemetry.details'in son maddesi (veri sorumlusu, alıcılar, haklar) Aryen onayıyla yazıldı; 5. madde (ziyaret sayımı, Umami) eklendi. BEKLİYOR: 3. madde (konum) ve ziyaret verisinin saklama süresi. Herhangi bir madde boşsa ekranda paragraf çıkmaz ve `npm run build` hata verir (geliştirme/test için ALLOW_EMPTY_LEGAL=1). telemetry.ok/off ("Tamam"/"Kapat") aynı görsel ağırlıkta gösterilir. "rıza" kelimesi geçmemeli (KVKK raporu §7(c)). {f}, {d}, {n}, {url} yer tutucuları kodla doldurulur.

- `move.title`: Fenomen yeni adresine taşındı!
- `move.body`: Kaydını da yanında getiriyoruz. Birkaç saniye içinde yeni adrese geçeceksin.
- `move.go`: Şimdi geç
- `move.homeIcon`: Oyunu ana ekrana eklediysen eski simgeyi sil ve yeni adresten tekrar ekle.
- `move.download`: Kaydı indir
- `move.tooBig`: Kaydın otomatik taşınamayacak kadar büyük. Önce “Kaydı indir” ile dosyanı al. Sonra {url} adresinde Ayarlar'ı aç ve “Kaydı içe aktar”ı seç.
- `move.bandBody`: Kaydını tek dokunuşla yeni adrese taşıyabilirsin. Bu adreste {n} gün daha oynayabilirsin, sonra oyun yalnızca yeni adreste açılacak.
- `move.later`: Daha sonra
- `import.done`: Kaydın taşındı. Kaldığın yerden devam et!
- `import.conflictTitle`: İki kayıt bulundu
- `import.conflictBody`: Bu cihazda da bir kayıt var. Hangisiyle devam edeceğini seç. Seçmediğin kayıt silinmez, bir süre bu cihazda yedek olarak kalır.
- `import.optOld`: Eski adresteki kayıt · {f} takipçi · Son oynama: {d}
- `import.optNew`: Bu cihazdaki kayıt · {f} takipçi · Son oynama: {d}
- `import.fail`: Kayıt otomatik taşınamadı. Eski adresteki “Kaydı indir” düğmesiyle kaydını al, burada Ayarlar'dan içe aktar.
- `import.dateUnknown`: bilinmiyor
- `saveFile.export`: Kaydı dışa aktar
- `saveFile.exported`: Kayıt dosyası indirildi. Güvenli bir yerde sakla.
- `saveFile.import`: Kaydı içe aktar
- `saveFile.importAsk`: Bu dosyadaki kayıt şimdiki ilerlemenin yerine geçecek. Devam edilsin mi?
- `saveFile.importYes`: Evet, yükle
- `saveFile.importBad`: Bu dosya bir Fenomen kaydı değil ya da bozulmuş.
- `saveFile.fileName`: fenomen-kayit-{d}.json
- `saveFile.codeLabel`: Dosyaya ulaşamazsan bu kayıt kodunu kopyalayıp bir yere not et. Kaydını bu kodla da geri yükleyebilirsin.
- `saveFile.copyCode`: Kodu kopyala
- `saveFile.codeCopied`: Kod kopyalandı
- `saveFile.pickFile`: Kayıt dosyasını seç
- `saveFile.pasteLabel`: Dosyan yoksa kayıt kodunu buraya yapıştır:
- `saveFile.codePlaceholder`: Kayıt kodunu yapıştır
- `saveFile.useCode`: Kodla yükle
- `saveFile.sumCurrent`: Şimdiki kayıt · {f} takipçi · Son oynama: {d}
- `saveFile.sumFile`: Yüklenecek kayıt · {f} takipçi · Son oynama: {d}
- `saveFile.backupNote`: Şimdiki kayıt silinmez, bu cihazda yedek olarak saklanır.
- `telemetry.title`: İsimsiz sayaç
- `telemetry.body`: Oyunu geliştirmek için oyuncuların hangi aşamalara geldiğini isimsiz olarak sayıyoruz. Seni tanıtan hiçbir bilgi gönderilmez. İstemezsen kapatabilirsin.
- `telemetry.ok`: Tamam
- `telemetry.off`: Kapat
- `telemetry.detailsLink`: Ayrıntılar
- `telemetry.detailsTitle`: İsimsiz sayaç hakkında
- `telemetry.offToast`: Sayaç kapatıldı. Hiçbir şey gönderilmeyecek.
- `telemetry.details`: Oyunu daha iyi yapmak için kaç oyuncunun hangi aşamaya geldiğini sayıyoruz (ör. ilk video, ilk kiralama, ilk personel). / Aşama sayacına gönderilen her bilgide yalnızca dört şey var: aşamanın adı, oyun sürümü, cihaz türü (mobil ya da masaüstü) ve yaklaşık oynama süresi aralığı (ör. 10-30 dakika). / Adın, e-postan, kanal adın, oyun kaydın, konumun ya da seni tanıtan başka bir bilgi toplanmaz. Reklam, profil çıkarma ya da başka şirketlerin analiz araçları yok. / Her aşama bir cihazdan yalnızca bir kez sayılır. Bunu cihazın kendisi hatırlar, sunucuya kimlik gitmez. Oyunu açman ise en fazla yarım saatte bir sayılır. / Oyun sayfasına gelen ziyaretleri de Teserix'in kendi analiz sunucusunda sayıyoruz. Bunun için çerez kullanılmaz ve kimliğin saklanmaz. Sayacı kapatınca bu sayım da durur. / Sunucu, bağlantı sırasında IP adresini teknik kayıtlarda görebilir. IP adresi istatistik tablosuna yazılmaz. / Aşama sayacı kayıtları 180 gün sonra silinir. / İstediğin zaman Ayarlar'daki Gizlilik bölümünden kapatabilirsin. Kapattığın anda hiçbir şey gönderilmez. / Bu bilgilerin veri sorumlusu Teserix Bilişim ve Dijital Çözümler. Bilgiler Teserix'in kendi sunucusunda tutulur, bağlantı trafiğini Cloudflare taşır. KVKK'nın 11. maddesindeki haklarını kullanmak için info@teserix.com adresine yazabilirsin.
- `settings.saveTitle`: Kayıt
- `settings.privacy`: Gizlilik
- `settings.telemetry`: İsimsiz istatistik gönder
- `settings.telemetryHint`: Yalnızca oyunda hangi aşamaya geldiğin isimsiz olarak sayılır. Seni tanıtan hiçbir bilgi gönderilmez.
- `settings.credits`: Tüm görseller kodla üretildi. Oyun kaydın yalnızca bu cihazda tutulur.
- `backup.title`: Bu cihazda zaten bir yedek var
- `backup.body`: Yeni kayıt yüklenirse bu yedeğin yerine şimdiki kayıt geçecek. Yedeği kaybetmemek için önce dosya olarak indirebilirsin.
- `backup.summary`: Mevcut yedek · {f} takipçi · Son oynama: {d}
- `backup.download`: Mevcut yedeği indir
- `backup.discard`: Yedeği sil ve devam et
- `backup.cancel`: Vazgeç
- `backup.downloaded`: Yedek dosyası indirildi.
- `backup.cancelled`: İçe aktarma iptal edildi. Hiçbir şey değişmedi.
- `backup.fileName`: fenomen-yedek-{d}.json

## v2.0.2 — Yazı düzeltmeleri (uygulandı)

"ifşa" cümle içinde her yerde küçük harf; büyük harf yalnız "İFŞA!" başlığında (`ifsa.title`, ekranda toLocaleUpperCase ile). Cümle/etiket başındaki "İfşa" (ör. `ifsa.exposed` "İfşa oldu", `channel.ifsa` "İfşa", `shop.rentWearInfo` ikinci cümlesi) büyük harfle kalır. hud.trustHint ve shop.rentExplain bu kurala göre küçültüldü.

- `paths.luks.desc`: Sadece gösteriş. Kiralık eşyalar takipçiyi en çok burada artırır, ifşa riski de en yüksek burada.
- `shop.rentWearInfo`: Kiralık kıyafet de videoda aynı stili verir. İfşa olursan üstündeki etiket görünür.
- `hud.trustHint`: Güven düştükçe ifşa olma ihtimalin artar.
- `shop.rentExplain`: Kiralık eşya videoda aynı gösterişi ve takipçi artışını sağlar ama her gün kira öder, Güven'i düşürür ve ifşa riski taşır.
- `fame.treeHelp`: Buradan aldığın her şey hem şimdi hem de her yeni hesapta en baştan seninle olur. Harcamadığın her puan izlenmeye küçük bir bonus verir.
- `sell.newAccount`: Yeni hesabın açıldı. Bir kariyer yolu seç.
- `fame.locked`: Önce bir öncekini aç.
- `fame.nodes.f_camera`: 3. seviye kamera

## v2 — Yeni metinler (taslak; v2.0.2'de düzeltilenler yukarıda)

47 yeni anahtar + 1 değişen anahtar: `paths.luks.desc` (v1'de "Sadece gösteriş. Çok yakında." idi). Hepsi geçici (placeholder) Türkçe metin. {n}, {x}, {v}, {a}, {b} yer tutucuları kodla doldurulur, aynen kalmalı. Eşya adları (Şöhret ağacı düğümleri) items.names.* anahtarlarından gelir; yalnız eşya olmayan 4 düğümün adı fame.nodes.* altında. Kıyafetler için de tekrar kullanılan v1 anahtarları: shop.rent / shop.buyOut / shop.return / shop.rentInfo / tags.rented / ifsa.exposed / toast.rented / toast.bought / toast.returned; başarım penceresinin düğmesi welcome.ok ("Harika"). Ses düğmesi yalnız simge (🔊/🔇); sound.mute/unmute ekran okuyucu etiketi, sound.on/off kısa bildirim.

- `paths.luks.name`: Lüks yaşam
- `paths.luks.desc`: Sadece gösteriş. Kiralık eşyalar takipçiyi en çok burada artırır, ifşa riski de en yüksek burada.
- `video.titles.t_outfit`: Bugün 5 kıyafet değiştirdim (hiçbiri benim değil)
- `ifsa.cards.ifsa_tag.title`: Etiket ifşası
- `ifsa.cards.ifsa_tag.body`: Takipçiler videodaki kıyafetin üstünde unutulan kiralama etiketini fark etti.
- `shop.rentWearInfo`: Kiralık kıyafet de videoda aynı stili verir. İfşa olursan üstündeki etiket görünür.
- `sell.title`: Kanalı Sat
- `sell.desc`: Kanalını sat, sıfırdan yeni bir hesap aç ve kalıcı Şöhret kazan.
- `sell.progress`: Satış için en az {n} takipçiye ulaş.
- `sell.gain`: Kazanacağın Şöhret: {n}
- `sell.next`: Bir sonraki puan için: {n} takipçi
- `sell.button`: Kanalı sat
- `sell.confirmTitle`: Kanalı satıyor musun?
- `sell.confirm`: Para, takipçiler, eşyalar, ekip ve videolar sıfırlanır. Şöhret, Şöhret ağacı ve başarımlar kalır.
- `sell.yes`: Evet, sat
- `sell.no`: Vazgeç
- `sell.done`: Kanal satıldı! +{n} Şöhret. Yeni hesabın hazır.
- `sell.newAccount`: Yeni hesabın açıldı. Bir kariyer yolu seç.
- `sell.sales`: Satılan kanal
- `fame.title`: Şöhret
- `fame.points`: {n} Şöhret
- `fame.unspent`: Harcanabilir Şöhret
- `fame.earned`: Toplam kazanılan
- `fame.followBonus`: Takipçi kazanımı +{v}
- `fame.unspentBonus`: Harcanmamış puan bonusu: izlenme +{v}
- `fame.tree`: Şöhret ağacı
- `fame.treeHelp`: Buradan aldığın her şey hem şimdi hem de her yeni hesapta en baştan seninle olur. Harcamadığın her puan izlenmeye küçük bir bonus verir.
- `fame.branches.saat`: Saat ve moda
- `fame.branches.garaj`: Garaj
- `fame.branches.ev`: Ev ve stil
- `fame.branches.ekip`: Ekip
- `fame.buy`: {n} Şöhret
- `fame.owned`: Açık
- `fame.locked`: Önce bir öncekini aç.
- `fame.nodes.f_suit`: Takım elbise seti
- `fame.nodes.f_editor`: Tanıdık kurgucu
- `fame.nodes.f_camera`: 3. seviye kamera
- `fame.nodes.f_manager`: Tanıdık menajer
- `fame.bought`: Şöhret ağacı: {x} artık her hesapta seninle.
- `ach.title`: Başarımlar
- `ach.progress`: {a}/{b} gösteriş eşyası gerçekten senin
- `ach.rent_free.name`: Kiralıksız Hayat
- `ach.rent_free.desc`: Tüm gösteriş eşyalarına gerçekten sahip ol.
- `ach.rent_free.done`: Başarım: Kiralıksız Hayat! +{n} Şöhret
- `ach.earned`: Kazanıldı
- `sound.mute`: Sesi kapat
- `sound.unmute`: Sesi aç
- `sound.off`: Ses kapalı
- `sound.on`: Ses açık

## v1.0.1 — Yazı düzeltmeleri (uygulandı)

- `welcome.auto.one`: Menajerin {n} video yükledi.
- `welcome.auto.other`: Menajerin {n} video yükledi.
- `ifsa.cards.ifsa_plate.body`: Takipçiler videodaki arabanın plakasını bir kiralama sitesinde buldu.
- `toast.rented`: {x} kiralandı. Kirası her gün kasadan düşer.
- `meta.description`: Sıfırdan fenomen ol: video çek, kurgula, yayınla. Lüksü kirala ya da gerçekten satın al, yalnız ifşa olmamaya dikkat et!
- `staff.editor.desc`: Kurguyu senin yerine yapar, kalitesi hep aynıdır. Menajer tutmak için önce Kurgucu gerekir.
- `paths.vlog.desc`: Günlük hayatın ve rutinlerin. Takipçiler seni samimi bulur.

## Rehber (ilk dakikalar)

- `tut.shoot`: İlk videonu çek. Telefon kamerası da kameradır.
- `tut.title`: Bir başlık seç. Abartmak serbest.
- `tut.edit`: Yeşil anlarda KES'e dokun. İyi kurgu, çok izlenme.
- `tut.publish`: Yayınla ve izlenmeleri izle.
- `tut.equip`: Para geldi! Mağaza > Ekipman'dan bir kamera al.
- `tut.rent`: Lüks bir saat kirala. Kimse anlamaz… değil mi?
- `tut.show`: Kiraladığın saati bir videoda göster.
- `tut.done`: Artık bir fenomensin. Hedef: kiralık hayattan gerçek servete.
- `tut.skip`: Geç

## Onaylanan ek video başlıkları

- `video.titles.t_gameend`: Bu oyunu kimse bitiremedi (ben de)
- `video.titles.t_invest`: Paramı nereye yatırdım? (gerçekten)

## İfşa kartları ve seçimler

- `ifsa.title`: İFŞA!
- `ifsa.lost`: {v} takipçi kaybettin.
- `ifsa.question`: Ne yapacaksın?
- `ifsa.apology`: Özür videosu çek
- `ifsa.apologyHint`: Biraz daha takipçi gider, Güven toparlanır.
- `ifsa.ignore`: Görmezden gel
- `ifsa.ignoreHint`: Kısa süre takipçi gelir, Güven sert düşer.
- `ifsa.afterApology`: Özür videon sıradaki video olacak.
- `ifsa.afterIgnore`: Gündem seni konuşuyor… şimdilik.
- `ifsa.exposed`: İfşa oldu
- `ifsa.cards.ifsa_plate.title`: Plaka ifşası
- `ifsa.cards.ifsa_plate.body`: Takipçiler videodaki arabanın plakasını bir kiralama sitesinde buldu.
- `ifsa.cards.ifsa_sign.title`: Tabela ifşası
- `ifsa.cards.ifsa_sign.body`: Villa turunun arka planında 'Günlük kiralık' tabelası göründü.
- `ifsa.cards.ifsa_comment.title`: Yorum ifşası
- `ifsa.cards.ifsa_comment.body`: Kiralama şirketi videonun altına yazdı: 'Aracı yarın saat 10'da teslim edin lütfen.'
- `ifsa.cards.ifsa_watch.title`: Saat ifşası
- `ifsa.cards.ifsa_watch.body`: Aynı {item} dün başka bir fenomenin videosunda görüldü.
- `ifsa.cards.ifsa_live.title`: Canlı yayın ifşası
- `ifsa.cards.ifsa_live.body`: Canlı yayında ekrana bildirim düştü: 'Kira ödemeniz yarın.'
- `ifsa.cards.ifsa_tag.title`: Etiket ifşası
- `ifsa.cards.ifsa_tag.body`: Takipçiler videodaki kıyafetin üstünde unutulan kiralama etiketini fark etti.

## Oyun adı / slogan

- `app.name`: Fenomen: Kiralık Hayat
- `app.tagline`: Gösteriş kiralık, takipçi gerçek.
- `meta.title`: Fenomen: Kiralık Hayat
- `meta.shortName`: Fenomen
- `meta.description`: Sıfırdan fenomen ol: video çek, kurgula, yayınla. Lüksü kirala ya da gerçekten satın al, yalnız ifşa olmamaya dikkat et!
- `meta.loading`: Yükleniyor…
- `meta.noscript`: Bu oyun için JavaScript gerekli.
- `meta.manifestName`: Fenomen: Kiralık Hayat

## Lüks eşyalar

- `items.names.watch_01`: Altın kol saati
- `items.names.sneaker_rare_01`: Koleksiyonluk spor ayakkabı
- `items.names.painting_01`: Modern sanat tablosu
- `items.names.car_01`: Kırmızı spor coupe
- `items.names.watch_02`: Pırlantalı saat
- `items.names.car_02`: Siyah arazi aracı
- `items.names.boat_01`: Beyaz yat
- `items.names.villa_01`: Havuzlu villa
- `items.desc.watch_01`: Saati sormazlar, saati görürler.
- `items.desc.sneaker_rare_01`: Giymek için değil, göstermek için.
- `items.desc.painting_01`: Ne anlattığını kimse bilmiyor. Tam da bu yüzden pahalı.
- `items.desc.car_01`: Alçak, hızlı, park yeri bulması imkânsız.
- `items.desc.watch_02`: Bileğin ışıl ışıl, hesabın… o kısmı sonra.
- `items.desc.car_02`: Şehirde de dağdaymış gibi.
- `items.desc.boat_01`: Denize sıfır içerik.
- `items.desc.villa_01`: Arka plan olarak mükemmel.

## Kıyafetler

- `wear.slots.top`: Üst
- `wear.slots.bottom`: Alt
- `wear.slots.shoes`: Ayakkabı
- `wear.slots.accessory`: Aksesuar
- `wear.slots.glasses`: Gözlük
- `wear.top_tshirt_01`: Basic tişört
- `wear.top_hoodie_01`: Kapüşonlu sweatshirt
- `wear.top_suit_01`: Karizmatik koyu takım ceketi
- `wear.bottom_jeans_01`: Kot pantolon
- `wear.bottom_shorts_01`: Şort
- `wear.bottom_skirt_01`: Pileli etek
- `wear.bottom_suit_01`: Takım pantolonu
- `wear.shoes_sneakers_01`: Spor ayakkabı
- `wear.shoes_boots_01`: Bot
- `wear.shoes_loafers_01`: Parlak klasik ayakkabı
- `wear.acc_cap_01`: Şapka
- `wear.acc_chain_01`: Kalın zincir kolye
- `wear.glasses_round_01`: Yuvarlak gözlük
- `wear.glasses_sun_01`: Gösterişli güneş gözlüğü
- `wear.none`: Yok
- `wear.remove`: Çıkar
- `wear.color`: Renk

## Ekipman / ekip / yatırım

- `equip.camera.name`: Kamera
- `equip.camera.desc`: Daha net görüntü, daha çok izlenme.
- `equip.mic.name`: Mikrofon
- `equip.mic.desc`: Sesin kısık olunca kimse izlemiyor.
- `equip.light.name`: Işık
- `equip.light.desc`: Halka ışık: fenomenin en iyi arkadaşı.
- `equip.pc.name`: Bilgisayar
- `equip.pc.desc`: Oyun yayınında hayati. Işıkları da var.
- `staff.editor.name`: Kurgucu
- `staff.editor.desc`: Kurguyu senin yerine yapar, kalitesi hep aynıdır. Menajer tutmak için önce Kurgucu gerekir.
- `staff.manager.name`: Menajer
- `staff.manager.desc`: Sen yokken bile video yükler. Kiralık eşyaları asla göstermez.
- `staff.quality`: Kalite ×{q}
- `staff.interval`: Her {t} bir video
- `invest.inv_fund.name`: Endeks fonu
- `invest.inv_fund.desc`: Sıkıcı ama istikrarlı.
- `invest.inv_land.name`: Arsa
- `invest.inv_land.desc`: Üstünde tabela bile yok. Henüz.
- `invest.inv_cafe.name`: Kafe ortaklığı
- `invest.inv_cafe.desc`: Kahve pahalı, ortaklık daha pahalı.

## FanKutusu (parodi, müstehcen değil)

- `fanbox.name`: FanKutusu
- `fanbox.desc`: Hayranlarına özel abonelik sayfası. Özel içerik: kedinin uyku videoları ve kahvaltı tabakları.
- `fanbox.locked`: {n} takipçide açılır.
- `fanbox.unlock`: Sayfa aç
- `fanbox.active`: Aktif
- `fanbox.income`: Abonelik: {v}

## Kariyer yolları

- `paths.vlog.name`: Vlog
- `paths.vlog.desc`: Günlük hayatın ve rutinlerin. Takipçiler seni samimi bulur.
- `paths.oyun.name`: Oyun yayını
- `paths.oyun.desc`: Uzun yayınlar, yeni bilgisayar kurulumları. Ekipman ve bilgisayar daha çok işe yarar.
- `paths.egitim.name`: Eğitim
- `paths.egitim.desc`: Bir şeyler öğret, takipçiler not alsın.
- `paths.luks.name`: Lüks yaşam
- `paths.luks.desc`: Sadece gösteriş. Kiralık eşyalar takipçiyi en çok burada artırır, ifşa riski de en yüksek burada.

## Mağaza / uyarılar / bildirimler

- `shop.title`: Mağaza
- `shop.tabs.luxury`: Lüks
- `shop.tabs.wear`: Giyim
- `shop.tabs.equip`: Ekipman
- `shop.tabs.team`: Ekip
- `shop.tabs.invest`: Yatırım
- `shop.buy`: Satın al
- `shop.rent`: Kirala
- `shop.rentInfo`: Kira: {v}
- `shop.owned`: Senin
- `shop.rented`: Kiralık
- `shop.return`: İade et
- `shop.buyOut`: Satın al, kiradan kurtul
- `shop.flex`: Gösteriş +{v}
- `shop.noMoney`: Yeterli paran yok.
- `shop.level`: Seviye {n}
- `shop.max`: Tam seviye
- `shop.upgrade`: Yükselt
- `shop.hire`: İşe al
- `shop.requires`: Önce {x} gerekli
- `shop.yield`: Getiri: {v}
- `shop.count`: Sahip olunan: {n}
- `shop.style`: Stil +{v}
- `shop.wear`: Giy
- `shop.wearing`: Üstünde
- `shop.rentExplain`: Kiralık eşya videoda aynı gösterişi ve takipçi artışını sağlar ama her gün kira öder, Güven'i düşürür ve ifşa riski taşır.
- `shop.investExplain`: Yatırımlar pasif gelir getirir. Videoda 'Yatırımlarım'ı gösterirsen ekstra izlenme alırsın.
- `shop.rentWearInfo`: Kiralık kıyafet de videoda aynı stili verir. İfşa olursan üstündeki etiket görünür.
- `shoot.rentedWarn`: Kiralık eşya gösteriyorsun. Güven biraz düşer.
- `studio.fatigue`: Seyirci biraz yoruldu, videolar daha az izleniyor. Biraz ara ver ya da menajer tut.
- `toast.bought`: {x} artık senin!
- `toast.rented`: {x} kiralandı. Kirası her gün kasadan düşer.
- `toast.returned`: {x} iade edildi.
- `toast.repossessed`: Kira ödenemedi! {x} geri alındı. Güven düştü.
- `toast.noMoney`: Yeterli paran yok.
- `toast.saved`: Kaydedildi
- `toast.invested`: Yatırım yapıldı: {x}
- `toast.published`: Yayınlandı: {v} izlenme bekleniyor
- `toast.autoPublished`: Menajer yeni bir video yükledi.

## Tekrar hoş geldin

- `welcome.title`: Tekrar hoş geldin!
- `welcome.away`: {t} boyunca yoktun.
- `welcome.views`: Videoların {v} izlenme aldı.
- `welcome.auto.one`: Menajerin {n} video yükledi.
- `welcome.auto.other`: Menajerin {n} video yükledi.
- `welcome.money`: Net kazanç: {v}
- `welcome.followers`: Yeni takipçi: {v}
- `welcome.rent`: Ödenen kira: {v}
- `welcome.repossessed`: Kira ödenemedi, geri alındı: {x}
- `welcome.ok`: Harika

## Paylaşım kartı

- `share.title`: Video kapağı
- `share.caption`: {f} takipçi · {v} izlenme
- `share.cta`: Sen de fenomen ol
- `share.text`: Kanalım {f} takipçiye ulaştı! Fenomen: Kiralık Hayat'ta sen de dene:
- `share.native`: Paylaş
- `share.download`: Resmi indir
- `share.copy`: Bağlantıyı kopyala
- `share.copied`: Bağlantı kopyalandı
- `share.downloaded`: Resim indirildi
- `share.fail`: Paylaşılamadı
- `share.close`: Kapat

## Kurgu mini oyunu

- `edit.title`: Kurgu
- `edit.help`: Oynatıcı yeşil anlardan geçerken KES'e dokun.
- `edit.cut`: KES!
- `edit.perfect`: Kusursuz kesim!
- `edit.hit`: Güzel kesim!
- `edit.miss`: Sıkıcı kısım kaldı…
- `edit.editor`: Kurgucuya ver
- `edit.done`: Kurgu bitti
- `edit.quality`: Kurgu kalitesi: ×{q}
