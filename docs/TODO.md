# ULAK — Teslim ve geliştirme sonuçları

## Tamamlanan sonuçlar

### 0. Araştırma metodolojisi uyarlaması (kanıt önce, cümle sonra)
- [x] `pnpm check:engines`: kök `engines.node` aralığının kurulu tüm bağımlılıkların `engines` aralıklarıyla kesişimi doğrulanır; `--matrix` CI matrisini üretir. Node 23/25'in `vitest` tarafından desteklenmediği bu denetimle bulundu ve aralık daraltıldı.
- [x] `pnpm audit:data`: üç katmanlı veri sızıntısı denetimi (`.gitignore` kuralları, izlenen dosyalar, tüm git geçmişi).
- [x] `pnpm audit:network`: dış ağ sınırı denetimi; her ağ çağrı noktası ve hedef host sınır tablosuyla eşleştirilir, sınıflandırılmamış hedef CI'da kırmızı olur.
- [x] `pnpm smoke:startup`: derlenmiş sunucu boş portta gerçekten başlatılır, `/api/health`, `/api/session`, `/api/projects` ve arayüz varlıkları gerçek HTTP ile doğrulanır.
- [x] `pnpm backup:data`: yıkıcı denemeden önce `.ulak-data/` yedeği; `--list` ve `--prune <n>` desteklenir.
- [x] `pnpm hooks:install`: `pre-commit` kancası veri hijyeni denetimini zorunlu kılar (üç katmanlı gizlilik korumasının 2. katmanı).
- [x] CI matrisi elle yazılmaz; `check-engines --matrix` çıktısından türetilir ve gerçek açılış testi çalıştırılır.
- [x] Node.js 26 LTS'e geçildi (Dockerfile, CI, README ve `engines` aralıkları güncel).
- [x] Kurallar [docs/VERIFICATION.md](VERIFICATION.md) içinde komutlara bağlandı.
- [ ] Tarayıcı tarafı doğrulama (DOM + konsol hataları) henüz otomatik değil; Playwright eklendiğinde `pageerror`/`console` toplanmalı.

### 1. Güvenli statik proje alımı
- [x] Kullanıcı `.7z`, `.zip`, `.tar`, `.tgz` veya `.tar.gz` arşivi yükleyebilir ya da herkese açık GitHub depo adresi girebilir.
- [x] Arşiv kodu çalıştırılmadan listelenir; path traversal, sembolik bağlantı, aşırı açılma boyutu, dosya adedi ve metin dosyası sınırları kontrol edilir.
- [x] Proje amacı, teknoloji yığını, modüller, olası giriş noktaları, bağımlılıklar ve statik import ilişkileri gösterilir.

### 2. Proaktif Denetim ve Faz 1 güvenlik motoru
- [x] Arşiv yüklendiği anda dış servise veri göndermeden proaktif kontrol matrisi çalışır.
- [x] Denetim; bağımlılık kilitleme, test/CI, güvenlik yönetişimi, sır hijyeni, tedarik zinciri, dokümantasyon/lisans ve güncel araştırma hazırlığı sinyallerini değerlendirir.
- [x] Secret scanning sağlayıcı token, private key, JWT/anahtar formatı ve maskeleştirilmiş kanıtlarla genişletildi.
- [x] Docker/container, Terraform/Kubernetes/Helm ve kayan CI action referansı kontrolleri eklendi.
- [x] SBOM bileşenleri, PURL değerleri ve OSV sorgusu için sürüm hazırlığı rapora eklendi.
- [x] Denetim yenilemelerinde baseline diff; skor değişimi, regresyon, iyileşme ve yeni kontrolleri saklıyor.
- [x] Genel skor “yol gösterici sinyal” olarak sunulur; kesin güvenlik sertifikası veya tam SAST sonucu gibi sunulmaz.

### 3. Kontrollü AI, canlı araştırma ve dışa aktarım
- [x] AI analizi açık checkbox onayı ve seçilen model olmadan başlamaz.
- [x] Canlı araştırma sorguları ve paket ad/sürümleri gönderilmeden önce kullanıcıya gösterilir ve düzenlenebilir.
- [x] Ham kaynak kodu canlı araştırma kaynaklarına gönderilmez; araştırma hataları ve boş sonuçlar açıkça gösterilir.
- [x] Raporlar kullanıcı eylemiyle SARIF, JSON ve Markdown olarak indirilebilir.
- [x] AI, canlı araştırma ve sohbet sonuçları proje bazında saklanır; sır değerleri raporlarda tekrarlanmaz.

### 4. Rapor ve yönetişim deneyimi
- [x] Genel bakış, proje haritası, bulgular, proaktif denetim, canlı araştırma, yol haritası, takip sohbeti ve gizlilik sekmeleri vardır.
- [x] Kullanıcı veri akışını, dış aktarım kapsamını ve storage fiziksel silme sınırlamasını görür.
- [x] ULAK kaynak deposunun görünürlüğü ile çalışan uygulamanın erişim güvenliği birbirinden ayrılır; uygulamada gerçek kullanıcı kimliği/erişim denetimi olmadığı belirtilir.

## Sonraki aşamalar

### Kritik — gerçek kullanıcı ve saklama yönetişimi
- [ ] ULAK uygulamasını internete veya çok kullanıcılı ortama açmadan önce gerçek kimlik doğrulama, kullanıcıya özel yetki, arşiv silme ve saklama süresi uygulanmalı.
- [ ] Proje ve mesaj uçlarında rate limit, audit log ve CSRF/oturum sertleştirmesi eklenmeli.

### Faz 2 — derin statik analiz
- [ ] TypeScript/JavaScript ve Python için AST tabanlı SAST ve kontrollü veri akışı analizi.
- [ ] API yüzeyi, OpenAPI karşılaştırması ve authentication/authorization analizi.
- [ ] PII/veri gizliliği ve log veri sızıntısı analizi.
- [ ] Gerçek OSV/registry canlı araştırma sonuçlarının onaylı paket sürümüyle eşleştirilmesi.

### Faz 3 — sürekli denetim ve ekip akışı
- [ ] Yeni arşiv sürümü/GitHub webhook geldiğinde otomatik yeniden denetim ve iki sürüm arasında bulgu diff’i.
- [ ] Planlı denetim için schedule/trigger entegrasyonu ve değişen kritik bulgu bildirimi.
- [ ] Git geçmişi analizi, GitHub PR/CI entegrasyonu, issue bağlantısı ve bulgu yaşam döngüsü.

### Faz 2 — derin statik analiz ilk dilimi
- [x] TypeScript/JavaScript kaynakları çalıştırılmadan TypeScript AST üzerinden dinamik çağrı, HTML sink ve request girdisi yakınlık sinyalleri taranıyor.
- [x] Express/FastAPI benzeri route imzalarından API yüzeyi çıkarılıyor; hassas route’larda auth örüntüsü yoksa düşük güvenli inceleme bulgusu üretiliyor.
- [x] PII alan adı ve log bağlamı sinyalleri çıkarılıyor; ham değerler rapora alınmıyor.
- [x] SAST/API/Gizlilik bulguları mevcut Bulgular ekranında ve Genel Bakış Faz 2 özetinde görünür.

### Faz 3 — ekip akışı ve sürekli denetim ilk dilimi
- [x] Bulgular için açık, inceleniyor, kabul edildi ve çözüldü durumları eklendi.
- [x] Proje sahibi bulgu başına ekip notu yazabiliyor; durum ve notlar yönetilen veritabanında saklanıyor.
- [x] Proaktif panelden kullanıcı eylemiyle GitHub CI denetim şablonu indirilebiliyor.
- [ ] GitHub webhook imza doğrulaması ve olay geldiğinde kontrollü yeniden denetim.
- [ ] Git geçmişi/sürüm karşılaştırması, PR/issue bağlantısı ve planlı denetim entegrasyonu.
