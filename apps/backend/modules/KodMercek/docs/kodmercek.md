# KodMercek: diff, AST ve raporlar

KodMercek'e `website/public/kodmercek/` adresinden ulaşılır. Yeni sürümde üst araç çubuğundan **Kod inceleme**, **Git diff** ve **AST özeti** modları seçilebilir.

## Git diff inceleme

Tarayıcı sürümünde Git erişimi yoktur; bu nedenle diff görünümü yüklenen dosyaları örnek bir önceki çalışma ağacıyla karşılaştırır. Kullanıcı dosya yüklediğinde mevcut dosya içeriği çalışma ağacı olarak kabul edilir. Üretim entegrasyonunda bu katmana `git diff --unified=...` çıktısı verilebilir. Satırlar `+` ve `−` olarak ayrıştırılıp dosya, satır aralığı ve ilgili güvenlik bulgusu ile eşleştirilmelidir. Sunucu tarafında Git çıktısı çalıştırılacaksa depo yolu kullanıcıdan alınmış güvenilir bir proje kimliğiyle sınırlandırılmalı; keyfi komut, uzak URL ve çalışma ağacına yazma yetkisi verilmemelidir.

## Gelişmiş AST entegrasyonu

İlk sürüm bağımlılık kurmadan fonksiyon, içe aktarma, koşul, asenkron yapı ve yorum sinyallerini çıkarır. Gerçek AST için dil başına parser sağlayıcısı eklenmesi önerilir: TypeScript/JavaScript için TypeScript Compiler API veya tree-sitter, Python için tree-sitter-python, diğer diller için ayrı grammar. Sağlayıcı çıktısı ortak bir şemaya dönüştürülmelidir: `file`, `nodeType`, `startLine`, `endLine`, `name`, `children`, `complexity` ve `evidence`. Güvenlik kuralları ham metin regex'i yerine mümkün olduğunda bu düğümler üzerinde çalışmalıdır.

## Güvenlik kurallarını özelleştirme

Arayüzde **Kurallarımı yönet** düğmesine basıp ad, JavaScript regex deseni, önem seviyesi ve açıklama girilebilir. Özel kurallar `localStorage` içinde `kodmercek-custom-rules` anahtarıyla tutulur; kod tarayıcıdan çıkmaz. Kural örneği:

```text
Ad: Sabit API anahtarı
Desen: api[_-]?key\s*[:=]\s*["'][^"']+
Önem: Kritik
```

Üretim sürümünde bu kayıtlar JSON şemasıyla doğrulanmalı, regex çalışma süresi ve desen uzunluğu sınırlandırılmalı, ReDoS riski için güvenli regex motoru veya AST eşleştirme kullanılmalıdır. Kurallar proje dosyasında sürümlenmek istenirse aynı biçim `.kodmercek/rules.json` olarak dışa aktarılabilir; öncelik sırası proje kuralı → ekip kuralı → yerleşik kural şeklinde tutulabilir.

## HTML ve PDF dışa aktarma

**HTML indir** düğmesi bulguları, dosya/satır konumunu ve açıklamayı tek bir bağımsız HTML dosyasında oluşturur. **PDF yazdır** tarayıcının yazdırma iletişim kutusunu açar ve `@media print` stiliyle sadece rapor yüzeyini yazdırır. Bu yaklaşım tarayıcıda ek PDF kütüphanesi istemez.

Sunucu tabanlı kesin PDF gerektiğinde aynı rapor modelinden HTML üretilip Chromium print-to-PDF, Playwright veya mevcut proje altyapısındaki PDF dönüştürücü kullanılabilir. PDF'ye kaynak kod satırı, bulgu özeti, önem dağılımı, analiz tarihi, araç sürümü ve kapsam/sınırlamalar eklenmelidir. Rapor üretimi sırasında kullanıcı kodu dış servise gönderilmemeli; dosya adları ve içerik HTML'e aktarılırken kaçışlanmalıdır.
