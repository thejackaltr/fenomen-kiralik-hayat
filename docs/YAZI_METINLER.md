# Fenomen: Kiralık Hayat — Yazı için metinler

Kaynak: `src/locales/tr.json` (bu dosya `node tools/yazi-doc.mjs` ile üretilir). Düzenleme doğrudan tr.json üzerinden yapılır.

## v2.2 — Hesap ve bulut kayıt (Yazı r2 TASLAK; aynen uygulandı)

Yazı r2 (2026-09-29) metinleri anahtar adlarıyla aynen alındı. Açık yer tutucular olduğu gibi duruyor: account.privacy.details #4 [TEKNİK KAYIT SAKLAMA SÜRESİ — avukat belirleyecek], #5 [YURT DIŞI AKTARIM DAYANAĞI — Aryen/avukat belirleyecek], email.from [GÖNDERİCİ]. Giriş açık (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY) bir derleme, account.privacy.details'te [yer tutucu] kaldıkça `npm run build` hata verir (ALLOW_EMPTY_LEGAL=1 yalnız geliştirme/test). email.* oyunda gösterilmez (sunucu e-posta şablonları, supabase/templates/). Kodda kullanılmayanlar: account.title (Ayarlar'da başlık account.menu), auth.code.wrongOnly ve auth.code.expired (sunucu yanlış ve süresi dolmuş kodu aynı yanıtla bildiriyor, ikisi için de wrongCode gösterilir). {email}, {s}, {t}, {f}, {v}, {n}, {k}, {c}, {d} kodla doldurulur; reset.backupNote {n} = 30 (config CLOUD.backupDays). settings.credits ("Oyun kaydın yalnızca bu cihazda tutulur") değiştirilmedi: karar bekliyor (r2 EKSİK 5).

- `account.privacy.title`: Hesap ve bulut kayıt hakkında
- `account.privacy.detailsLink`: Ayrıntılar
- `account.privacy.details`: Giriş yaparsan iki şey tutarız: e-posta adresin ve bulut kaydın. Bulut kaydınla birlikte son kaydetme zamanı ve cihaz türü (mobil ya da masaüstü) de tutulur. / E-posta adresini yalnızca sana giriş kodu göndermek için kullanırız. Reklam ya da tanıtım e-postası göndermeyiz. Bulut kaydını, oyuna başka bir cihazda aynı kayıttan devam edebilmen için tutarız. / Bunları, senin istediğin bulut kayıt hizmetini sunabilmek için işleriz (KVKK madde 5/2-c). E-posta adresini sen yazarsın. Giriş yaptığın sürece bulut kaydın oyundan otomatik gönderilir. / Bilgiler Fenomen'in kendi sunucusunda (fenomen-api.teserix.com) tutulur. Sunucu, bağlantı sırasında IP adresini teknik kayıtlarda görebilir. Bu teknik kayıtlar [TEKNİK KAYIT SAKLAMA SÜRESİ — avukat belirleyecek] sonra silinir. / Giriş kodu e-postalarını Resend adlı e-posta gönderim hizmeti gönderir. E-posta adresin bu hizmete yalnızca kodu gönderebilmek için iletilir. Gönderim Türkiye dışında, İrlanda'daki sunuculardan (AWS eu-west-1) yapılır. Yani e-posta adresin bu iş için yurt dışına aktarılır. Aktarımın dayanağı: [YURT DIŞI AKTARIM DAYANAĞI — Aryen/avukat belirleyecek] / Aşama sayacı ve ziyaret sayımı hesabına bağlanmaz. Giriş yapsan da bu sayımlara e-postan ya da hesap bilgin gitmez, ikisi de isimsiz kalır. / 24 ay boyunca giriş yapılmazsa hesabın ve bulut kaydın silinir; cihazındaki kayıt yerinde kalır. Varsa baştan başlamadan önce alınan yedek de bunlarla birlikte silinir. / “Kaydı sil ve baştan başla”yı seçersen buluttaki eski kaydın 30 gün yedek olarak saklanır, sonra silinir. / Hesabını istediğin zaman “Hesabımı sil” düğmesiyle silebilirsin. Hesabın, e-posta adresin ve bulut kaydın yedekleriyle birlikte silinir. Bu en geç 30 gün içinde tamamlanır. Bu cihazdaki kaydın silinmez. / Bu bilgilerin veri sorumlusu Teserix Bilişim ve Dijital Çözümler. KVKK'nın 11. maddesindeki haklarını kullanmak için info@teserix.com adresine yazabilirsin.
- `account.menu`: Bulut kayıt
- `account.title`: Bulut kayıt
- `account.guestNote`: Giriş yapmadan da oynayabilirsin. Kaydın bu cihazda tutulur.
- `account.signedIn`: {email} ile giriş yaptın.
- `account.signIn`: Giriş yap
- `account.signOut`: Çıkış yap
- `account.signedOut`: Çıkış yaptın. Kaydın bu cihazda duruyor.
- `account.delete.button`: Hesabımı sil
- `account.delete.title`: Hesabını silmek istiyor musun?
- `account.delete.body`: Hesabın, e-posta adresin ve buluttaki kaydın yedekleriyle birlikte silinir. Bu en geç 30 gün içinde tamamlanır. Bu cihazdaki kaydın kalır, oynamaya buradan devam edebilirsin. Silinen hesap geri gelmez.
- `account.delete.yes`: Evet, sil
- `account.delete.no`: Vazgeç
- `account.delete.deleting`: Siliniyor…
- `account.delete.done`: Hesabın silindi. Kaydın bu cihazda duruyor.
- `account.delete.failed`: Hesabın şu an silinemedi. Bağlantını kontrol edip tekrar dene.
- `auth.login.title`: Kaydını buluta al
- `auth.login.body`: İstersen e-postanla giriş yap. Böylece kaydın bulutta da durur ve başka bir cihazda kaldığın yerden devam edebilirsin.
- `auth.login.optional`: Giriş yapmak zorunda değilsin. Giriş yapmazsan oyunda hiçbir şey değişmez, kaydın bu cihazda tutulur.
- `auth.login.age`: 13 yaşından küçüksen bu adımı bir yetişkinle birlikte yap.
- `auth.login.emailLabel`: E-posta adresin
- `auth.login.emailPlaceholder`: ornek@eposta.com
- `auth.login.privacySummary`: E-postan yalnızca giriş kodu için. Aşama sayacı ve ziyaret sayımı hesaba bağlanmaz.
- `auth.login.send`: Kod gönder
- `auth.login.sending`: Gönderiliyor…
- `auth.login.later`: Şimdi değil
- `auth.login.badEmail`: Geçerli bir e-posta adresi yaz.
- `auth.login.sendFail`: Kod gönderilemedi. Adresi kontrol edip tekrar dene.
- `auth.login.rateLimit`: Çok fazla deneme oldu. Birkaç dakika sonra tekrar dene.
- `auth.login.quotaFull`: Şu an kod gönderemiyoruz. Girişsiz oynamaya devam et, kaydın bu cihazda tutulur. Girişi sonra tekrar dene.
- `auth.login.sendError`: Kod şu an gönderilemedi. Biraz sonra tekrar dene.
- `auth.code.title`: Kodu yaz
- `auth.code.sent`: Kodu şu adrese gönderdik: {email}
- `auth.code.spam`: Gelmediyse spam klasörüne de bak.
- `auth.code.label`: 6 haneli kod
- `auth.code.verify`: Giriş yap
- `auth.code.verifying`: Kontrol ediliyor…
- `auth.code.resend`: Kodu tekrar gönder
- `auth.code.resendIn`: Kodu tekrar gönder ({s} sn)
- `auth.code.resent`: Yeni kodu gönderdik.
- `auth.code.changeEmail`: Başka adres kullan
- `auth.code.badCode`: Kod 6 haneli olmalı, yalnızca rakam.
- `auth.code.wrongCode`: Kod hatalı ya da süresi dolmuş. Yeni kod iste.
- `auth.code.wrongOnly`: Kod hatalı. Tekrar bak ya da yeni kod iste.
- `auth.code.expired`: Kodun süresi doldu. Yeni kod iste.
- `auth.code.rateLimit`: Çok fazla deneme oldu. Birkaç dakika sonra tekrar dene.
- `auth.code.offline`: İnternet yok. Bağlanınca tekrar dene.
- `auth.code.unreachable`: Sunucuya şu an ulaşılamıyor. Biraz sonra tekrar dene.
- `auth.moveDomain.text`: Giriş ve bulut kayıt yeni adreste. Giriş yapmak için yeni adrese geç. Burada girişsiz oynamaya devam edebilirsin.
- `auth.moveDomain.saveHint`: Buradaki kaydın yeni adrese kendiliğinden geçmez. Taşımak için burada “Kaydı dışa aktar”ı, yeni adreste “Kaydı içe aktar”ı kullan.
- `auth.moveDomain.linkLabel`: Yeni adrese git
- `auth.moveDomain.url`: https://fenomen.teserix.com
- `sync.uploaded`: Giriş yaptın. Kaydın artık bulutta da duruyor.
- `sync.cloudLoaded`: Buluttaki kaydın yüklendi.
- `sync.saving`: Buluta kaydediliyor…
- `sync.saved`: Buluta kaydedildi · {t}
- `sync.offline`: İnternet yok, oyun bu cihazda kaydediliyor. Bağlanınca buluta da kaydedilir.
- `sync.unreachable`: Buluta şu an ulaşılamıyor, oyun bu cihazda kaydediliyor.
- `sync.conflict.title`: İki farklı kayıt var
- `sync.conflict.body`: Buluttaki kayıt bu cihazdakinden farklı. Hangisiyle devam edeceğini seç.
- `sync.conflict.bodyNewer`: Başka bir cihazda ya da sekmede oynadın. Hangi kayıtla devam edeceğini seç.
- `sync.conflict.optCloud`: Buluttaki kayıt
- `sync.conflict.optDevice`: Bu cihazdaki kayıt
- `sync.conflict.meta`: {f} takipçi · {v} ¤ · {n} Şöhret · {k} satış
- `sync.conflict.metaLast`: {c} · {d}
- `sync.conflict.deviceMobile`: Mobil
- `sync.conflict.deviceDesktop`: Masaüstü
- `sync.conflict.recommended`: Önerilen
- `sync.conflict.useCloud`: Buluttakini seç
- `sync.conflict.useDevice`: Bu cihazdakini seç
- `sync.conflict.keepTitle`: Diğer kaydı saklamak ister misin?
- `sync.conflict.keepBody`: Seçmediğin kayıt silinecek. İstersen önce kayıt kodunu kopyala. Bu kodla kaydı sonra Ayarlar'daki “Kaydı içe aktar” ile yükleyebilirsin.
- `sync.conflict.keepTitleReset`: Bu cihazdaki kaydı saklamak ister misin?
- `sync.conflict.keepBodyReset`: Kaydın başka bir cihazda sıfırlandı. Bu cihazdaki kayıt silinecek, içinde buluta gitmemiş ilerleme var. İstersen önce kayıt kodunu kopyala. Bu kodla kaydı sonra Ayarlar'daki “Kaydı içe aktar” ile yükleyebilirsin.
- `sync.conflict.keepCopy`: Kodu kopyala
- `sync.conflict.keepCopied`: Kod kopyalandı
- `sync.conflict.keepContinue`: Devam et
- `sync.conflict.dateUnknown`: bilinmiyor
- `reset.confirmSignedIn`: Emin misin? Tüm ilerleme bu cihazdan ve buluttan silinecek.
- `reset.backupNote`: Buluttaki eski kaydın {n} gün yedek olarak saklanır, sonra silinir.
- `reset.otherDevice`: Kaydın başka bir cihazda sıfırlandı. Güncel kayıt yüklendi.
- `reset.failed`: Kayıt şu an sıfırlanamadı. Bağlantını kontrol edip tekrar dene.
- `email.from`: [GÖNDERİCİ]
- `email.codeNew.subject`: Fenomen: Kiralık Hayat ilk giriş kodun
- `email.codeNew.body`: Merhaba,

Fenomen: Kiralık Hayat'a hoş geldin! İlk giriş kodun:

{kod}

Bu kodu oyundaki kod ekranına yaz. Kod 10 dakika içinde geçerli. Süresi dolarsa oyundan yeni kod isteyebilirsin.

Bu kodu sen istemediysen bu e-postayı yok sayabilirsin.

Bu e-posta yalnızca giriş kodun için gönderildi.

Fenomen: Kiralık Hayat
- `email.codeReturning.subject`: Fenomen: Kiralık Hayat giriş kodun
- `email.codeReturning.body`: Merhaba,

Fenomen: Kiralık Hayat giriş kodun:

{kod}

Bu kodu oyundaki kod ekranına yaz. Kod 10 dakika içinde geçerli. Süresi dolarsa oyundan yeni kod isteyebilirsin.

Bu kodu sen istemediysen bu e-postayı yok sayabilirsin.

Bu e-posta yalnızca giriş kodun için gönderildi.

Fenomen: Kiralık Hayat

## v2.1 — Sayaç, kayıt dosyası ve yeni adrese taşıma (Yazı'nın kesin metinleri uygulandı; GEÇİCİ olanlar işaretli)

Yazı'nın kesin metinleri uygulandı (move, import, saveFile, telemetry, settings.*). GEÇİCİ (Yazı'nın metnini bekliyor): backup.* (yedek yuvası doluyken yeni içe aktarmadan önce çıkan adım: backup.title/body/summary/download/discard/cancel/downloaded/cancelled/fileName). telemetry.details'in son maddesi (veri sorumlusu, alıcılar, haklar) Aryen onayıyla yazıldı; 5. madde (ziyaret sayımı, Umami) eklendi. 3. madde (konum: ziyaret sayımında ülke düzeyi) ve ziyaret kayıtlarının saklama süresi cümlesi eklendi. Ziyaret sayımı saklama süresi: ÇÖZÜLDÜ, Aryen onayladı, 13 ay (aşama sayacı 180 gün, değişmedi). Herhangi bir madde boşsa ekranda paragraf çıkmaz ve `npm run build` hata verir (geliştirme/test için ALLOW_EMPTY_LEGAL=1). telemetry.ok/off ("Tamam"/"Kapat") aynı görsel ağırlıkta gösterilir. "rıza" kelimesi geçmemeli (KVKK raporu §7(c)). {f}, {d}, {n}, {url} yer tutucuları kodla doldurulur.

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
- `import.optOld`: Eski adresteki kayıt
- `import.optNew`: Bu cihazdaki kayıt
- `import.conflictMeta`: {f} takipçi · Son oynama: {d}
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
- `telemetry.body`: Aşamaları, ziyaretleri ve bazı oyun olaylarını isimsiz sayıyoruz, Ayarlar'dan kapatabilirsin. Adın ve e-postan gönderilmez, IP adresin istatistik kayıtlarına yazılmaz.
- `telemetry.ok`: Tamam
- `telemetry.off`: Kapat
- `telemetry.detailsLink`: Ayrıntılar
- `telemetry.detailsTitle`: İsimsiz sayaç hakkında
- `telemetry.offToast`: Sayaç kapatıldı. Bizim sayaçlarımız artık hiçbir şey göndermeyecek.
- `telemetry.details`: Oyunu daha iyi yapmak için kaç oyuncunun hangi aşamaya geldiğini sayıyoruz (ör. ilk video, ilk kiralama, ilk personel). / Aşama sayacına gönderilen her bilgide yalnızca dört şey var: aşamanın adı, oyun sürümü, cihaz türü (mobil ya da masaüstü) ve yaklaşık oynama süresi aralığı (ör. 10-30 dakika). / Adın, e-postan, kanal adın, oyun kaydın ya da seni tanıtan başka bir bilgi toplanmaz. Ziyaret sayımında konum yalnızca ülke düzeyinde tutulur. Reklam ya da profil çıkarma yok. Site Cloudflare üzerinden sunulduğu için Cloudflare de sayfa açılışlarını kendi aracıyla ayrıca sayar. Cloudflare'in açıklamasına göre bu araç çerez kullanmaz ve ziyaretçileri tanımaya çalışmaz. Bu sayım, bu bildirimden ve Gizlilik ayarından bağımsız çalışır. / Her aşama bir cihazdan yalnızca bir kez sayılır. Bunu cihazın kendisi hatırlar, sunucuya kimlik gitmez. Oyunu açman ise en fazla yarım saatte bir sayılır. / Oyun sayfasına gelen ziyaretleri ve bazı oyun olaylarını da Teserix'in kendi analiz sunucusunda sayıyoruz. Sayılan olaylar şunlar: oyuna başlama, kanalı satma ya da sıfırlama ve paylaşım penceresini açma. Bizim gönderdiğimiz yalnızca olayın adı. Analiz aracı her kayda standart olarak şunları da ekler: sayfa adresi (? ve # işaretinden sonrası hariç), sayfa başlığı, geldiğin site, alan adı, ekran boyutu, tarayıcı dili, tarayıcın, işletim sistemin ve cihaz türün. Bunun için çerez kullanılmaz ve kimliğin saklanmaz. Sayaç kapatınca bu sayım da durur. / Sunucu, bağlantı sırasında IP adresini teknik kayıtlarda görebilir. IP adresi istatistik tablosuna yazılmaz. / Aşama sayacı kayıtları 180 gün sonra silinir. Ziyaret ve olay kayıtları da 13 ay sonra silinir. / İstediğin zaman Ayarlar'daki Gizlilik bölümünden kapatabilirsin. Kendi ziyaret sayımımız yalnızca bu bildirime “Tamam” dedikten sonra başlar. Kapattığın anda aşama sayacı da ziyaret sayımı da hiçbir şey göndermez. Cloudflare'in sayımı bunun dışındadır ve sayfa açıldığında çalışır. / Bu bilgilerin veri sorumlusu Teserix Bilişim ve Dijital Çözümler. Bilgiler Teserix'in kendi sunucusunda tutulur, bağlantı trafiğini Cloudflare taşır. KVKK'nın 11. maddesindeki haklarını kullanmak için info@teserix.com adresine yazabilirsin.
- `settings.saveTitle`: Kayıt
- `settings.privacy`: Gizlilik
- `settings.telemetry`: İsimsiz istatistik gönder
- `settings.telemetryHint`: Hangi aşamaya geldiğin, ziyaretler ve bazı oyun olayları isimsiz olarak sayılır. Adın ya da e-postan gönderilmez, IP adresin istatistik kayıtlarına yazılmaz. Cloudflare'in sayımı bu ayardan bağımsızdır.
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
