# ULAK yerel öğrenme notları

Bu dosya ULAK'ın farklı projelerde yeniden kullanabileceği genel güvenlik ve inceleme ilkelerini belgeler. İncelenen ürünlerin adı, kaynak kodu, dosya yolları, bulgu kanıtı, servis adresi, sırları veya projeye özgü mimarisi buraya eklenmez.

## Kalıcı ve yeniden kullanılabilir notlar

- **Gizli dosyalar:** Gizli dosyaları depoya eklemeyin; secret manager kullanın ve sızmış olabilecek anahtarları döndürün.
- **Kaynakta sabit sır:** Sırları kaynak kodundan çıkarıp secret manager veya ortam değişkeni kullanın; eşleşmeyi manuel doğrulayın.
- **Dinamik kod çalıştırma:** Dinamik çalıştırma girdilerinin güven sınırlarını ve mümkünse izin listesi/sandbox kullanımını inceleyin.
- **Girdi ve tehlikeli sink:** Kullanıcı girdisinin komut veya HTML sink'ine ulaşıp ulaşmadığını veri akışı analiziyle doğrulayın.
- **API yetkilendirmesi:** Hassas route'larda her istekte kimlik doğrulama ve kaynak bazlı yetkilendirme uygulandığını doğrulayın.
- **Kişisel veri işleme:** Kişisel veri için veri minimizasyonu, erişim denetimi, log maskeleme ve saklama süresini gözden geçirin.
- **TLS doğrulaması:** Üretim ortamında TLS sertifika doğrulamasını kapatmayın; test istisnalarını üretim yapılandırmasından ayırın.
- **CORS kapsamı:** CORS izinlerini gereken origin'lerle sınırlayın ve kimlik bilgileriyle birlikte wildcard kullanmayın.

## Nasıl güncellenir?

Backend'in makinece kullandığı sabit kural kataloğu [`learning.ts`](../apps/backend/src/learning.ts) içindedir. Yeni bir sabit kural ancak ürünlerden bağımsız, birden fazla projeye uygulanabilir ve kanıtla desteklenen bir ilkeyse eklenmelidir. Kuralı bir testle doğrulayın ve bu dosyayı da güncelleyin.

Her kod incelemesi veya API isteği tamamlandığında kullanıcıya isteğe bağlı bir not ekleme seçeneği sunulur. Kullanıcı notu ve yerel kaydı açıkça onaylamadıkça serbest biçimli not saklanmaz. Onaydan önce kategori, uzunluk, URL/e-posta/IP/anahtar/dosya yolu/kod işaretleri ve ilgili proje/çalışma alanı adları kontrol edilir; şüpheli içerik reddedilir. Notlar `ulak_shared_knowledge` tablosunda tekrar kimliğiyle saklanıp benzer notlarda birleştirilir. Bu tabloya kaynak proje veya çalışma alanı kimliği bağlanmaz.

`ulak_security_learning` tablosu yalnızca ULAK'ın önceden tanımladığı kural kimliklerini ve sayaçlarını tutar. İki öğrenme tablosu da proje/API çalışma alanı silindiğinde korunur; **Bulgular** sekmesindeki notları silme işlemi her ikisini temizler. Gelecekteki projeler bu notları bağlam olarak görebilir.

Notlar yalnızca seçili ULAK kurulumunun veritabanında kalır. Uzak MySQL veritabanı yapılandırılmışsa, notlar da o veritabanına kaydedilir. Bu mekanizma hiçbir dış servise, üçüncü tarafa veya AI sağlayıcısına veri göndermez; model eğitimi, otomatik kural değişikliği ya da serbest biçimli otomatik bilgi üretimi değildir.

## Neler kaydedilmez?

Notlar yalnızca genel, projeden bağımsız ilkeler içindir. Kişisel veri, müşteri/çalışan bilgisi, proje adı veya kaynak kodu, dosya yolu, bulgu kanıtı, servis adresi, token, API anahtarı ve benzeri hassas bilgi bu alana yazılmamalıdır. Backend bu kalıpları otomatik olarak reddeder; yine de sorumluluk kullanıcıdadır. Özel veya gizli bilgi girmeyin.
