# ULAK — Kod İnceleme Raporu

**Tarih:** 2026-02-19
**Kapsam:** `apps/backend/src/*`, `apps/frontend/src/*`, kök yapılandırma, CI, Docker, dokümantasyon
**Yöntem:** ULAK'ın kendi statik analizi (483 öğe, 260 analiz edilen) + elle kod incelemesi + `pnpm typecheck` + `pnpm test`

## Özet

| Önem | Adet | Durum |
| --- | --- | --- |
| Yüksek | 3 | Düzeltildi |
| Orta | 5 | Düzeltildi |
| Düşük | 6 | 5 düzeltildi, 1 karar bekliyor |

Proje genel olarak sağlam: tip güvenliği tam (`strict` + `exactOptionalPropertyTypes`), 45 birim testi geçiyor, arşiv çıkarma yol geçişine karşı korumalı, XSS yüzeyi yok (`dangerouslySetInnerHTML`/`innerHTML`/`eval` kullanılmıyor), sırlar AES-256-GCM ile şifreli saklanıyor. Aşağıdaki bulgular bu temeli bozmuyor; çoğu "yazılmış ama bağlanmamış" ya da "dokümantasyon koddan kopmuş" sınıfında.

---

## Yüksek önem

### H1 — Hız sınırlayıcı hiç çalışmıyordu

**Dosya:** `apps/backend/src/security.ts` → `rateLimitMiddleware`

Fonksiyon `windows`/`hits`/`resetAt` durumunu tanımlıyor, `limit` ve `windowMs` parametrelerini alıyor, ama gövdesi yalnızca `next()` çağırıyordu. Yani:

- `POST /api/projects/:id/ai` (3 istek / 10 dk)
- `POST /api/projects/:id/research` (3 / 10 dk)
- `POST /api/projects/:id/reconstruct` (6 / 10 dk)
- `POST /api/projects/:id/chat` (20 / 1 dk)

için tanımlanan tüm sınırlar etkisizdi. LLM ağ geçidine sınırsız istek atılabiliyordu (maliyet + kota riski).

**Düzeltme:** Gerçek kayan pencere uygulaması eklendi. Anahtar oturum jetonunun SHA-256'sı (jeton yoksa IP). Süre dolmuş pencereler temizleniyor, harita üst sınırı aşınca süpürme yapılıyor. `429` + `Retry-After` + `X-RateLimit-*` başlıkları dönüyor. Testler için `resetRateLimits()` eklendi.

### H2 — Yükleme boyutu sınırsızdı (`Infinity`)

**Dosya:** `apps/backend/src/index.ts`

```ts
const maxUploadBytes = Infinity;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: Infinity, ... } });
```

`multer.memoryStorage()` ile birlikte bu, tek bir istekle süreç belleğini tüketmeye açık kapı bırakıyordu. Ayrıca:

- `jsonError` hâlâ "Dosya 25 MB sınırını aşıyor." diyordu,
- `storage.ts` içindeki `putObject` 25 MB'ta reddediyordu.

Sonuç: 25 MB üstü bir arşiv belleğe tamamen alınıyor, analiz ediliyor, sonra **depoya yazılırken** anlamsız bir hatayla düşüyordu.

**Düzeltme:** Sınır `ULAK_MAX_UPLOAD_MB` ile yapılandırılabilir hale getirildi (varsayılan 25 MB). `multer`, `jsonError`, `responseBuffer` ve `storage.ts` aynı tek kaynağı (`maxObjectBytes()`) kullanıyor. Multer'ın `LIMIT_FILE_SIZE` / `LIMIT_UNEXPECTED_FILE` / `LIMIT_FILE_COUNT` hataları artık `413`/`400` olarak eşleniyor.

### H3 — Sunucu tüm ağ arayüzlerine bağlanıyordu

**Dosya:** `apps/backend/src/index.ts` → `app.listen(port, "0.0.0.0", ...)`

README ve güvenlik modeli "yerel tek kullanıcı" diyor; `singleUserMode()` + loopback kontrolü tüm sahipleri `SINGLE_USER_HASH` altında birleştiriyor. `0.0.0.0` bağlaması ile birlikte **aynı LAN'daki herhangi bir istemci** tüm projelere erişebiliyordu (kimlik doğrulama yok, yalnızca oturum jetonu var ve o da `/api/session` ile serbestçe alınabiliyor).

**Düzeltme:** Varsayılan bağlama `127.0.0.1`. `ULAK_HOST` ile geçersiz kılınabilir. Docker imajı `ULAK_HOST=0.0.0.0` olarak ayarlar (konteyner içinde dışarı açılması gerektiği için).

---

## Orta önem

### M1 — Güvenlik başlıkları eksikti

Yalnızca `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` gönderiliyordu. `Content-Security-Policy` ve `X-Frame-Options` yoktu → clickjacking ve (ileride eklenecek bir XSS ile) kaynak enjeksiyonu riski.

**Düzeltme:** `default-src 'self'` tabanlı CSP ve `X-Frame-Options: DENY` eklendi. Ön yüzde inline `<script>`/`<style>` yok, harici kaynak yok; React'in `style={{}}` kullanımı CSSOM üzerinden gittiği için CSP tarafından engellenmez.

### M2 — Genel hata işleyici multer hatalarını ayırt etmiyordu

`app.use((error, ...))` her şeyi `jsonError` üzerinden geçiriyordu; multer hataları `code` alanı taşıdığı için "İşlem tamamlanamadı." gibi anlamsız 400'lere dönüşüyordu.

**Düzeltme:** `jsonError` artık `code` alanını okuyup multer hata kodlarını anlamlı mesaj ve doğru HTTP durumuna eşliyor.

### M3 — README koddan kopmuştu (silme davranışı)

`README.md:9` "proje kaydını kaldırmak yüklenen arşiv nesnesini fiziksel olarak silmez" diyordu. Oysa `DELETE /api/projects/:id` `deleteObject(row.archive_key)` çağırıyor ve başarı mesajı dönüyor.

**Düzeltme:** README güncellendi; silme davranışı (kayıt + nesne) doğru anlatılıyor, nesne silinemezse dönen `warning` alanı belgelendi.

### M4 — Belgelenen Node sürümü yanlıştı

`README.md:38` "Node.js 20+" diyordu. Ancak `db.ts` `node:sqlite` kullanıyor; bu modül Node 22.5'te geldi ve 22.13'ten itibaren bayraksız çalışıyor. Node 20'de uygulama **hiç açılmaz**. Hiçbir `package.json` içinde `engines` alanı yoktu, yani `pnpm install` uyumsuz sürümü uyarmadan kabul ediyordu.

**Düzeltme:** README "Node.js 22.13+" olarak düzeltildi; kök, backend ve frontend `package.json` dosyalarına `engines.node: ">=22.13"` eklendi.

### M5 — Ölü içe aktarımlar

`index.ts` içinde `node:fs/promises` (`fs`), `node:os` (`os`) ve `node:url` (`fileURLToPath`) içe aktarılıyor ama hiç kullanılmıyordu (0 kullanım).

**Düzeltme:** Kaldırıldı.

---

## Düşük önem

### L1 — Kök `LICENSE` dosyası yok

ULAK'ın kendi analizi de bunu işaretledi. Yalnızca `apps/backend/modules/KodMercek/LICENSE` ve `third_party/*` altında lisanslar var. **Karar bekliyor:** hangi lisans (MIT / Apache-2.0 / özel) kullanılacağı proje sahibinin tercihi.

### L2 — `App.tsx` tek dosyada 1829 satır

Bakım maliyeti yüksek. Bölme önerisi: `components/` altında `ProjectList`, `ProjectDetail`, `UploadPanel`, `AiPanel`, `ResearchPanel`, `ChatPanel`, `EvrenDialog`, `FindingTable`. **Bu turda yapılmadı** — davranış değişikliği riski taşıdığı için ayrı bir iş olarak ele alınmalı.

### L3 — Şema "migrasyonları" kırılgan

`db.ts` her açılışta `ALTER TABLE ... ADD COLUMN` çalıştırıp hata mesajını `/duplicate column|already exists/i` ile eşliyor. Çalışıyor ama sürüm tablosu (`schema_version`) ile değiştirilmeli. **Bu turda yapılmadı** — mevcut kurulumlarda veri kaybı riski var.

### L4 — `envKey` süreç belleğinde kalıyor

`adoptEnvKey()` anahtarı `process.env`'den siliyor ama modül değişkeni `envKey`'de tutmaya devam ediyor; `resolveEvrenKey()` `memoryKey || envKey` döndürüyor. Alt süreçlerin anahtarı miras almaması garanti (asıl amaç buydu), ama anahtar süreç belleğinde duruyor. README'de belgelenmiş bir ödünleşim; **davranış korundu**, rapora kaydedildi.

### L5 — Dışa aktarma format dallanması kırılgan

`/api/projects/:id/export/:format` içinde iç içe üçlü operatör zinciri vardı. `markdown` ve `md` aynı çıktıyı üretiyordu (doğru), ama yeni format eklemek hataya açıktı.

**Düzeltme:** Formatlar `Record<string, { render, extension }>` tablosuna taşındı. Davranış aynı; `json`, `md`, `markdown`, `sarif` çalışıyor, bilinmeyen format `400` dönüyor (doğrulandı).

### L6 — Rota seviyesinde test yok

45 test var ama hepsi saf fonksiyon/birim testi (`blueprint`, `credentials`, `llm-utils`, `proactive`). HTTP katmanı (oturum doğrulama, yükleme sınırı, hız sınırı, dışa aktarma) test edilmiyordu.

**Düzeltme (kısmi):** Hız sınırlayıcı ve yükleme sınırı için birim testleri eklendi (`security.test.ts`, `storage.test.ts`). Tam rota testleri (`supertest` ile) hâlâ eksik.

---

## Doğrulanan iyi uygulamalar

- **Yol geçişi koruması:** `storage.ts` `objectPath()` ve `archive.ts` çıkarma yolları `..`/`\0` ve kök dışına çıkmayı reddediyor.
- **Arşiv sınırları:** 5000 girdi, 350 MB ilan edilen boyut, 260 çıkarılan dosya, 18 MB çıkarılan toplam, dosya başına 400 KB metin.
- **Sır yönetimi:** EVREN anahtarı AES-256-GCM ile şifreli, makine sırrı `scrypt` ile türetiliyor, `.machine-secret` `0600` izniyle yazılıyor, anahtar hiçbir API yanıtına/loga/rapora girmiyor.
- **XSS:** Ön yüzde `dangerouslySetInnerHTML`, `innerHTML`, `eval` yok; tüm kullanıcı verisi React tarafından kaçışlanarak render ediliyor.
- **SSRF:** GitHub indirmesi `github.com` dışına yönlendirmede reddediliyor, `AbortSignal.timeout(60_000)` var.
- **Tip güvenliği:** `strict` + `exactOptionalPropertyTypes` açık, `pnpm typecheck` temiz.
- **CI:** Node 22 üzerinde typecheck → build → test sırası doğru, `--frozen-lockfile` kullanılıyor.

---

## Doğrulama

Düzeltmeler sonrası çalıştırılanlar:

| Komut | Sonuç |
| --- | --- |
| `pnpm --filter @ulak/backend test` | 6 dosya, **56 test geçti** (önceki 45 + 11 yeni) |
| `pnpm typecheck` | Temiz (backend + frontend) |
| `pnpm build` | Başarılı (backend `tsc` + native kopyalama, frontend `vite build`) |

Çalışan sunucu üzerinde uçtan uca doğrulama (`PORT=3012`):

| Kontrol | Beklenen | Sonuç |
| --- | --- | --- |
| `GET /api/health` | 200 + `ok:true` | ✅ |
| Güvenlik başlıkları | CSP + `X-Frame-Options` | ✅ `frame-ancestors 'none'`, `X-Frame-Options: DENY` |
| Dinleme adresi | yalnızca `127.0.0.1` | ✅ `Get-NetTCPConnection` doğruladı |
| `POST /api/projects/:id/ai` × 4 | 3 geçer, 4. `429` | ✅ `429` + `Retry-After: 600` |
| 30 MB arşiv yükleme | `413` + anlamlı mesaj | ✅ "Dosya 25 MB sınırını aşıyor." |
| `GET /api/projects/:id/export/{json,md,markdown,sarif}` | 200 | ✅ |
| `GET /api/projects/:id/export/xml` | 400 | ✅ |
| `DELETE /api/projects/:id` | kayıt + nesne silinir | ✅ nesne diskten kalktı |
| SPA sunumu (`/`, `/assets/*`, `/projects/abc`) | 200 | ✅ |

---

## Kalan işler (öncelik sırası)

1. **L1** — Lisans seçimi ve kök `LICENSE` dosyası.
2. **L6** — `supertest` ile rota seviyesinde entegrasyon testleri (özellikle `POST /api/projects` yükleme sınırı ve `429` davranışı).
3. **L2** — `App.tsx` bileşenlere bölünmesi.
4. **L3** — `schema_version` tabanlı migrasyon.
5. CI'a `pnpm lint` adımı (henüz lint yapılandırması yok — ESLint eklenmeli).
