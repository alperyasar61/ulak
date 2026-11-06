/**
 * Tuzak kataloğu — ARASTIRMA_YONTEMI.md §7.
 *
 * Metodoloji belgesindeki 13 tuzak burada iki gruba ayrılır:
 *  - `detectable: true`  → rapor ölçümlerinden otomatik tespit edilir.
 *  - `detectable: false` → süreç tuzağıdır (betik yazımı, ajan modeli); katalogda
 *    kalır ama "tespit edildi" diye işaretlenmez. Tespit edemediğimiz bir tuzağı
 *    "yok" saymak, §5'teki kanıt disiplinine aykırı olurdu.
 */

import type { LicenseInfo } from "./license.js";
import type { SizeHotspot, TestInventory, WrapperInfo } from "./inspect.js";

export interface TrapDefinition {
  id: number;
  title: string;
  symptom: string;
  fix: string;
  /** Rapor ölçümlerinden tespit edilebilir mi? */
  detectable: boolean;
}

export interface TrapHit extends TrapDefinition {
  detected: boolean;
  evidence: string[];
}

export const TRAP_CATALOG: TrapDefinition[] = [
  { id: 1, title: "Çift iç içe ZIP", symptom: "Tüm projeler \"boş\" görünür", fix: "Tek seviye in, aynı adlı alt klasörü kök kabul et", detectable: true },
  { id: 2, title: "Dizin yürüyüşü budama", symptom: "14.366 yerine ~200.000 dosya sayılır", fix: "Yürüyüş listesini yerinde değiştir (`dn[:] = [...]`)", detectable: false },
  { id: 3, title: "UTF-8 BOM", symptom: "JSON okuma \"Unexpected UTF-8 BOM\" ile düşer", fix: "`encoding=\"utf-8-sig\"` veya BOM'u kırp", detectable: true },
  { id: 4, title: "Kabuk here-string ile Türkçe metin", symptom: "Karakterler `?` olur, `replace` sessizce ıskalar", fix: "Betiği dosyaya yaz, `assert eski in metin` koy", detectable: false },
  { id: 5, title: "Copyleft yanlış pozitifi", symptom: "`import bpy` görülüp sınır ihlali sanılır", fix: "Doğru soru: kendi modülümüz **import ediliyor mu?**", detectable: false },
  { id: 6, title: "Alt ajan modeli yok", symptom: "Paralel ajanlar `400 model not supported` döner", fix: "Doğrudan betikle incele", detectable: false },
  { id: 7, title: "README ≠ lisans", symptom: "\"free\" yazar, LICENSE C sınıfıdır", fix: "Lisansı LICENSE dosyasından oku", detectable: true },
  { id: 8, title: "Kod lisansı ≠ ağırlık lisansı", symptom: "Kod Apache, model ağırlığı D sınıfı", fix: "İkisini ayrı kaydet", detectable: true },
  { id: 9, title: "Dil dağılımı boş", symptom: "\"Proje\" denilen şey tek bir `.ipynb`", fix: "Dil sayacı 0 ise proje sayma", detectable: true },
  { id: 10, title: "Boyut yanıltıcı", symptom: "3.121 MB → gömülü çalıştırılabilir dosya", fix: "Eşik üstü büyük dosya listesine bak", detectable: true },
  { id: 11, title: "Test sayısı tek başına", symptom: "0 test ama MIT + gerçek fikir", fix: "Lisansla birlikte oku", detectable: true },
  { id: 12, title: "Çerçeve iç API değişimi", symptom: "`app.routes` sarmalayıcıya dönüşür, sayım 0 çıkar", fix: "Gerçek istek veya `/openapi.json` ile say", detectable: false },
  { id: 13, title: "Test sayım deseni eksik", symptom: "1 test görünür, gerçekte 17", fix: "Dosya adı deseni yetmez; `src/test/` dizinlerini de say", detectable: true },
];

export interface TrapInput {
  archiveNames: string[];
  files: Array<{ path: string; content: string }>;
  /** Okuma sırasında BOM'u kırılan dosyalar; tespit bu listeden yapılır. */
  bomFiles?: string[];
  license?: LicenseInfo;
  tests?: TestInventory;
  sizeHotspots?: SizeHotspot[];
  wrapper?: WrapperInfo;
  /** Sembol envanterinde hiç dosya yoksa dil dağılımı boş sayılır. */
  symbolFileCount?: number;
}

const MODEL_WEIGHT = /\.(safetensors|ckpt|onnx|pth|gguf|h5|pb)$/i;
const SOURCE_FILE = /\.(py|pyi|ts|tsx|js|jsx|mjs|cjs|go|rs|java|kt|c|h|cpp|hpp|cs|rb|php|swift|scala|sh)$/i;

/** §7'deki 13 tuzağı rapor ölçümleriyle karşılaştırır. */
export function detectTraps(input: TrapInput): TrapHit[] {
  const names = input.archiveNames.map((name) => name.replace(/\\/g, "/"));
  const hits: TrapHit[] = [];

  for (const trap of TRAP_CATALOG) {
    const evidence: string[] = [];
    let detected = false;

    if (trap.detectable) {
      switch (trap.id) {
        case 1:
          if (input.wrapper?.doubleNested) {
            detected = true;
            evidence.push(`kök klasör \`${input.wrapper.root}\` ${input.wrapper.depth} kez tekrarlanıyor`);
          }
          break;
        case 3: {
          const bomFiles = input.bomFiles?.length
            ? input.bomFiles
            : input.files.filter((file) => file.content.startsWith("\uFEFF")).map((file) => file.path);
          if (bomFiles.length) {
            detected = true;
            evidence.push(...bomFiles.slice(0, 4).map((file) => `\`${file}\` BOM ile başlıyor`));
          }
          break;
        }
        case 7:
          if (input.license?.mismatch) {
            detected = true;
            evidence.push(`README "${input.license.readmeClaim ?? "?"}" · LICENSE "${input.license.detected ?? "tanınmadı"}" (${input.license.class})`);
          }
          break;
        case 8: {
          const weights = names.filter((name) => MODEL_WEIGHT.test(name));
          if (weights.length && input.license && (input.license.class === "A" || input.license.class === "D")) {
            detected = true;
            evidence.push(...weights.slice(0, 3).map((name) => `\`${name}\` ağırlık dosyası`));
            evidence.push(`kod lisansı ${input.license.class} sınıfı; ağırlık lisansı ayrı doğrulanmalı`);
          }
          break;
        }
        case 9: {
          const sources = names.filter((name) => SOURCE_FILE.test(name));
          if (!sources.length) {
            detected = true;
            evidence.push(`${names.length} öğe tarandı, kaynak uzantılı dosya yok`);
          } else if (input.symbolFileCount === 0) {
            detected = true;
            evidence.push(`${sources.length} kaynak dosya var ama sembol çıkarılamadı`);
          }
          break;
        }
        case 10:
          if (input.sizeHotspots?.length) {
            detected = true;
            evidence.push(...input.sizeHotspots.slice(0, 3).map((item) => `\`${item.path}\` ${(item.bytes / 1024 / 1024).toFixed(1)} MB`));
          }
          break;
        case 11:
          if (input.tests && input.tests.count === 0 && input.license && (input.license.class === "A" || input.license.class === "D")) {
            detected = true;
            evidence.push(`0 test dosyası · lisans ${input.license.class} sınıfı (${input.license.detected ?? "tanınmadı"})`);
          }
          break;
        case 13: {
          const directoryPattern = /(^|\/)(tests?|specs?|__tests__|e2e|testdata)(\/|$)/i;
          if (input.tests && input.tests.count > 0 && !input.tests.files.some((file) => directoryPattern.test(file))) {
            detected = true;
            evidence.push(`${input.tests.count} test dosyası yalnızca ad deseniyle bulundu; test klasörü eşleşmesi yok`);
          }
          break;
        }
        default:
          break;
      }
    }

    hits.push({ ...trap, detected, evidence });
  }

  return hits;
}

/** Tespit edilen tuzaklar; rapor ve arayüz yalnızca bunları öne çıkarır. */
export function detectedTraps(hits: TrapHit[]) {
  return hits.filter((hit) => hit.detected);
}
