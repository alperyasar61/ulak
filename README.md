# ULAK — Proje İstihbaratı

ULAK, yazılım arşivini güvenli geçici alanda statik olarak inceler; proje haritası, bağımlılıklar ve doğrulanması gereken bulgular üretir. Arşivdeki kod hiçbir zaman çalıştırılmaz. AI sentezi ayrı bir kullanıcı onayı ister. Canlı teknik araştırma da ayrı bir adımdır; arama isteği ve gönderileceği kaynaklar ekranda gösterilir.

## Veri akışı

Arşiv yükleme, seçtiğiniz dosyayı ULAK sunucusuna ve projenin yönetilen nesne depolamasına gönderir. Bu içerik varsayılan olarak LLM’ye veya araştırma sağlayıcılarına gönderilmez. AI analizi başlatılırsa seçilmiş ve bilinen sırları maskelenmiş kaynak parçaları proje AI servisine iletilir. Canlı araştırma başlatılırsa onayladığınız paket adları/sürümler ve kısa teknik sorgular GitHub, OSV, Stack Exchange, npm ve PyPI’nin herkese açık API’lerine gider; dosyaların ham içeriği bu kaynaklara gönderilmez.

`DELETE /api/projects/:id` projeyi yumuşak siler (kayıt `deleted_at` ile işaretlenir) **ve** yüklenen arşiv nesnesini diskten kaldırır. Nesne silinemezse istek yine başarılı döner, yanıttaki `warning` alanı nedeni bildirir. Bu ilk sürüm özel ULAK Preview alanı içindir; çok kullanıcılı kamuya açık yayıma almadan önce gerçek kullanıcı kimliği/erişim denetimi eklenmelidir.

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

Arşiv kodu ULAK tarafından çalıştırılmaz; yalnızca güvenli geçici alanda statik olarak listelenir ve incelenir. Yerel geliştirme API’sinin veritabanı bağlantısı olmadan başlamayacağını unutmayın.

Uygulama hiçbir üçüncü taraf yayın platformuna bağlı değildir. Yapılandırma yalnızca yerel `.env` dosyasından okunur: `EVREN_API_URL` (EVREN LLM ağ geçidi adresi) ve isteğe bağlı `EVREN_API_KEY`. Anahtar arayüzden de girilebilir ve gizli değerler istemciye yazılmaz.

## EVREN model ve anahtar yönetimi

Arayüzün sağ üstündeki **EVREN** düğmesi model listesini ve anahtar yönetimini açar.

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

