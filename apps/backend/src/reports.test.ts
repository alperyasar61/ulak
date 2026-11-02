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
});
