# Android 4 → Android 7 güvenli ayar taşıma scripti

`android_settings_migrate.py` iki ADB cihazını karşılaştırır. Varsayılan olarak yalnızca rapor ve yedek üretir; hedef cihaza yazmaz.

## 1. Ön koşullar

- Android platform-tools içindeki `adb` PATH içinde olmalı.
- Eski ve yeni cihazda USB hata ayıklama açık olmalı.
- `adb devices` çıktısında iki cihaz da `device` durumunda görünmeli.
- Hedef cihazın geri dönüş/yedek imajı hazır olmalı.

## 2. Deneme ve rapor modu

```bash
python3 android_settings_migrate.py \
  --source ESKI_CIHAZ_SERI \
  --target YENI_CIHAZ_SERI \
  --backup-dir ./android-gecis-yedegi
```

Bu komut izin verilen ayarları okur, kaynak/hedef Android sürümünü ve modelini raporlar, JSON geçiş planı oluşturur ve hedefe hiçbir şey yazmaz.

## 3. Uygulama modu

JSON raporunu inceledikten sonra:

```bash
python3 android_settings_migrate.py \
  --source ESKI_CIHAZ_SERI \
  --target YENI_CIHAZ_SERI \
  --backup-dir ./android-gecis-yedegi \
  --apply
```

Script ayrıca onay ister. Otomasyon için `--apply --yes` kullanılabilir; bunu yalnızca cihaz yedeği doğrulandıktan sonra kullanın.

## Güvenlik politikası

Script yalnızca sınırlı kullanıcı ayarlarını taşır: ekran, döndürme, animasyon, saat, erişilebilirlik ve ses tercihleri. Kernel, vendor, framework, boot, `build.prop` kimliği, dalvik önbelleği, modem/EFS ve kalibrasyon bölümleri okunup yazılmaz. Wi‑Fi parolaları, uygulama özel verileri, kamera HAL dosyaları ve dokunmatik sürücüleri otomatik kopyalanmaz; bunlar sürüm ve donanım uyarlaması gerektirir.

Android 4 ve Android 7 arasında bazı `settings` anahtarları farklı davranabilir. Uygulama sonrası cihazı hemen yeniden başlatmak yerine önce dokunmatik, kamera, ses ve Wi‑Fi testleri yapılmalıdır.
