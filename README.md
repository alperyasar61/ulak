# ULAK — Proje İstihbaratı

ULAK, yazılım arşivini güvenli geçici alanda statik olarak inceler; proje haritası, bağımlılıklar ve doğrulanması gereken bulgular üretir. Arşivdeki kod hiçbir zaman çalıştırılmaz. AI sentezi ayrı bir kullanıcı onayı ister. Canlı teknik araştırma da ayrı bir adımdır; arama isteği ve gönderileceği kaynaklar ekranda gösterilir.

## Veri akışı

Arşiv yükleme, seçtiğiniz dosyayı ULAK sunucusuna ve projenin yönetilen nesne depolamasına gönderir. Bu içerik varsayılan olarak LLM’ye veya araştırma sağlayıcılarına gönderilmez. AI analizi başlatılırsa seçilmiş ve bilinen sırları maskelenmiş kaynak parçaları proje AI servisine iletilir. Canlı araştırma başlatılırsa onayladığınız paket adları/sürümler ve kısa teknik sorgular GitHub, OSV, Stack Exchange, npm ve PyPI’nin herkese açık API’lerine gider; dosyaların ham içeriği bu kaynaklara gönderilmez.

Runtime storage API’si dosya silme sunmadığı için proje kaydını kaldırmak, yüklenen arşiv nesnesini fiziksel olarak silmez. Arşiv depolama davranışı uygulamada kullanıcıya açıkça anlatılır. Bu ilk sürüm özel ULAK Preview alanı içindir; çok kullanıcılı kamuya açık yayıma almadan önce gerçek kullanıcı kimliği/erişim denetimi eklenmelidir.

## Geliştirme

- Node.js 20+ ve npm/pnpm gerekir.
- `.env.example` dosyasını `.env` olarak kopyalayın; `DATABASE_URL` ile platform AI/storage değişkenlerini kendi ortamınızdan doldurun. Bu değerler yalnızca sunucu tarafında okunur.
- `npm install`
- `npm run dev` (Vite Preview `:3000`, API `:3001`)
- `npm run typecheck`
- `npm run build`

Arşiv kodu ULAK tarafından çalıştırılmaz; yalnızca güvenli geçici alanda statik olarak listelenir ve incelenir. Yerel geliştirme API’sinin veritabanı bağlantısı olmadan başlamayacağını unutmayın.

Uygulama Webdev tarafından sağlanan `DATABASE_URL`, `MANUS_API_URL`, `MANUS_API_KEY` ve `BUILT_IN_FORGE_API_*` değişkenlerini yalnız sunucu tarafında okur. Gizli değerler istemciye yazılmaz.

## Araştırma kaynakları

Ayrıntılı teknik kararlar ve kaynak bağlantıları `research-implementation-sources.md` dosyasındadır.
