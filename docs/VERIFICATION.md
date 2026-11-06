# ULAK — Doğrulama ve İnceleme Metodolojisi

Bu belge, `D:\Projeler\Oyun\ARASTIRMA-METODOLOJISI.md` içindeki 14 bölümlük yaklaşımın ULAK'a
uyarlanmış hâlidir. İlkeler aynı; komutlar ULAK'ın teknoloji yığınına (pnpm, Node, Express, Vite)
çevrilmiştir. Her kural bir komuta veya betiğe bağlanmıştır — böylece "kural" değil, "çalışan kontrol"
olur.

## 0. Temel ilke: önce kanıt, sonra cümle

Bir değişikliği "bitti" saymadan önce çalıştırılmış bir komut ve okunmuş bir çıktı olmalı.
ULAK'ta en küçük kanıt zinciri:

```powershell
pnpm typecheck      # tür hatası yok
pnpm test           # 78 birim testi
pnpm smoke:startup  # süreç gerçekten ayağa kalkıyor
```

## 1. Önce haritayı çıkar

1. Kök dizin: `apps/backend`, `apps/frontend`, `scripts`, `tools`, `docs`.
2. Manifest: kök `package.json` (`engines`, `scripts`), `apps/*/package.json`.
3. Giriş noktası: `apps/backend/src/index.ts` (Express rotaları), `apps/frontend/src/main.tsx`.
4. Yapılandırma: `.npmrc`, `.gitignore`, `.dockerignore`, `Dockerfile`, `.github/workflows/ci.yml`.
5. README iddiaları kodla uyuşuyor mu?

## 2. Arama sırası: pahalıdan ucuza

Sembol araması → `usages` → glob (`**/*.ts`) → grep (mutlaka dosya glob'u ile).
Örnek: `grep pattern: "app.get\\(\"/api" glob: "**/index.ts"`.

## 3. Büyük dosyalar: asla tamamını okuma

`apps/backend/src/index.ts` ve `apps/frontend/src/App.tsx` binlerce satırdır. Önce `grep -n` ile satır
numarasını bul, sonra `view_range` ile yalnızca o aralığı oku. Değişiklikte `edit` kullan; `create` ile
üzerine yazmak veri kaybı riskidir.

## 3.1 Ürünün kendi okuma katmanları

Bu metodolojinin ölçülebilir kısmı ULAK'ın içine gömülüdür; inceleme yapan kişi kadar ürün de aynı
sırayı izler. Her katman ayrı modülde, ayrı test dosyasıyla doğrulanır.

| Katman | Modül | Test | Ürettiği alan |
| --- | --- | --- | --- |
| Lisans sınıflandırması | `apps/backend/src/license.ts` | `license.test.ts` | `report.license` |
| Sembol envanteri | `apps/backend/src/inspect.ts` | `inspect.test.ts` | `report.symbols` |
| Test envanteri | `apps/backend/src/inspect.ts` | `inspect.test.ts` | `report.tests` |
| Boyut / sarmalayıcı | `apps/backend/src/inspect.ts` | `inspect.test.ts` | `report.sizeHotspots`, `report.wrapper` |
| Manifest gerekçeleri | `apps/backend/src/inspect.ts` | `inspect.test.ts` | `report.manifestNotes` |
| Yokluk kanıtları | `apps/backend/src/inspect.ts` | `inspect.test.ts` | `report.absenceEvidence` |
| Tuzak kataloğu | `apps/backend/src/traps.ts` | `traps.test.ts` | `report.traps` |
| Kontrol listesi | `apps/backend/src/checklist.ts` | `checklist.test.ts` | `report.checklist` |

Kurallar:

- **Lisans kuralı sırası bağlayıcıdır.** LGPL metni “GNU General Public License” içerdiği için LGPL,
  GPL'den önce sınanır; kısıtlayıcı (C) kuralları en başta gelir. Sıra bozulursa sınıflandırma yanlış olur.
- **Sınıf A bulgu üretmez.** Kısıt yoksa sessiz kalmak doğrudur; gürültü gerçek riski gizler.
- **Python sembolleri regex ile çıkarılır**, AST ile değil: Node'da `ast` modülü yok. Girinti düzeyi
  `function` ile `method` ayrımını, `_` öneki `exported: false` işaretini verir.
- **Yokluk iddiası arama listesi taşır.** “Test yok” diyen kayıt, hangi altı örüntünün tarandığını
  `searchedPatterns` alanında gösterir.
- **Yeni alanlar isteğe bağlıdır.** `LocalReport` alanları `?` ile tanımlıdır; MySQL'de duran eski
  `local_report_json` kayıtları bu katmanlar eklenmeden önce yazıldığı için bozulmadan açılmalıdır.
- **BOM okuma anında kırpılır, tespiti korunur.** `\uFEFF` ile başlayan dosya kırpılmadan ayrıştırılırsa
  `package.json` okunamaz ve bağımlılık listesi sessizce boş kalır (tuzak #3'ün gerçek sonucu). Kırpılan
  dosyalar `bomFiles` listesinde tutulur; tuzak #3 kanıtı bu listeden üretilir.
- **Tespit edilemeyen tuzak “yok” sayılmaz.** `traps.ts` içindeki `detectable: false` kayıtları süreç
  tuzağıdır (betik yazımı, alt ajan modeli, çerçeve içi API değişimi). Katalogda görünürler ama asla
  `detected: true` olmazlar.
- **Kontrol listesinde üç durum vardır.** `pass` / `fail` / `unknown`. `unknown` süreç kararıdır
  (“bitti” tanımı yazıldı mı, gövde okundu mu); geçti sayılmaz, eksik gibi de gösterilmez. İki durumlu
  bir liste, yapılmamış bir işi yapılmış gibi gösterirdi.

## 4. Değişiklikten önce geri dönüş yolu

```powershell
pnpm backup:data            # .ulak-data -> .ulak-data-backups/<zaman>
pnpm backup:data --list     # mevcut yedekler
pnpm backup:data --prune 5  # en yeni 5 yedeği tut
```

Duman testi, toplu silme veya şema değişikliğinden önce bu komut çalıştırılır. `scripts/smoke-startup.mjs`
kendi geçici veri klasörünü (`mkdtemp`) kullanır ve sonunda siler; gerçek `.ulak-data/` klasörüne dokunmaz.

## 5. Yedi katmanlı doğrulama

| Katman | ULAK komutu | Ne yakalar |
| --- | --- | --- |
| 1. Sözdizimi | `pnpm typecheck` | Tür/tanım hataları |
| 2. Bağımlılık | `pnpm install --frozen-lockfile` + `pnpm check:engines` | Sürüm çakışması, engines uyumsuzluğu |
| 3. Sunucu açılışı | `pnpm smoke:startup` | Route/port/başlatma hatası |
| 4. API sözleşmesi | `node scripts/smoke-test.mjs` (sunucu ayaktayken) | JSON şeması, durum kodu |
| 5. Arayüz | `pnpm smoke:startup` (index.html + statik varlık) | Eksik build çıktısı, 404 varlık |
| 6. Kalıcılık | `smoke:startup` içindeki tekrar istek + `pnpm backup:data` | Kaydetme hatası |
| 7. Regresyon | `pnpm test` + CI | Yan etki |

Katman 5'in tarayıcı tarafı (DOM, konsol hataları) henüz otomatik değildir; Playwright eklenirse
`page.on("pageerror")` ve `page.on("console")` ile konsol hataları da toplanmalı ve
`errors.length === 0` olmadan test geçmiş sayılmamalıdır.

## 6. Test yazma kuralları

- Tek dosya, tek amaç; test kendi verisini kurar ve temizler.
- Test gerçek sunucuya gider, mock'a değil (`scripts/smoke-test.mjs` deseni).
- Beklenen değer yazdırılır: `6/6 kontrol geçti`, sadece "ok" denmez.
- Geçici dosyalar `tmp-` önekiyle başlar ve sonunda silinir; `.gitignore`'da `tmp-*` kuralı vardır ve
  `pnpm audit:data` bunu doğrular.
- Test verisi gerçek veriyle karıştırılmaz (`FLUSH-TEST-12345` benzeri ayırt edici adlar).

## 7. Sürüm/uyumluluk incelemesi

```powershell
pnpm check:engines            # engines kesişimi
pnpm check:engines --matrix   # CI matrisi (JSON)
```

Kök `engines.node`: `>=22.13 <23 || >=24 <25 || >=26`. Node 23 ve 25 dışarıda çünkü `vitest@5`
onları desteklemiyor. Bu bulgu tam olarak bu denetimle çıktı. Paket `engines` alanı
`require('paket/package.json')` ile değil, `fs.readFileSync` ile okunur (modern paketlerde
`ERR_PACKAGE_PATH_NOT_EXPORTED` verir).

## 8. Gizlilik denetimi — üç katman

| Katman | Araç | Doğrulama |
| --- | --- | --- |
| `.gitignore` | kural | `pnpm audit:data` → `git check-ignore --no-index` |
| `pre-commit` | `.githooks/pre-commit` | `pnpm hooks:install` sonrası `git add -f` + commit → çıkış 1 |
| Uzak depo | CI | `pnpm audit:data` her koşuda izlenen dosyaları ve tüm geçmişi tarar |

`pnpm audit:data` üç katmanı da tek komutta denetler: ignore kuralları, izlenen dosyalar,
`git log --all --name-only` geçmişi.

## 9. Dış ağ sınırı — beş adım

```powershell
pnpm audit:network
```

Betik tüm ağ çağrı noktalarını (`fetch`, `undiciFetch`, `axios`, `http.request`, `jsonRequest`)
bulur, her mutlak URL host'unu çıkarır ve `KNOWN_TARGETS` tablosuyla eşleştirir. Tabloda olmayan bir
host varsa `--strict` modunda çıkış 1 verir.

Mevcut sınır:

| Host | Ne gönderiliyor | Kapı |
| --- | --- | --- |
| `evren-llmapi.ssyz.org.tr` | AI istemi + proje bağlamı | `EVREN_API_URL` + açık onay |
| `api.github.com` | depo adı, arama sorgusu | açık onay |
| `api.osv.dev` | paket adı + sürüm | açık onay |
| `api.stackexchange.com` | arama sorgusu | açık onay |
| `registry.npmjs.org`, `pypi.org` | paket adı | açık onay |
| kullanıcı tanımlı | kullanıcının seçtiği tek istek | **Gönder** eylemi |

Kural: üçüncü taraf servise kod, kimlik bilgisi veya kullanıcı içeriği gönderilmez; gerekiyorsa açık
onay alınır ve varsayılan kapalı tutulur.

## 10. CI kuralları

- Matris elle yazılmaz: `engines` işi `check-engines --matrix` çıktısını `outputs.matrix` olarak verir,
  `build-and-test` bunu `fromJSON` ile tüketir.
- `pnpm install --frozen-lockfile` (npm ci karşılığı).
- Yalnızca derleme değil, çalıştırma da test edilir: `pnpm smoke:startup`.
- Yerelde aynı komut çalıştırılır: `pnpm verify`.

## 11. Raporlama biçimi

```
## Ne yaptım
## Nasıl doğruladım   (komut → çıktı → yorum)
## Bulgular / riskler (tablo: konu | durum | kanıt)
## Sırada ne var
```

Kanıt yoksa "tamamlandı" denmez; "3/4 geçti, 4. şu hatayı verdi" denir.

## 12. Sık düşülen tuzaklar

| Tuzak | Belirti | ULAK'taki çözüm |
| --- | --- | --- |
| PowerShell BOM | `JSON.parse` → `Unexpected token '\uFEFF'` | Node ile yaz: `fs.writeFileSync(p, JSON.stringify(x, null, 2))` |
| `keepalive` fetch | `Failed to fetch`, gövde boş | 64 KB sınırı; büyük gövdede kullanma |
| `[hidden]` çalışmıyor | Eleman görünür kalıyor | `display:` kuralı `[hidden]`'ı ezer; `!important` gerekir |
| `create` üzerine yazmıyor | "already exists" | Önce sil, ya da `edit` kullan |
| Here-string ile Node | Türkçe karakter bozuluyor | `.js` dosyası yaz, `node dosya.js` çalıştır |
| `execFileSync('npm')` | Windows'ta bulunamıyor | `execSync('npm -v')` kullan |
| Port çakışması | `EADDRINUSE` | `smoke:startup` boş port ister (`net.createServer().listen(0)`) |
| Test verisi sızıntısı | Depoda `tmp-*.js` | `.gitignore`'da `tmp-*` + `pnpm audit:data` |
| `engines` kesişimi | "Bende çalışıyor" | `pnpm check:engines` |

## 13. Hızlı başlangıç kontrol listesi

- [ ] Kök dizin yapısını çıkar
- [ ] `package.json` / `apps/*/package.json` oku
- [ ] `engines` aralığını not et → `pnpm check:engines`
- [ ] Giriş noktasını bul (`apps/backend/src/index.ts`), ilk 100 satırını oku
- [ ] `.gitignore` + `git check-ignore` → `pnpm audit:data`
- [ ] `git log --all --name-only` geçmiş taraması → `pnpm audit:data`
- [ ] Dış ağ çağrıları → `pnpm audit:network`
- [ ] CI matrisi `engines` ile uyumlu mu
- [ ] README iddiaları kodla uyuşuyor mu
- [ ] Değişiklik öncesi `pnpm backup:data`
- [ ] Değişiklik sonrası `pnpm verify`
- [ ] Geçici dosyaları sil
- [ ] Raporla: ne yaptım / nasıl doğruladım / bulgular / sırada ne var

## 14. Tek cümle

> **Okumadan değiştirme, yedeklemeden silme, doğrulamadan "bitti" deme, kanıtsız rapor verme.**
