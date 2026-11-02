# ULAK uygulama kararları için kaynak notları

## 7z arşiv desteği

`7zip-min` paketi Node.js’te 7-Zip CLI’sini çağıran çapraz-platform bir sarmalayıcıdır; `list()` ile içerik envanteri, `unpack()` ile ayıklama sunar. Paket kendi `7za` binary’sini `7zip-bin` üzerinden dahil eder; dokümanında 7z, zip, gzip ve tar desteği belirtilir. Bu nedenle ULAK’ta arşiv adlarını ayıklamadan önce doğrulamak, sembolik bağlantıları reddetmek ve çıkarma klasörünü geçici/izole tutmak gerekir.

- [7zip-min GitHub README](https://github.com/onikienko/7zip-min)
- [7zip-min npm paketi](https://www.npmjs.com/package/7zip-min)
- [7zip-bin kaynak deposu](https://github.com/develar/7zip-bin)

## İnternet araştırması: kullanılacak açık kaynak API’leri

İlk sürüm, genel arama motorunu taklit eden HTML kazıyıcıya dayanmayacak. Resmî ve makine-okunabilir kaynaklar kullanılacak: OSV bilinen açık kaynak güvenlik açıklarını paket/sürümle eşleştirir; GitHub REST Repository Search ilgili açık kaynak depolarını arar; npm Registry ve PyPI JSON API paket metaverisini ve sürümünü verir. ULAK sorgu üretirken sadece paket adı, sürümü, dil/ekosistem ve kullanıcının gözden geçirip onayladığı kısa teknik terimleri göndermeli; kaynak kodu bu API’lere gönderilmemeli.

- [OSV API](https://google.github.io/osv.dev/api/): `/v1/query` ve `/v1/querybatch`; dokümana göre API şu anda limit uygulamıyor.
- [GitHub REST Search API](https://docs.github.com/en/rest/search/search?apiVersion=2022-11-28): repository araması; dokümana göre kimlik doğrulamasız search limiti dakikada 10 istektir.
- [npm Registry API](https://api-docs.npmjs.com/): npm paket registry’sinin resmi API belgeleri.
- [npm package metadata format](https://github.com/npm/registry/blob/master/docs/responses/package-metadata.md): kayıt metaverisi ve paket bilgileri.
- [PyPI JSON API](https://docs.pypi.org/api/json/): `/pypi/<project>/json` ile güncel proje metaverisi ve sürüm bilgisi.

## Genel web arama konusunda sınır

DuckDuckGo’nun kendi belgeleri arama operatörlerini açıklar; ancak genel SERP sonuçları döndüren, belgelenmiş bir resmî API doğrulanmadı. Instant Answers endpoint’i de tam web arama API’si olarak kullanılmamalı. Bir üçüncü taraf teknik yazı, bu endpoint’in çoğu genel teknik sorguda boş döndüğünü; HTML kazıyıcıların ise kırılganlık ve hizmet koşulu riski taşıdığını açıklıyor. Bu yüzden ilk sürüm, güvenilir teknik API kaynaklarını kullanacak ve “tüm interneti taradım” iddiasında bulunmayacak. Genel web araması için daha sonra resmi bir arama API sağlayıcısı ve korumalı anahtar gerekebilir.

- [DuckDuckGo arama sözdizimi](https://duckduckgo.com/duckduckgo-help-pages/results/syntax)
- [DuckDuckGo Instant Answers yardım sayfası](https://duckduckgo.com/duckduckgo-help-pages/results/instant-answers)
- [DuckDuckGo API seçenekleri üzerine teknik değerlendirme](https://link.sc/blog/duckduckgo-search-api-guide) (üçüncü taraf sağlayıcı yazısı; ürün davranışı için birincil kaynak sayılmamalı)

- [Stack Exchange API v2.3 docs](https://api.stackexchange.com/docs): arama (search/advanced) kaynaklarını belirlemek için resmi ana dokümantasyon. `search-advanced` alt sayfasını stateless fetch ile okuyamadım; uygulama entegrasyonunda parametreleri teyit etmeden varsaymayacağım.


Stack Exchange ana API dokümanındaki bağlantı `/docs/advanced-search` sayfasına götürüyor (ilk denenen `/docs/search-advanced` yolu 404 verdi). Resmî sayfaya göre `GET /2.3/search/advanced` metin sorgusu (`q`), başlık, etiket, sıralama ve sayfa parametreleriyle soru listesi döndürüyor. Anonim istemciler için sayfa başına azami kayıt sayısı 25; bu uygulama düşük sayıda sonuçla ve kullanıcı onayıyla çalışmalı.

- [Stack Exchange API v2.3 — Overview](https://api.stackexchange.com/docs)
- [Stack Exchange API — Usage of /search/advanced](https://api.stackexchange.com/docs/advanced-search)


Resmî `GET /2.3/search/advanced` sayfası parametre olarak `q`, `title`, `tagged`, `sort`, `page` ve `pagesize` gibi arama alanlarını belgeliyor; sonuçlar soru listesidir. API ana sayfası, anonim çağrılarda sayfa başına en çok 25 sonuç ve kimlik doğrulamalı/anahtarlı kullanımda daha yüksek kota olabileceğini belirtiyor. ULAK sorguları başlık/etiket ve `q` ile sınırlandırıp sayfa başına yalnızca 5 kayıt isteyecek.

- [Stack Exchange API — Overview](https://api.stackexchange.com/docs)
- [Stack Exchange API — Usage of /search/advanced](https://api.stackexchange.com/docs/advanced-search)

## Proaktif denetim için karar kaynakları
ULAK’ın proaktif katmanı tam güvenlik tarayıcısı değildir; statik arşiv sinyallerini güvenli ve açıklanabilir biçimde gruplayan bir ön incelemedir. Kontrol adları ve sınırları şu birincil çerçevelerle hizalanır:
- [OWASP Application Security Verification Standard](https://owasp.org/www-project-application-security-verification-standard/): uygulama güvenliği doğrulama başlıkları; ULAK burada yalnızca yönetişim ve doğrulama başlıklarına referans verir, ASVS sertifikasyonu iddia etmez.
- [OpenSSF Scorecard](https://scorecard.dev/): açık kaynak projelerde depo ve tedarik zinciri güvenlik uygulamalarını değerlendirme yaklaşımı; ULAK’ın kilit dosyası, CI, branch/review ve güvenlik politikası sinyallerine ilham verir.
- [SLSA](https://slsa.dev/): yazılım tedarik zinciri bütünlüğü ve provenance modeli; ULAK’ın lockfile, build/provenance ve bağımlılık izlenebilirliği kontrolünün sınırını tanımlar.
- [GitHub code security documentation](https://docs.github.com/en/code-security): dependency review, secret scanning ve code scanning gibi üretim araçlarının ayrıştığı resmi açıklama; ULAK bu araçların yerine geçmez.

### Proaktif katmanda uygulanan sınırlar
Arşiv kodu yürütülmez. Sır dosyaları AI bağlamına alınmaz. Araştırma çalıştırılmadan önce sorgu paketi kullanıcıya gösterilir ve ham kaynak kodu GitHub, OSV, Stack Exchange, npm veya PyPI API’lerine gönderilmez. “Güçlü sinyal”, “izleme alanı” ve “öncelikli doğrulama” etiketleri kanıtın statik envanterdeki görünürlüğünü anlatır; açık/kapalı güvenlik kararı değildir. Üçüncü taraf araç sonuçları ve CVSS/OSV eşleşmeleri sonraki aşamada canlı araştırma kanıtı olarak bağlanmalıdır.
