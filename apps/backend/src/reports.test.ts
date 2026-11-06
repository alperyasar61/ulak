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
});
