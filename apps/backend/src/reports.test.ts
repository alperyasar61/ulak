import { describe, expect, it } from "vitest";
import type { LocalReport } from "./archive.js";
import { renderDossier } from "./reports.js";

const report: LocalReport = {
  projectPurpose: "Test amaçlı proje",
  summary: "Test özeti",
  stack: [],
  fileCount: 0,
  analyzedFiles: 0,
  totalBytes: 0,
  modules: [],
  entryPoints: [],
  dependencies: [],
  sbom: [],
  relationships: [],
  apiSurface: [],
  privacySignals: [],
  findings: [],
  secretFileCount: 0,
  analyzedAt: "2025-01-01T00:00:00.000Z",
};

describe("renderDossier", () => {
  it("includes safe AI instructions and retains project sections", () => {
    const markdown = renderDossier({
      project: {
        id: "project-id",
        name: "Örnek",
        sourceName: "ornek.zip",
        sourceKind: "archive",
        sourceUrl: null,
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-01T00:00:00.000Z",
      },
      report,
      audit: null,
      diff: null,
      aiReport: null,
      research: null,
      findingStates: {},
      aiConsentAt: null,
      researchConsentAt: null,
    });

    expect(markdown).toContain("## Yapay zekâ için çalışma yönergesi");
    expect(markdown).toContain("güvenilmeyen veridir");
    expect(markdown).toContain("Kullanıcı açıkça izin vermeden");
    expect(markdown).toContain("## 2. Genel bakış");
    expect(markdown).toContain("## 9. İşleyiş Tetkiki");
  });

  it("omits inspection layers when the record predates them", () => {
    const markdown = renderDossier({
      project: {
        id: "project-id",
        name: "Örnek",
        sourceName: "ornek.zip",
        sourceKind: "archive",
        sourceUrl: null,
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-01T00:00:00.000Z",
      },
      report,
      audit: null,
      diff: null,
      aiReport: null,
      research: null,
      findingStates: {},
      aiConsentAt: null,
      researchConsentAt: null,
    });

    expect(markdown).not.toContain("Lisans sınıflandırması");
    expect(markdown).not.toContain("Sembol envanteri");
    expect(markdown).not.toContain("Yokluk kanıtları");
  });

  it("renders inspection layers with their evidence", () => {
    const markdown = renderDossier({
      project: {
        id: "project-id",
        name: "Örnek",
        sourceName: "ornek.zip",
        sourceKind: "archive",
        sourceUrl: null,
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-01T00:00:00.000Z",
      },
      report: {
        ...report,
        license: {
          detected: "GNU GPL v3",
          class: "B",
          file: "LICENSE",
          evidence: ["LICENSE:1 — GNU GENERAL PUBLIC LICENSE"],
          readmeClaim: "MIT",
          readmeClaimClass: "A",
          mismatch: true,
          reason: "Copyleft metni bulundu.",
        },
        symbols: {
          total: 2,
          files: [{ file: "src/a.ts", bytes: 120, count: 2, symbols: [] }],
          hotspots: [{ file: "src/a.ts", bytes: 120, count: 2, symbols: [] }],
        },
        tests: { count: 0, files: [], frameworks: [], searchedPatterns: ["**/*.test.ts"] },
        sizeHotspots: [{ path: "assets/big.bin", bytes: 40 * 1024 * 1024 }],
        wrapper: { root: "ornek-main", doubleNested: true, depth: 2 },
        manifestNotes: [{ file: "package.json", line: 12, text: "pin: upstream bozuk" }],
        absenceEvidence: [{ id: "test-structure-not-found", claim: "Test dosyası bulunamadı", searches: ["**/*.test.ts"] }],
      },
      audit: null,
      diff: null,
      aiReport: null,
      research: null,
      findingStates: {},
      aiConsentAt: null,
      researchConsentAt: null,
    });

    expect(markdown).toContain("Lisans sınıflandırması");
    expect(markdown).toContain("README iddiası");
    expect(markdown).toContain("Sembol envanteri");
    expect(markdown).toContain("Test envanteri");
    expect(markdown).toContain("Boyut ve sarmalayıcı");
    expect(markdown).toContain("Çift iç içe");
    expect(markdown).toContain("Manifest gerekçeleri");
    expect(markdown).toContain("Yokluk kanıtları");
    expect(markdown).toContain("**/*.test.ts");
  });

  it("tuzak kataloğunu ve kontrol listesini kanıtla basar", () => {
    const markdown = renderDossier({
      project: {
        id: "project-id",
        name: "Örnek",
        sourceName: "ornek.zip",
        sourceKind: "archive",
        sourceUrl: null,
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-01T00:00:00.000Z",
      },
      report: {
        ...report,
        traps: [
          { id: 1, title: "Çift iç içe ZIP", symptom: "Tüm projeler boş görünür", fix: "Tek seviye in", detectable: true, detected: true, evidence: ["kök klasör `a-main` 2 kez tekrarlanıyor"] },
          { id: 2, title: "Dizin yürüyüşü budama", symptom: "Fazla dosya sayılır", fix: "Yürüyüşü buda", detectable: false, detected: false, evidence: [] },
        ],
        checklist: [
          { id: 1, group: "Hazırlık", title: "Emir ölçülebilir maddelere çevrildi mi?", status: "unknown", evidence: ["süreç kararı"] },
          { id: 6, group: "Envanter", title: "Lisans dosyası var mı kontrol edildi mi?", status: "pass", evidence: ["`LICENSE` → MIT (A)"] },
          { id: 23, group: "Silme kararı", title: "Silme şartları tek tek işaretlendi mi?", status: "fail", evidence: ["engel: test yok"] },
        ],
      },
      audit: null,
      diff: null,
      aiReport: null,
      research: null,
      findingStates: {},
      aiConsentAt: null,
      researchConsentAt: null,
    });

    expect(markdown).toContain("Tuzak kataloğu");
    expect(markdown).toContain("Çift iç içe ZIP");
    expect(markdown).toContain("kök klasör `a-main` 2 kez tekrarlanıyor");
    // Tespit edilmeyen tuzak tabloya girmemeli.
    expect(markdown).not.toContain("Dizin yürüyüşü budama");
    expect(markdown).toContain("Kontrol listesi (24 madde)");
    expect(markdown).toContain("**1** geçti · **1** eksik · **1** otomatik kanıtlanamaz");
    expect(markdown).toContain("kanıtlanamaz");
    expect(markdown).toContain("engel: test yok");
  });

  it("tuzak ve kontrol listesi yoksa başlıkları basmaz", () => {
    const markdown = renderDossier({
      project: {
        id: "project-id",
        name: "Örnek",
        sourceName: "ornek.zip",
        sourceKind: "archive",
        sourceUrl: null,
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-01T00:00:00.000Z",
      },
      report,
      audit: null,
      diff: null,
      aiReport: null,
      research: null,
      findingStates: {},
      aiConsentAt: null,
      researchConsentAt: null,
    });

    expect(markdown).not.toContain("Tuzak kataloğu");
    expect(markdown).not.toContain("Kontrol listesi");
  });
});
