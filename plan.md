# ULAK — Proaktif Proje İstihbaratı

## Uygulama yaklaşımı

ULAK’ın mevcut güvenli statik analiz çekirdeği korunur; yeni sürüm bu çekirdeğin üzerine otomatik çalışan **Proaktif Denetim** katmanı ekler. Arşiv yüklendiğinde kod çalıştırılmadan yerel sinyaller hesaplanır, bir sağlık skoru ve her sinyal için kanıt/öncelik/sonraki adım üretilir. Proaktif denetim LLM gerektirmez ve dış servise veri göndermez. AI sentezi ve canlı araştırma mevcut açık onay akışlarını korur.

Proaktif denetim; bağımlılık kilitleme, test/CI izi, güvenlik politikası ve sahiplik dokümantasyonu, sır hijyeni, tedarik zinciri görünürlüğü, dokümantasyon/lisans ve sürüm güncelliği hazırlığı gibi kontrol gruplarını statik olarak değerlendirir. Güncel paket sürümü veya OSV eşleşmesi gerektiğinde bu bilgiler ancak kullanıcı canlı araştırmayı onayladıktan sonra araştırma katmanından gelir. Böylece yerel sinyal ile canlı kanıt birbirinden ayrılır.

Sunucu tarafında analiz sonucu MySQL’de proje kaydıyla saklanır. Arşiv nesnesi yönetilen storage’da tutulmaya devam eder; runtime storage API fiziksel silme sunmadığı için silme uyarısı aynen korunur. Proje sahipliği mevcut tarayıcı oturum hash’i ile korunur; bu özel Preview sürümünde gerçek kimlik doğrulama olmadığı açıkça belirtilir.

## Proje yapısı

- `client/App.tsx`: Türkçe çalışma masası, proje seçimi, sekmeler, Proaktif Denetim paneli, açık onay akışları.
- `client/api.ts`: Proje, AI, canlı araştırma, sohbet ve proaktif denetim uçları.
- `client/types.ts`: Manifest, rapor, bulgu, kaynak ve proaktif denetim sözleşmeleri.
- `client/styles.css`: Koyu mürekkep / arşiv kâğıdı / sinyal turkuazı tasarım sistemi; mobil uyarlama.
- `server/archive.ts`: Güvenli arşiv listeleme/ayıklama, metin seçimi, statik ilişki ve yerel bulgu üretimi.
- `server/proactive.ts`: Dış servise çıkmadan çalışan kontrol matrisi, skor, seviye ve kanıt üretimi.
- `server/db.ts`: Proje, analiz, proaktif denetim ve sohbet kayıtları için yönetilen MySQL erişimi.
- `server/index.ts`: API, sahiplik, onay kapıları, storage ve LLM/araştırma orkestrasyonu.
- `server/research.ts`: OSV, GitHub, Stack Exchange, npm ve PyPI’nin makine-okunabilir uçları.
- `public/manus-routes.json`: Önizleme ve yayınlama için route manifesti.

## Tasarım yönü

Üç alternatif yön: **Arşiv istihbarat masası** (0.07) — editoryal araştırma hissi ve sakin kanıt katmanları; **Siber operasyon konsolu** (0.06) — yoğun alarm ve koyu terminal dili; **Kurumsal denetim defteri** (0.04) — resmi kontrol listesi ve daha ağır bilgi mimarisi.

Seçim: **Arşiv istihbarat masası**.

- **Design Movement:** Editoryal bilgi tasarımı ile düşük yoğunluklu güvenlik operasyonu ekranlarının birleşimi.
- **Core Principles:** Her bulgu kanıtla birlikte görünür; risk ile kesinlik ayrılır; dış aktarım kullanıcı onayına bağlıdır; yoğun veri sakin aralıklarla katmanlanır.
- **Color Philosophy:** Koyu mürekkep bağlamı ve mahremiyeti, arşiv kâğıdı uzun incelemeyi, sinyal turkuazı ise güvenli/eyleme hazır durumu temsil eder. Amber izlemeyi, kırmızı doğrulanması gereken riski belirtir.
- **Layout Paradigm:** Solda kalıcı proje bağlamı, üstte düşük gürültülü durum satırı, ortada geniş kanıt yüzeyi ve sağa yaslanan aksiyon alanı. Dashboard kartlarından çok bir inceleme masası ritmi kullanılır.
- **Signature Elements:** Rota/sinyal çizgisi, skor halkası ve kanıt etiketleri.
- **Interaction Philosophy:** Önce gör, sonra onayla, sonra dışarı çıkar. Tehlikeli veya geri döndürülemez adım açık metin ve checkbox olmadan çalışmaz.
- **Animation:** Sadece durum değişimlerinde kısa fade/slide; skor halkasında yavaş çizim; sürekli hareket veya dikkat dağıtan tarama efekti yok.
- **Typography System:** Sistem sans yazı ailesi; proje amacı ve kritik açıklamalar için ölçülü serif vurgu; teknik dosya yollarında monospace.
- **Brand Essence:** Projeyi çalıştırmadan anlayan ve bir sonraki denetimi kendisi öneren özel proje istihbaratı; sakin, kanıtlı, ihtiyatlı.
- **Brand Voice:** Başlıklar net ve editoryal; CTA’lar açık izin ister. Örnek: “Önce kanıtı gör.” ve “Güncel araştırmayı sen başlatırsın.”
- **Wordmark & Logo:** Küçük rota düğümleriyle çevrili “U” işareti; mevcut favicon’daki sinyal formu korunur.
- **Signature Brand Color:** Sinyal turkuazı `#83dfc6`.

## Kapsam ve riskler

Kritik kapsam: arşiv güvenliği, kaynak/AI onayı, sahiplik filtreleri ve Proaktif Denetim’in dış servissiz ilk çalışması. Önemli kapsam: denetim skorunun okunabilir sunumu, yenileme uç noktası ve kaynakların karar kartlarına bağlanması. İsteğe bağlı gelecek kapsam: gerçek kullanıcı kimliği, periyodik webhook/schedule denetimleri, SARIF dışa aktarımı, GitHub PR/CI entegrasyonu ve geçmiş sürümler arası diff.

En büyük risk, statik sinyalin kesin güvenlik hükmü gibi yorumlanmasıdır; arayüzde her kontrolde “kanıt”, “sınırlama” ve “sonraki adım” birlikte gösterilir. İkinci risk, proje arşivindeki metnin prompt injection içermesidir; AI istemlerinde içerik güvenilmeyen veri kabul edilir ve dosyadan gelen talimatlar izlenmez. Üçüncü risk, canlı kaynakların erişilememesi veya güncel sürümün uyumluluğu garanti etmemesidir; kaynak hataları ayrı gösterilir.

## Araştırma dayanakları

Proaktif kontrol sözlüğü OWASP ASVS 5.0.0’ın güvenli uygulama gereksinimleri yaklaşımı, OpenSSF Scorecard’ın kaynak/build/bağımlılık/test/bakım kontrolleri ve SLSA’nın artımlı tedarik zinciri güvencesi çerçeveleriyle uyumludur. ULAK bu çerçevelerin resmi tarayıcısı olduğunu iddia etmez; yalnızca arşivden doğrulanabilir ön sinyaller üretir. Canlı paket ve açık bulgu araştırması için mevcut OSV, GitHub, npm, PyPI ve Stack Exchange entegrasyonları korunur.
