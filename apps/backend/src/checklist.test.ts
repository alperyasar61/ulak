import { describe, expect, it } from "vitest";
import { checklistSummary, evaluateChecklist, type ChecklistInput } from "./checklist.js";
import type { LicenseInfo } from "./license.js";

function license(overrides: Partial<LicenseInfo> = {}): LicenseInfo {
  return {
    detected: "MIT",
    class: "A",
    file: "LICENSE",
    evidence: ["MIT License"],
    readmeClaim: "MIT",
    readmeClaimClass: "A",
    mismatch: false,
    reason: "izin veren lisans",
    ...overrides,
  };
}

function base(overrides: Partial<ChecklistInput> = {}): ChecklistInput {
  return {
    archiveNames: ["p/src/main.ts", "p/LICENSE", "p/README.md", "p/tests/a.test.ts", "p/package.json"],
    fileCount: 5,
    analyzedFiles: 5,
    license: license(),
    symbols: {
      total: 2,
      files: [{ file: "p/src/main.ts", bytes: 100, count: 2, symbols: [] }],
      hotspots: [{ file: "p/src/main.ts", bytes: 100, count: 2, symbols: [] }],
    },
    tests: { count: 1, files: ["p/tests/a.test.ts"], frameworks: ["vitest"], searchedPatterns: ["*.test.ts"] },
    sizeHotspots: [],
    wrapper: { root: "p", doubleNested: false, depth: 1 },
    manifestNotes: [],
    absenceEvidence: [],
    dependencies: [{ name: "left-pad", version: "1.3.0" }],
    manifestFiles: ["p/package.json"],
    entryPoints: ["p/src/main.ts"],
    findings: [{ id: "x", severity: "low" }],
    ...overrides,
  };
}

describe("evaluateChecklist", () => {
  it("24 madde üretir ve numaralar 1..24 ardışıktır", () => {
    const items = evaluateChecklist(base());
    expect(items).toHaveLength(24);
    expect(items.map((item) => item.id)).toEqual(Array.from({ length: 24 }, (_, index) => index + 1));
  });

  it("altı grubu da kapsar", () => {
    const groups = [...new Set(evaluateChecklist(base()).map((item) => item.group))];
    expect(groups).toEqual(["Hazırlık", "Envanter", "Kaynak okuma", "Kanıt", "Belgeleme", "Silme kararı"]);
  });

  it("tam veriyle eksik madde bırakmaz", () => {
    const summary = checklistSummary(evaluateChecklist(base()));
    expect(summary.fail).toBe(0);
    expect(summary.pass + summary.unknown).toBe(24);
  });

  it("süreç maddelerini unknown olarak işaretler, pass saymaz", () => {
    const items = evaluateChecklist(base());
    const processItems = items.filter((item) => [1, 2, 3, 10, 13, 14, 19, 21].includes(item.id));
    expect(processItems.every((item) => item.status === "unknown")).toBe(true);
  });

  it("lisans dosyası yoksa 6. ve 9. maddeyi fail yapar", () => {
    const items = evaluateChecklist(base({ license: license({ file: null, detected: null, class: "E" }) }));
    expect(items.find((item) => item.id === 6)!.status).toBe("fail");
    expect(items.find((item) => item.id === 9)!.status).toBe("fail");
  });

  it("sembol çıkmadıysa 12. maddeyi fail yapar", () => {
    const items = evaluateChecklist(base({ symbols: { total: 0, files: [], hotspots: [] } }));
    expect(items.find((item) => item.id === 12)!.status).toBe("fail");
  });

  it("test ölçümü yoksa 15. maddeyi fail yapar", () => {
    const input = base();
    delete input.tests;
    const items = evaluateChecklist(input);
    expect(items.find((item) => item.id === 15)!.status).toBe("fail");
  });

  it("manifest dosyası varsa bağımlılık boş olsa da 8. maddeyi geçirir", () => {
    const items = evaluateChecklist(base({ dependencies: [], manifestFiles: ["p/package.json"] }));
    expect(items.find((item) => item.id === 8)!.status).toBe("pass");
  });

  it("manifest de yoksa 8. maddeyi fail yapar", () => {
    const items = evaluateChecklist(base({ dependencies: [], manifestFiles: [] }));
    expect(items.find((item) => item.id === 8)!.status).toBe("fail");
  });

  it("kaynak dosya yoksa 7. maddeyi fail yapar", () => {
    const items = evaluateChecklist(base({ archiveNames: ["p/data.csv"] }));
    expect(items.find((item) => item.id === 7)!.status).toBe("fail");
  });

  it("yokluk kanıtı yoksa 17. maddeyi geçmiş sayar (gerekmedi)", () => {
    const items = evaluateChecklist(base({ absenceEvidence: [] }));
    expect(items.find((item) => item.id === 17)!.status).toBe("pass");
  });

  it("yokluk kanıtlarını kanıt metnine yazar", () => {
    const items = evaluateChecklist(base({
      absenceEvidence: [{ id: "no-tests", claim: "test yok", searches: ["*.test.ts", "tests/"] }],
    }));
    const item = items.find((entry) => entry.id === 17)!;
    expect(item.evidence[0]).toContain("2 arama");
  });

  it("lisans çelişkisi silme kararını engeller", () => {
    const items = evaluateChecklist(base({ license: license({ mismatch: true, readmeClaim: "MIT", detected: "GPL", class: "B" }) }));
    expect(items.find((item) => item.id === 23)!.status).toBe("fail");
    expect(items.find((item) => item.id === 23)!.evidence.join(" ")).toContain("README/LICENSE");
    expect(items.find((item) => item.id === 24)!.status).toBe("pass");
  });

  it("test yoksa silme kararını engeller", () => {
    const items = evaluateChecklist(base({ tests: { count: 0, files: [], frameworks: [], searchedPatterns: ["*.test.ts"] } }));
    expect(items.find((item) => item.id === 23)!.status).toBe("fail");
    expect(items.find((item) => item.id === 23)!.evidence.join(" ")).toContain("test yok");
  });

  it("engel yoksa 24. maddeyi unknown bırakır (insan onayı)", () => {
    const items = evaluateChecklist(base());
    expect(items.find((item) => item.id === 24)!.status).toBe("unknown");
  });

  it("özet sayıları toplamla tutarlıdır", () => {
    const items = evaluateChecklist(base({ license: license({ file: null, detected: null, class: "E" }) }));
    const summary = checklistSummary(items);
    expect(summary.total).toBe(24);
    expect(summary.pass + summary.fail + summary.unknown).toBe(24);
  });
});
