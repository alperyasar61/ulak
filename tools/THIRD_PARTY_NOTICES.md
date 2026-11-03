# `tools/` üçüncü taraf bildirimleri

Bu dizindeki ikili dosyalar ULAK tarafından yazılmamıştır. Hepsi **değiştirilmemiş**
upstream yayın arşivlerinden çıkarılmıştır ve kendi lisanslarına tabidir. ULAK'ın kök
[MIT lisansı](../LICENSE) bu dosyalar için geçerli değildir.

Her dosyanın boyutu ve SHA-256 özeti [`tools-manifest.json`](./tools-manifest.json)
içinde listelenir. Doğrulamak için:

```bash
node scripts/verify-tools.mjs
```

Bir aracı bilerek güncellediğinizde `node scripts/generate-tools-manifest.mjs` ile
manifestoyu yeniden üretin.

## 1. GNU Binutils (objdump) — WinLibs dağıtımı

| Alan | Değer |
| --- | --- |
| Dizin | `tools/binutils/` |
| Bileşen | `objdump.exe` (GNU Binutils) ve çalışma zamanı DLL'leri |
| Sürüm | Binutils 2.47.20260726, WinLibs r3 (GCC 16.2.0, MinGW-w64 UCRT 14.0.0) |
| Dağıtım | WinLibs — <https://winlibs.com/> |
| İndirme | <https://github.com/brechtsanders/winlibs_mingw/releases/download/16.2.0posix-23.1.3-14.0.0-ucrt-r3/winlibs-x86_64-posix-seh-gcc-16.2.0-mingw-w64ucrt-14.0.0-r3.zip> |
| Arşiv SHA-256 | `3C69305081E4A647144339A936244FCF7D3D9E558319E1AD7BE2CD2886D4B6A1` |
| Arşiv boyutu | 276.414.382 bayt |
| Paket kaynağı | winget `BrechtSanders.WinLibs.POSIX.UCRT` sürüm `16.2.0-14.0.0-r3` |
| Lisans | GNU GPL v3 or later (binutils); DLL'ler için aşağıya bakın |

`tools/binutils/` içeriği yukarıdaki arşivin `mingw64/bin/` dizininden **birebir**
kopyalanmıştır; hiçbir ikili yeniden derlenmemiş veya yamalanmamıştır. Doğrulanan
dosyalar ve upstream arşivdeki karşılıklarıyla eşleşen özetleri:

| Dosya | SHA-256 |
| --- | --- |
| `objdump.exe` | `31E0217183B137C154DF9FB87E0A1E18C85CAC3D61CC3CA71083CA70D965CC8C` |
| `libiconv-2.dll` | `1324B9D8C394B6012C80EC20691ECA95B5046C1A06C5BCC7D26966EFD9CA2E28` |
| `libintl-8.dll` | `51E1279B2AEFB1E7EC51AD0B47D0E7A3FC39D30D26A6E919518D8BDABE682118` |
| `libwinpthread-1.dll` | `2512E8E9CEECD1C47D894A3CD38B895E1F40F3D42D0CCEBC2A1521EE2FE496A9` |
| `libzstd.dll` | `F010307F121A1F2B83DDD93EA156A618C29EBB88C2D53A2FE3E4886124438F45` |
| `zlib1.dll` | `84BD7628D3C14AEA881B7EC2197035B7C0A5F64AD6884E01F8D1FCFF0021070F` |

Lisans metinleri ve kaynak kodu:

- Binutils kaynak kodu: <https://sourceware.org/git/?p=binutils-gdb.git> (GPL-3.0-or-later, <https://sourceware.org/git/?p=binutils-gdb.git;a=blob;f=COPYING3>)
- GNU gettext / `libintl-8.dll`, `libiconv-2.dll`: LGPL-2.1-or-later, <https://www.gnu.org/licenses/lgpl-2.1.html>
- MinGW-w64 runtime (`libwinpthread-1.dll`): MIT benzeri zlib/BSD tipi lisans, <https://www.mingw-w64.org/>
- zlib (`zlib1.dll`): zlib lisansı, <https://zlib.net/zlib_license.html>
- Zstandard (`libzstd.dll`): BSD-3-Clause, <https://github.com/facebook/zstd/blob/dev/LICENSE>

GPL kapsamındaki `objdump.exe` yeniden dağıtıldığı için, ikiliyi alan kişi ilgili
kaynak kodu edinme hakkına sahiptir. Kaynak kodu yukarıdaki upstream adreslerden ve
WinLibs sürüm etiketinden (`16.2.0posix-23.1.3-14.0.0-ucrt-r3`) edinilebilir.

## 2. Rizin

| Alan | Değer |
| --- | --- |
| Dizin | `tools/rizin/` |
| Bileşen | `rizin.exe`, `rz-*.exe`, `rz_*.dll`, `share/` veri ağacı |
| Sürüm | Rizin 0.9.1 (Windows shared64, clang_cl x64 yapısı) |
| Proje | <https://rizin.re/> — <https://github.com/rizinorg/rizin> |
| İndirme | <https://github.com/rizinorg/rizin/releases/download/v0.9.1/rizin-windows-shared64-v0.9.1.zip> |
| Arşiv SHA-256 | `45FFA004E26653EAEE8D262B8E6EEAE09402A7D319C1F20A2BA794BD6AF1CC28` |
| Kaynak arşivi | <https://github.com/rizinorg/rizin/archive/refs/tags/v0.9.1.tar.gz> |
| Kaynak arşivi SHA-256 | `7AC1CD7DACA7AFDDA742E15478B1F747FC1F813E496FEE71839D1E109E543DCA` |
| Lisans | LGPL-3.0-or-later (kütüphaneler); araçlar için GPL-3.0-or-later |

`tools/rizin/` içeriği yukarıdaki arşivin `bin/` ve `share/` dizinlerinden birebir
kopyalanmıştır (400 dosyalık manifestonun 357'si `share/` ağacıdır). Hiçbir ikili
yeniden derlenmemiş veya yamalanmamıştır. Örnek özetler:

| Dosya | SHA-256 |
| --- | --- |
| `rizin.exe` | `4E23543E17D41242152CD38F8BBEAFD161CE50AF970848794DE407F86CC5CCA7` |
| `rz_core-0.9.dll` | manifestoda (`tools-manifest.json`) |
| `rz_arch-0.9.dll` | manifestoda (`tools-manifest.json`) |

Lisans metinleri:

- LGPL-3.0: <https://www.gnu.org/licenses/lgpl-3.0.html>
- GPL-3.0: <https://www.gnu.org/licenses/gpl-3.0.html>
- Rizin `COPYING` / `COPYING.LESSER`: <https://github.com/rizinorg/rizin/tree/v0.9.1>

LGPL kapsamındaki kütüphaneleri yeniden dağıttığınızda, alıcının kütüphaneyi
değiştirip yeniden bağlayabilmesi için kaynak kodu ve derleme bilgisi edinme hakkı
korunmalıdır. ULAK bu DLL'leri değiştirmeden, kendi süreçlerinden ayrı çalıştırılabilir
dosyalar olarak kullanır.

## 3. ULAK'ın yükümlülükleri

- Bu dizindeki hiçbir dosya ULAK tarafından değiştirilmedi; upstream özetleri
  `tools-manifest.json` ile kanıtlanabilir.
- ULAK'ın kendi kaynak kodu MIT lisanslıdır ve bu araçların lisanslarını kapsamaz.
- Ticari veya kurumsal yeniden dağıtım öncesinde yukarıdaki lisansları ve atıf
  koşullarını kendi hukuk/uyum sürecinizle doğrulayın.
