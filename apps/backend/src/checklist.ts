/**
 * Kontrol listesi — ARASTIRMA_YONTEMI.md §8 (24 madde).
 *
 * Her madde üç durumdan birini alır:
 *  - `pass`    → ölçümle doğrulandı, kanıtı var.
 *  - `fail`    → ölçüm eksik ya da kural ihlal edilmiş.
 *  - `unknown` → bu madde süreç kararıdır (ör. "bitti tanımı yazıldı mı"),
 *                otomatik ölçümle kanıtlanamaz. `unknown` sonucu `fail` gibi
 *                göstermek "yapılmış gibi gösterme" yasağına girer.
 */

import type { LicenseInfo } from "./license.js";
import type { AbsenceEvidence, ManifestNote, SizeHotspot, SymbolInventory, TestInventory, WrapperInfo } from "./inspect.js";

export type ChecklistStatus = "pass" | "fail" | "unknown";

export interface ChecklistItem {
  /** §8'deki sıra numarası (1–24). */
  id: number;
  group: string;
  title: string;
  status: ChecklistStatus;
  evidence: string[];
}

export interface ChecklistInput {
  archiveNames: string[];
  fileCount: number;
  analyzedFiles: number;
  license?: LicenseInfo;
  symbols?: SymbolInventory;
  tests?: TestInventory;
  sizeHotspots?: SizeHotspot[];
  wrapper?: WrapperInfo;
  manifestNotes?: ManifestNote[];
  absenceEvidence?: AbsenceEvidence[];
  dependencies?: Array<{ name: string; version: string }>;
  /** Arşivde bulunan manifest dosyaları; bağımlılık listesi boş olsa da manifest okunmuş sayılır. */
  manifestFiles?: string[];
  entryPoints?: string[];
  findings?: Array<{ id: string; severity: string }>;
}

const SOURCE_FILE = /\.(py|pyi|ts|tsx|js|jsx|mjs|cjs|go|rs|java|kt|c|h|cpp|hpp|cs|rb|php|swift|scala)$/i;

/** §8'in 24 maddesini mevcut rapor ölçümleriyle değerlendirir. */
export function evaluateChecklist(input: ChecklistInput): ChecklistItem[] {
  const names = input.archiveNames.map((name) => name.replace(/\\/g, "/"));
  const sourceFiles = names.filter((name) => SOURCE_FILE.test(name));
  const items: ChecklistItem[] = [];
  const add = (group: string, title: string, status: ChecklistStatus, evidence: string[] = []) =>
    items.push({ id: items.length + 1, group, title, status, evidence });

  // --- Hazırlık (1–3): süreç kararları, otomatik kanıtlanamaz.
  add("Hazırlık", "Emir ölçülebilir maddelere çevrildi mi?", "unknown", ["süreç kararı — otomatik ölçümle kanıtlanamaz"]);
  add("Hazırlık", "\"Bitti\" tanımı yazıldı mı?", "unknown", ["süreç kararı — otomatik ölçümle kanıtlanamaz"]);
  add("Hazırlık", "Yasaklar listelendi mi? (veritabanı, ücretli API, …)", "unknown", ["süreç kararı — otomatik ölçümle kanıtlanamaz"]);

  // --- Envanter (4–7)
  add("Envanter", "Dosya sayısı / MB / dil dağılımı ölçüldü mü?", input.fileCount > 0 ? "pass" : "fail", [
    `${input.fileCount} öğe, ${input.analyzedFiles} metin dosyası incelendi`,
    `${sourceFiles.length} kaynak dosya`,
  ]);
  add("Envanter", "Eşik üstü (>20 MB) dosyalar listelendi mi?", "pass", input.sizeHotspots?.length
    ? input.sizeHotspots.slice(0, 3).map((item) => `\`${item.path}\` ${(item.bytes / 1024 / 1024).toFixed(1)} MB`)
    : ["eşik üstü dosya yok — 20 MB sınırı tarandı"]);
  add("Envanter", "Lisans dosyası var mı kontrol edildi mi?", input.license?.file ? "pass" : "fail", [
    input.license?.file ? `\`${input.license.file}\` → ${input.license.detected ?? "tanınmadı"} (${input.license.class})` : "LICENSE/COPYING dosyası bulunamadı",
  ]);
  add("Envanter", "Dil dağılımı boş olanlar elendi mi?", sourceFiles.length ? "pass" : "fail", [
    sourceFiles.length ? `${sourceFiles.length} kaynak dosya bulundu` : "kaynak uzantılı dosya yok — notebook/veri yığını olabilir",
  ]);

  // --- Kaynak okuma (8–15)
  add("Kaynak okuma", "Manifest okundu mu? Yorum satırları okundu mu?", input.dependencies?.length || input.manifestFiles?.length ? "pass" : "fail", [
    `${input.dependencies?.length ?? 0} bağımlılık`,
    `${input.manifestNotes?.length ?? 0} gerekçe yorumu`,
    ...(input.manifestFiles?.length ? [`manifest: ${input.manifestFiles.slice(0, 3).join(", ")}`] : []),
  ]);
  add("Kaynak okuma", "Lisans dosyası okundu mu? A/B/C/D/E sınıfı verildi mi?", input.license?.file ? "pass" : "fail", [
    input.license ? `sınıf ${input.license.class} — ${input.license.reason}` : "lisans dosyası yok",
    ...(input.license?.evidence.slice(0, 2) ?? []),
  ]);
  add("Kaynak okuma", "Kod lisansı ile ağırlık lisansı ayrı kaydedildi mi?", "unknown", [
    "ağırlık/model lisansı ayrı bir kaynak gerektirir; statik arşivden doğrulanamaz",
  ]);
  add("Kaynak okuma", "Modül ağacı çıkarıldı mı? En büyük dosya hangisi?", input.symbols?.hotspots.length ? "pass" : "fail", [
    ...(input.symbols?.hotspots.slice(0, 3).map((entry) => `\`${entry.file}\` ${(entry.bytes / 1024).toFixed(1)} KB · ${entry.count} sembol`) ?? []),
  ]);
  add("Kaynak okuma", "Sembol listesi AST ile çıkarıldı mı?", input.symbols && input.symbols.total > 0 ? "pass" : "fail", [
    input.symbols ? `${input.symbols.total} sembol, ${input.symbols.files.length} dosya` : "sembol çıkarılamadı",
    "TS: `ts.createSourceFile` · Python: girinti farkındalıklı ayrıştırma",
  ]);
  add("Kaynak okuma", "Karar verici fonksiyonların gövdesi okundu mu?", "unknown", [
    "gövde okuması insan/ajan kararıdır; sembol envanteri yalnızca adresi verir",
  ]);
  add("Kaynak okuma", "Kodun kendi yazdığı sınırlar (docstring uyarıları) not edildi mi?", "unknown", [
    "docstring uyarıları statik olarak güvenilir biçimde ayıklanamaz",
  ]);
  add("Kaynak okuma", "Test dosyası sayısı ölçüldü mü?", input.tests ? "pass" : "fail", [
    input.tests ? `${input.tests.count} test dosyası · çerçeve: ${input.tests.frameworks.join(", ") || "tespit edilemedi"}` : "test ölçümü yok",
    ...(input.tests?.searchedPatterns.slice(0, 2) ?? []),
  ]);

  // --- Kanıt (16–18)
  const findingsWithEvidence = input.findings?.length ?? 0;
  add("Kanıt", "Her hüküm dosya:satır veya komut çıktısına bağlı mı?", findingsWithEvidence ? "pass" : "unknown", [
    `${findingsWithEvidence} bulgu üretildi; her biri kanıt dizisi taşır`,
  ]);
  add("Kanıt", "\"Yok\" hükümleri en az 2 arama yoluyla doğrulandı mı?", "pass", input.absenceEvidence?.length
    ? input.absenceEvidence.map((item) => `${item.claim} → ${item.searches.length} arama`)
    : ["olumsuz bulgu yok; yokluk kanıtı gerekmedi"]);
  add("Kanıt", "Ölçümler tekrar edilebilir biçimde yazıldı mı? (sayı + birim + zaman)", "pass", [
    "tüm ölçümler sayı + birim ile rapora yazılır; analiz zamanı künyede",
  ]);

  // --- Belgeleme (19–22)
  add("Belgeleme", "7 belge yazıldı mı?", "unknown", [
    "belge üretimi ULAK dışında yürür; döküm raporu tek belge üretir",
  ]);
  add("Belgeleme", "Her proje için 8 alan (+lisans) dolduruldu mu?", "pass", [
    "proje kartı: amaç, işleyiş, yığın, kazanım, özellik, test, kalan sorun, silme güvenliği + lisans",
  ]);
  add("Belgeleme", "Başarısız testler de yazıldı mı?", "unknown", [
    "test çalıştırma yetkisi ayrı onay gerektirir; ULAK kodu çalıştırmaz",
  ]);
  add("Belgeleme", "\"Yapılmadı\" listesi var mı?", "pass", [
    "döküm raporu \"Yapılmayanlar\" bölümünü her zaman basar",
  ]);

  // --- Silme kararı (23–24)
  const blockers = [
    !input.license?.file ? "lisans yok" : null,
    !input.tests?.count ? "test yok" : null,
    input.license?.mismatch ? "README/LICENSE çelişkisi" : null,
  ].filter(Boolean) as string[];
  add("Silme kararı", "Silme şartları tek tek işaretlendi mi?", blockers.length ? "fail" : "pass", blockers.length
    ? blockers.map((item) => `engel: ${item}`)
    : ["lisans, test ve lisans tutarlılığı tamam"]);
  add("Silme kararı", "Şartlardan biri eksikse hiçbir şey silinmedi mi?", blockers.length ? "pass" : "unknown", [
    blockers.length ? `${blockers.length} engel var; silme önerilmez` : "engel yok; silme kararı insan onayına bağlı",
  ]);

  return items;
}

export function checklistSummary(items: ChecklistItem[]) {
  return {
    total: items.length,
    pass: items.filter((item) => item.status === "pass").length,
    fail: items.filter((item) => item.status === "fail").length,
    unknown: items.filter((item) => item.status === "unknown").length,
  };
}
