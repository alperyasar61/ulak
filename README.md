# ULAK — Proje İstihbaratı

ULAK, yazılım arşivini güvenli geçici alanda statik olarak inceler; proje haritası, bağımlılıklar ve doğrulanması gereken bulgular üretir. Arşivdeki kod hiçbir zaman çalıştırılmaz. AI sentezi ayrı bir kullanıcı onayı ister. Canlı teknik araştırma da ayrı bir adımdır; arama isteği ve gönderileceği kaynaklar ekranda gösterilir.

## Veri akışı

Arşiv yükleme, seçtiğiniz dosyayı ULAK sunucusunun yerel veri dizinine (`ULAK_DATA_DIR`, varsayılan `./.ulak-data`) yazar. Bu içerik varsayılan olarak LLM’ye veya araştırma sağlayıcılarına gönderilmez. AI analizi başlatılırsa seçilmiş ve bilinen sırları maskelenmiş kaynak parçaları, onayınızla **EVREN LLM Gateway** üzerinden seçtiğiniz modele iletilir. Canlı araştırma başlatılırsa onayladığınız paket adları/sürümler ve kısa teknik sorgular GitHub, OSV, Stack Exchange, npm ve PyPI’nin herkese açık API’lerine gider; dosyaların ham içeriği bu kaynaklara gönderilmez.

Proje kaydını kaldırmak, yerel veri dizinindeki arşiv nesnesini fiziksel olarak siler. Veritabanı satırı denetim izi için pasif olarak işaretlenir. Bu ilk sürüm özel ULAK Preview alanı içindir; çok kullanıcılı kamuya açık yayıma almadan önce gerçek kullanıcı kimliği/erişim denetimi eklenmelidir.

## Geliştirme

- Node.js 22+ gerekir (`node:sqlite` ve yerleşik `fetch` kullanılır). Node 24 ile test edildi.
- `.env.example` dosyasını `.env` olarak kopyalayın ve `EVREN_API_KEY` değerini doldurun. Bu değer yalnızca sunucu tarafında okunur.
- `pnpm install`
- `pnpm dev` (Vite `:3000`, API `:3001`)

Diğer komutlar:

- `pnpm typecheck`
- `pnpm build`
- `pnpm start` (derlenmiş API + `dist` arayüzü)

### Ortam değişkenleri

| Değişken | Zorunlu | Açıklama |
| --- | --- | --- |
| `EVREN_API_KEY` | AI için evet | EVREN LLM Gateway anahtarı. Yoksa proje yükleme ve yerel analiz çalışır, AI uçları 503 döner. |
| `EVREN_API_URL` | hayır | Varsayılan `https://evren-llmapi.ssyz.org.tr/v1`. |
| `EVREN_TIMEOUT_MS` | hayır | Model yanıtı zaman aşımı; varsayılan 300000 ms. Yavaş reasoning modelleri için artırılabilir. |
| `ULAK_DATA_DIR` | hayır | Arşiv nesneleri ve varsayılan SQLite dosyası; varsayılan `./.ulak-data`. |
| `ULAK_DB_FILE` | hayır | SQLite dosya yolunu ayrıca belirtmek için. |
| `DATABASE_URL` | hayır | Doluysa MySQL kullanılır; boşsa yerel SQLite. |
| `PORT` / `ULAK_DEV_API_PORT` | hayır | API portu; geliştirmede `pnpm dev` 3001 atar. |

Anahtar düz metin olarak `.env` dosyasında tutulur; üretimde bir sır yöneticisi kullanın ve sohbete/commit’e anahtar yazmayın.

## Mimari notlar

- `server/llm.ts`: EVREN `/v1/models` listesi (60 sn önbellek), sohbet dışı modellerin filtrelenmesi, 503’te tek yeniden deneme.
- `server/llm-utils.ts`: AI rapor şeması ve JSON ayıklama/doğrulama.
- `server/storage.ts`: yerel disk nesne deposu; anahtar yolu depolama kökü dışına çıkamaz, 25 MB sınırı vardır.
- `server/db.ts`: MySQL/SQLite sürücü soyutlaması; şema açılışta idempotent oluşturulur.
- `server/archive.ts`: arşiv çıkarma sınırları, statik analiz, import ilişkileri (indeksli çözümleme).
- `client/`: `App.tsx` kabuğu + `views/` ve `components/` altında ayrıştırılmış ekranlar.

## Araştırma kaynakları

Ayrıntılı teknik kararlar ve kaynak bağlantıları `research-implementation-sources.md` dosyasındadır.
