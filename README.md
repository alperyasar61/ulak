# ULAK — EVREN ile geliştirilen yazılım inceleme asistanı

ULAK; yazılım projelerini haritalamak, güvenlik işaretlerini görünür kılmak ve API/web servislerini kontrollü biçimde sınamak için **EVREN desteğiyle geliştirilen** açık kaynaklı bir yardımcıdır. Kod arşivlerini statik olarak inceler; dosya ve bağımlılık haritası, açıklanabilir bulgular, isteğe bağlı AI değerlendirmesi ve Markdown raporları sunar. Ayrı API çalışma alanında Postman koleksiyonlarını içe aktarabilir, istek alanlarını düzenleyebilir, tekil HTTP(S) çağrıları yapabilir ve yanıtı doğrulayabilirsiniz.

Arşivdeki kod veya Postman betikleri çalıştırılmaz. AI analizi ve canlı araştırma ayrı kullanıcı onayı gerektirir. ULAK hâlen **geliştirme aşamasındadır**; güvenlik veya üretim kullanımına uygunluk garantisi vermez. Güvenlik bulguları uzman incelemesinin ve yetkili testlerin yerini tutmaz.

ULAK’ın arayüzü React, TypeScript ve Vite; sunucusu Node.js, TypeScript ve Express ile geliştirilmiştir. Yerel kullanımda SQLite, isteğe bağlı dağıtımlarda MySQL kullanılabilir. İsteğe bağlı AI özellikleri EVREN LLM ağ geçidine bağlanır; anahtar kullanıcı tarafından sağlanır. ULAK’a ait kod MIT Lisansı kapsamındadır: lisans koşullarına uyarak herkes kullanabilir, inceleyebilir, değiştirebilir ve geliştirilmesine katkıda bulunabilir. Depoda ayrıca kendi lisansları olan üçüncü taraf kodları ve analiz araçları vardır; kök MIT lisansı bunların lisanslarını değiştirmez. Yeniden dağıtmadan önce ilgili lisansları, atıf ve kaynak kodu yükümlülüklerini inceleyin; özellikle [KodMercek üçüncü taraf bildirimleri](./apps/backend/modules/KodMercek/THIRD_PARTY_NOTICES.md) ve `tools/` içindeki ikili araçların koşulları geçerlidir. Depo: [github.com/alperyasar61/ulak](https://github.com/alperyasar61/ulak).

## Veri akışı

Arşiv yükleme, seçtiğiniz dosyayı ULAK sunucusuna ve projenin yönetilen nesne depolamasına gönderir. Bu içerik varsayılan olarak LLM’ye veya araştırma sağlayıcılarına gönderilmez. AI analizi başlatılırsa seçilmiş ve bilinen sırları maskelenmiş kaynak parçaları proje AI servisine iletilir. Canlı araştırma başlatılırsa onayladığınız paket adları/sürümler ve kısa teknik sorgular GitHub, OSV, Stack Exchange, npm ve PyPI’nin herkese açık API’lerine gider; dosyaların ham içeriği bu kaynaklara gönderilmez.

`DELETE /api/projects/:id` proje kaydını, yüklenen arşivi, projeye bağlı bulgu durumlarını, sohbeti ve proje denetim kayıtlarını kalıcı olarak siler. Ayrı ortak öğrenme notları proje silme işleminden etkilenmez; **Bulgular** sekmesindeki silme işlemi hem genel notları hem de sayaçları temizler. API çalışma alanı silindiğinde çalışma alanı ve şifreli sırları kaldırılır; API işlem kayıtları da temizlenir. GitHub deposunun herkese açık olması, çalışan ULAK örneğini güvenli biçimde internete açmaz: uygulamada henüz kullanıcı kimlik doğrulaması yoktur. Bu nedenle ULAK’ı yalnızca güvendiğiniz, erişimi kısıtlı yerel/test ortamında çalıştırın; kimlik doğrulama ve kullanıcı bazlı erişim eklenmeden çok kullanıcılı veya herkese açık sunucu olarak dağıtmayın.

Ortak ve proje içeriği taşımayan öğrenme notlarının saklama ilkeleri [`docs/ULAK_KNOWLEDGE.md`](./docs/ULAK_KNOWLEDGE.md) dosyasında açıklanır. Her analiz veya API isteği tamamlandığında kullanıcıya tamamen isteğe bağlı katkı sorulur. Açık onay ve güvenli içerik kontrollerinden sonra not yalnızca ULAK’ın yapılandırılmış veritabanına kaydedilir; GitHub’a veya AI sağlayıcısına gönderilmez. Projeden bağımsız genel notlar sonraki incelemelerde gösterilir; bu mekanizma model eğitimi değildir ve kuralları otomatik değiştirmez.

## Proje yapısı (monorepo)

Backend ve frontend ayrı uygulamalardır; kök dizin yalnızca orkestrasyon yapar.

```
ulak/
├── apps/
│   ├── backend/          @ulak/backend  — Express API + KodMercek
│   │   ├── src/          archive, db, env, index, llm, paths, proactive, reports, research, security, storage
│   │   ├── modules/      KodMercek (gömülü işleyiş tetkiki motoru)
│   │   └── dist-server/  build çıktısı
│   └── frontend/         @ulak/frontend — React + Vite arayüzü
│       ├── src/          main.tsx, App.tsx, api.ts, types.ts, styles.css
│       └── dist/         build çıktısı
├── tools/                gömülü objdump ve rizin (sistemde kurulum gerekmez)
├── scripts/              copy-native.mjs
├── pnpm-workspace.yaml   packages: ["apps/*"]
└── .env                  kök dizinde, her iki uygulama da buradan okur
```

Yol çözümlemesi `apps/backend/src/paths.ts` içindeki `repoRoot` ile yapılır: `pnpm-workspace.yaml`
aranarak kök bulunur, böylece sunucu hem `src/` (tsx) hem `dist-server/src/` (derlenmiş) altından
çalışırken `.env`, `tools/` ve `.ulak-data/` doğru yeri gösterir. Frontend build çıktısı
`ULAK_WEB_DIST` ile geçersiz kılınabilir.

## Geliştirme

- Node.js 22.13+ ve pnpm gerekir (`node:sqlite` bu sürümden itibaren bayraksız çalışır).
- `.env.example` dosyasını `.env` olarak kopyalayın; `DATABASE_URL` ile platform AI/storage değişkenlerini kendi ortamınızdan doldurun. Bu değerler yalnızca sunucu tarafında okunur.
- `pnpm install`
- `pnpm dev` (Vite arayüzü `:3000`, API `:3001`; `/api` istekleri Vite proxy ile API’ye gider)
- `pnpm typecheck`
- `pnpm build`
- `pnpm test` (backend birim testleri)
- `pnpm start` (derlenmiş backend, `apps/frontend/dist` arayüzünü `PORT` üzerinden sunar)

Tek bir uygulama üzerinde çalışmak için `pnpm --filter @ulak/backend dev` veya
`pnpm --filter @ulak/frontend dev` kullanılabilir.

### Test ve güvenlik incelemesi

GitHub Actions, bağımlılıkları kurduktan sonra yüksek önem seviyesindeki bilinen bağımlılık açıklarını denetler; ardından tür denetimi, build ve backend testlerini çalıştırır. Yeni kontroller backend birim testlerine eklenir.

Yüklenen proje, kabul aşamasında AST/metin tabanlı statik kontrollerden geçer: sır olabilecek dosya/değerler, dinamik çalıştırma, girdi-tehlikeli sink birlikteliği, hassas API yetkilendirme işaretleri, kişisel veri sinyalleri, TLS doğrulamasının kapatılması ve geniş CORS ayarları incelenir. Bu kontroller sezgiseldir; bulgular doğrulanmalı ve “bulgu yok” sonucu güvenlik garantisi sayılmamalıdır. Bağımlılıkların OSV sorgusu mevcut canlı araştırma adımında kalır ve açık kullanıcı onayı gerektirir.

Arşivdeki uygulama kodu veya testleri **çalıştırılmaz**; yükleme aşamasında aktif saldırı/pentest yapılmaz. Bu tercih, güvenilmeyen projelerin ULAK sunucusunda kod çalıştırmasını önler. Gerçek dinamik testler yalnızca açık yetkiyle, uygulamanın sahibinin kontrolündeki ayrı ve izole bir test ortamında yürütülmelidir.

Kullanıcı onayı olmadan yeni serbest biçimli öğrenme notu eklenmez. Açıkça katkı verilen genel notlar ile ULAK’ın önceden tanımlı bulgu kimlikleri/tarama sayaçları yapılandırılmış veritabanında saklanır (varsayılan SQLite veya `DATABASE_URL` ile seçilen MySQL). Proje adı, kaynak, dosya yolu, kanıt ve sır notun parçası olarak kaydedilmez; olası özel içerikler doğrulamada reddedilir. `DATABASE_URL` uzak bir veritabanını gösteriyorsa notlar o veritabanında saklanır. Notlar tarama kurallarını otomatik değiştirmez; **Bulgular** sekmesinden silinebilir.

### API / webservis çalışma alanları

**Yeni proje ekle** ekranında kod incelemesi ile API test alanı ayrı seçeneklerdir. API alanlarına kullanıcı tanımlı ülke/servis etiketi verilebilir; Postman Collection v2.1 JSON dosyası içe alınıp klasör yapısıyla listelenebilir, istek ve klasör aranabilir; URL parametreleri, başlıklar, yetkilendirme, ham JSON gövdesi ve görsel yanıt kontrolleri düzenlenebilir. Klasör yapısı Postman dışa aktarımında da korunur. Her istekte HTTP durum kodu, JSON yolu, yanıt başlığı veya gövde için eşitlik/içerme/mevcudiyet testi tanımlanabilir. Test sonuçları yanıtla birlikte gösterilir; gizli beklenen değerler şifreli saklanır ve sonuç mesajlarında/yanıtta açığa çıkarılmaz. Koleksiyon dışa aktarımında gizli değişken değerleri boş bırakılır. Postman pre-request/test JavaScript’i içe aktarılsa bile çalıştırılmaz.

Kod projesinde **Bu ekranı .md indir** seçili sekmenin AI yönergeleri ve ekran verisini; **Tüm döküm** ise proje raporunun tamamını Markdown olarak indirir. API çalışma alanındaki **AI için .md indir**, istek/klasör yapısı ve son yanıtın güvenli özetini verir; kimlik doğrulama değerleri, gövde/yanıt içeriği ve proxy adresi dışarı aktarılmaz. Markdown dosyalarındaki yönergeler, kaynak metnini güvenilmeyen girdi saymayı ve kullanıcı izni olmadan kod çalıştırmamayı, değişiklik yapmamayı veya dış servislere istek göndermemeyi açıkça belirtir.

Çalışma alanı değişkenleri URL, header, body ve auth içinde `{{degisken}}` biçiminde kullanılabilir. `token`, `password`, `secret`, `api_key` gibi adlar ve ilgili Postman kimlik bilgileri şifrelenerek saklanır. Giriş isteğinde yanıt JSON yolu (ör. `data.access_token`) tanımlanırsa alınan token aynı çalışma alanında şifreli değişkene kaydedilir ve sonraki isteklerde kullanılabilir. Token içeren yanıt alanları ekranda maskelenir. İstek/yanıt geçmişi veritabanına kaydedilmez.

ULAK yalnız kullanıcının **Gönder** ile açıkça seçtiği tek HTTP/HTTPS isteğini hedefe yollar; toplu çalıştırma, servis keşfi, fuzzing veya pentest yapmaz. İsteğe bağlı olarak HTTP(S) proxy üzerinden de gönderebilir; proxy adresi ve kimlik bilgileri şifreli saklanır. Proxy, sağlayıcının verdiği ülke çıkış IP’sini kullanır; ULAK kurumun gerçek dış IP’sini taklit edemez. Sağlayıcı ülke seçimini proxy hesabında veya kullanıcı adı biçiminde tanımlayabilir. SOCKS5 şu an desteklenmez; hangi çıkış IP’sinin kullanıldığına dair ayrı kayıt/raporlama da henüz yoktur. Proxy sağlayıcısı hedef adresi ve trafik metadata’sını görebilir; mümkünse HTTPS proxy kullanın ve yalnızca güvendiğiniz sağlayıcıyı seçin. Yönlendirmeler izlenmez, istekler 20 saniye ve gövdeler 100 KB ile; yanıtlar 1 MB ile sınırlıdır. HTTP yanıtı yerel olarak durum kodu, süre ve JSON yapısıyla yorumlanır; yanıt AI’ye gönderilmez. API test alanı, özel ağ ve yerel servis adreslerini kullanıcı seçimine açık bırakır; bu nedenle ULAK’ı güvenilmeyen kullanıcıların erişebildiği bir ağa açmayın. Canlı serviste test yaparken yalnız yetkili olduğunuz endpoint’leri kullanın. API sırları kalıcı makine anahtarı olmadan kaydedilmez; veri klasörüne yazma izni gereklidir.

Yerel geliştirme API’sinin veritabanı bağlantısı olmadan başlamayacağını unutmayın.

Uygulama hiçbir üçüncü taraf yayın platformuna bağlı değildir. Yapılandırma yalnızca yerel `.env` dosyasından okunur: `EVREN_API_URL` (EVREN LLM ağ geçidi adresi) ve isteğe bağlı `EVREN_API_KEY`. Anahtar arayüzden de girilebilir ve gizli değerler istemciye yazılmaz.

## EVREN model ve anahtar yönetimi

Arayüzün sağ üstündeki **EVREN** düğmesi EVREN LLM ağ geçidinin model listesini ve anahtar yönetimini açar. İsteğe bağlı AI yetenekleri bu sağlayıcıya bağlam gönderir; kullanmadan önce gösterilen onay ve veri akışını gözden geçirin.

- Anahtar **diske şifreli olarak** yazılır (`.ulak-data/evren-key.enc`, AES-256-GCM; anahtar materyali `.ulak-data/.machine-secret` içindeki makine sırrından türetilir). Düz metin olarak hiçbir yerde — `.env`, veritabanı, denetim kaydı, günlük veya API yanıtı — bulunmaz.
- Sunucu açılışta `.env` içinde `EVREN_API_KEY` görürse değeri bir kez kasaya alır ve değişkeni `process.env`'den siler. Böylece KodMercek'in başlattığı `objdump`/`rizin` alt süreçleri anahtarı miras alamaz.
- İncelenen projeler anahtara hiçbir yoldan ulaşamaz: anahtar istemlere, raporlara, bulgulara veya dışa aktarımlara konmaz; sağlayıcı hata mesajları istemciye dönmeden önce anahtar `[gizli]` olarak maskelenir.
- **Sil** düğmesi şifreli dosyayı ve bellek kopyasını temizler; model listesi anında yenilenir. Silme geri alınamaz.
- Sunucu yeniden başlatıldığında anahtar şifreli dosyadan geri yüklenir; yeniden girmeniz gerekmez.

## Lisans

MIT — ayrıntılar [`LICENSE`](LICENSE) dosyasındadır. Gömülü üçüncü taraf bileşenlerin lisansları
`apps/backend/modules/KodMercek/LICENSE` ve `apps/backend/modules/KodMercek/third_party/*/LICENSE*`
altında ayrıca listelenmiştir.

## Araştırma kaynakları

Ayrıntılı teknik kararlar ve kaynak bağlantıları [`docs/research-implementation-sources.md`](docs/research-implementation-sources.md) dosyasındadır.

## KodMercek (işleyiş tetkiki) entegrasyonu

KodMercek, `apps/backend/modules/KodMercek` altında projeye gömülü olarak durur ve
`apps/backend/src/index.ts` içinden `createReverseEngineeringService()` ile kullanılır.
`POST /api/projects/:id/deep-analyze` uç noktası, arşivdeki hedef ikili dosyayı geçici dizine
çıkarıp `objdump` ve `rizin` ile inceler.

### Gerekli araçlar projeye gömülüdür

Sistemde `objdump`/`rizin` kurulu olmasına gerek yoktur; ikisi de depoda taşınır:

- `tools/binutils/objdump.exe` (+ `libintl-8`, `libiconv-2`, `zlib1`, `libzstd`, `libwinpthread-1` DLL'leri)
- `tools/rizin/rizin.exe` (+ `rz-*` araçları, `rz_*.dll` ve `share/` veri dizini)

`apps/backend/src/env.ts`, `REA_OBJDUMP_COMMAND` / `REA_RIZIN_COMMAND` tanımlı değilse bu yolları
`repoRoot`a göre çözer ve kendisi atar. Farklı bir kurulumu tercih ederseniz bu iki
değişkeni `.env` içinde elle verip gömülü araçları devre dışı bırakabilirsiniz.

### Windows native eklentisi

KodMercek'in sahiplenilmiş süreç başlatıcısı, paketlenmiş native eklentiyi
(`apps/backend/modules/KodMercek/native/windows/build/KodMercek-windows-x64.node`) zorunlu tutar. Bu eklenti
depoda hazır durumdadır (MinGW ile derlenmiş, `manifest.json` içinde sürüm/ABI/SHA-256 bilgisiyle).
`pnpm build` çıktısı `apps/backend/dist-server` altına da kopyalanır (`scripts/copy-native.mjs`), böylece
`pnpm start` ile çalışan derlenmiş sunucu da native yetkiyi korur. Eklenti bulunamazsa sunucu
otomatik olarak düz `execFile` çalıştırıcısına düşer; bu durumda süreç izolasyonu (Job Object,
DACL, reparse-safe yol denetimi) sağlanmaz.

### Taşınabilirlik

Klasörü olduğu gibi başka bir makineye/dizine kopyalayıp çalıştırabilirsiniz:

- `.npmrc` içindeki `node-linker=hoisted` sayesinde `node_modules` mutlak yol içeren junction
  oluşturmaz; kopyalanan dizinde de geçerli kalır.
- `tools/` ve `apps/backend/modules/` depoda izlenir; sistem genelinde kurulum gerekmez.
- Kopyaladıktan sonra `pnpm install` çalıştırmak yalnızca doğrulama amaçlıdır, zorunlu değildir.
- Kopyalanan dizinde `pnpm dev` ve `pnpm start` doğrudan çalışır; `repoRoot` sayesinde mutlak yol
  varsayımı yoktur.

Araçlar gerçekten yoksa uç nokta `503` ve eksik araçları belirten bir mesaj döner.
