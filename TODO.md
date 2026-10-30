# ULAK — Teslim ve geliştirme sonuçları

## Tamamlanan sonuçlar

### 1. Güvenli statik proje alımı
- Kullanıcı `.7z`, `.zip`, `.tar`, `.tgz` veya `.tar.gz` arşivi yükleyebilir ya da herkese açık GitHub depo adresi girebilir.
- Arşiv kodu çalıştırılmadan listelenir; path traversal, sembolik bağlantı, aşırı açılma boyutu, dosya adedi ve metin dosyası sınırları kontrol edilir.
- Proje amacı, teknoloji yığını, modüller, olası giriş noktaları, bağımlılıklar ve statik import ilişkileri gösterilir.

### 2. Proaktif Denetim
- Arşiv yüklendiği anda dış servise veri göndermeden proaktif kontrol matrisi çalışır.
- Denetim; bağımlılık kilitleme, test/CI, güvenlik yönetişimi, sır hijyeni, tedarik zinciri, dokümantasyon/lisans ve güncel araştırma hazırlığı sinyallerini değerlendirir.
- Her kontrolde seviye, öncelik, gerekçe, kanıt ve uygulanabilir sonraki adım gösterilir.
- Genel skor “yol gösterici sinyal” olarak sunulur; kesin güvenlik sertifikası veya tam SAST sonucu gibi sunulmaz.
- Proaktif denetim kullanıcı isterse aynı arşivden yenilenebilir ve sonucu proje kaydında saklanır.

### 3. Kontrollü AI ve canlı araştırma
- AI analizi açık checkbox onayı ve seçilen model olmadan başlamaz.
- Canlı araştırma sorguları ve paket ad/sürümleri gönderilmeden önce kullanıcıya gösterilir ve düzenlenebilir.
- Ham kaynak kodu canlı araştırma kaynaklarına gönderilmez; araştırma hataları ve boş sonuçlar açıkça gösterilir.
- AI, canlı araştırma ve sohbet sonuçları proje bazında saklanır; sır değerleri raporlarda tekrarlanmaz.

### 4. Rapor ve yönetişim deneyimi
- Genel bakış, proje haritası, bulgular, proaktif denetim, canlı araştırma, yol haritası, takip sohbeti ve gizlilik sekmeleri vardır.
- Kullanıcı veri akışını, dış aktarım kapsamını ve storage fiziksel silme sınırlamasını görür.
- Özel Preview sürümünün gerçek kullanıcı kimliği/erişim denetimi içermediği açıkça belirtilir.

## Sonraki aşamalar

### Kritik — gerçek kullanıcı ve saklama yönetişimi
- Çok kullanıcılı kamuya açık yayımdan önce gerçek kimlik doğrulama, kullanıcıya özel yetki, arşiv silme ve saklama süresi uygulanmalı.
- Proje ve mesaj uçlarında rate limit, audit log ve CSRF/oturum sertleştirmesi eklenmeli.

### Önemli — sürekli denetim
- Yeni arşiv sürümü/GitHub webhook geldiğinde otomatik yeniden denetim ve iki sürüm arasında bulgu diff’i eklenmeli.
- Planlı denetim için schedule/trigger entegrasyonu ve kullanıcıya değişen kritik bulgu bildirimi eklenmeli.
- Proaktif bulgulara OSV/CVSS, Scorecard ve SLSA kanıt bağlantıları bağlanmalı; dış araçların çıktısı güvenli biçimde içe aktarılmalı.

### İsteğe bağlı — ekip akışı
- SARIF/Markdown rapor dışa aktarımı, GitHub issue/PR bağlantısı, bulgu durumu (açık/incelemede/çözüldü) ve ekip notları eklenmeli.
- İzinli ve sınırları açık bir canlı arama API sağlayıcısı eklenebilir; genel web kazıma kullanılmamalı.
