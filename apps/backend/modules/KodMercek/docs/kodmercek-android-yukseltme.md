# KodMercek Android Yükseltme Eklentisi

Eklenti, ana KodMercek uygulamasını değiştirmeden `website/public/kodmercek/plugins/android-upgrade/` altında çalışır. Amaç Android 4 gibi eski bir sürümden Android 7 gibi yeni bir sürüme geçerken eski cihazdaki ayarları ve çalışan bileşenleri sınıflandırmaktır.

Eklenti üç sonuç üretir: **Taşınabilir** (kullanıcı ayarı veya yeni sürümde yeniden oluşturulabilir veri), **Uyarlama gerekli** (yeni framework/HAL biçimine çevrilip test edilmesi gereken veri) ve **Dokunma** (kernel, vendor, önbellek veya cihaz kimliği gibi doğrudan kopyalanmaması gereken parça).

İlk sürüm güvenli bir sınır olarak ADB'den alınmış JSON raporlarını içe aktarır. Kaynak ve hedef cihaz raporları karşılaştırılır; bileşen kimlikleri eşleşiyorsa geçiş güveni artar. Hiçbir sistem bölümüne yazma, bootloader değiştirme veya rastgele dosya kopyalama yapılmaz.

## ADB rapor biçimi

Yerel yardımcı program eklendiğinde şu tip bir rapor üretmelidir:

```json
{
  "device": "Tablet A",
  "android": "4.4",
  "model": "TAB-A100",
  "components": {
    "soc": "mt8163",
    "camera": "ov5640",
    "touchscreen": "goodix-gt911",
    "audio": "tinyalsa",
    "wifi": "rtl8723"
  },
  "settings": ["wifi networks", "apn profiles", "locale"],
  "files": ["build.prop", "camera_config.xml", "touch.idc"]
}
```

ADB köprüsü için sonraki aşamada salt-okunur komutlar kullanılmalıdır: `getprop`, seçili `dumpsys` servisleri, `/proc` donanım bilgileri ve izinli sistem dosyalarının envanteri. `boot`, `vendor`, `vbmeta`, `persist`, modem/efs ve cihaz kimliği bölümleri varsayılan olarak dışarıda bırakılmalıdır.

Eklenti yalnızca plan üretir. Bir sonraki aşamada her taşıma öğesi için yedek alma, önizleme, kullanıcı onayı ve geri alma adımları eklenebilir.
