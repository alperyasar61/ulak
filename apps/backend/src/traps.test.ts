import { describe, expect, it } from "vitest";
import { detectTraps, detectedTraps, TRAP_CATALOG } from "./traps.js";
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

describe("detectTraps", () => {
  it("kataloğun tamamını döndürür (13 tuzak)", () => {
    const hits = detectTraps({ archiveNames: [], files: [] });
    expect(hits).toHaveLength(13);
    expect(hits.map((hit) => hit.id)).toEqual(TRAP_CATALOG.map((trap) => trap.id));
  });

  it("temiz arşivde hiçbir tuzak tespit etmez", () => {
    const hits = detectTraps({
      archiveNames: ["proj/src/main.ts", "proj/LICENSE", "proj/README.md", "proj/tests/a.test.ts"],
      files: [{ path: "proj/src/main.ts", content: "export const a = 1;" }],
      license: license(),
      tests: { count: 1, files: ["proj/tests/a.test.ts"], frameworks: ["vitest"], searchedPatterns: ["*.test.ts"] },
      sizeHotspots: [],
      wrapper: { root: "proj", doubleNested: false, depth: 1 },
      symbolFileCount: 1,
    });
    expect(detectedTraps(hits)).toEqual([]);
  });

  it("çift iç içe ZIP'i tespit eder", () => {
    const hits = detectTraps({
      archiveNames: ["a-main/a-main/x.ts"],
      files: [],
      wrapper: { root: "a-main", doubleNested: true, depth: 2 },
    });
    const hit = hits.find((item) => item.id === 1)!;
    expect(hit.detected).toBe(true);
    expect(hit.evidence[0]).toContain("a-main");
  });

  it("BOM'u verilen listeden tespit eder", () => {
    const hits = detectTraps({ archiveNames: [], files: [], bomFiles: ["p/package.json"] });
    const hit = hits.find((item) => item.id === 3)!;
    expect(hit.detected).toBe(true);
    expect(hit.evidence[0]).toContain("package.json");
  });

  it("BOM listesi verilmezse içerikten de bulur", () => {
    const hits = detectTraps({ archiveNames: [], files: [{ path: "p/a.json", content: "\uFEFF{}" }] });
    expect(hits.find((item) => item.id === 3)!.detected).toBe(true);
  });

  it("README ile LICENSE çelişkisini tespit eder", () => {
    const hits = detectTraps({
      archiveNames: [],
      files: [],
      license: license({ detected: "Business Source License", class: "C", mismatch: true, readmeClaim: "MIT" }),
    });
    const hit = hits.find((item) => item.id === 7)!;
    expect(hit.detected).toBe(true);
    expect(hit.evidence[0]).toContain("MIT");
    expect(hit.evidence[0]).toContain("Business Source License");
  });

  it("kod lisansı izin veren ama ağırlık dosyası varsa #8'i tespit eder", () => {
    const hits = detectTraps({
      archiveNames: ["p/model.safetensors"],
      files: [],
      license: license(),
    });
    expect(hits.find((item) => item.id === 8)!.detected).toBe(true);
  });

  it("ağırlık dosyası yoksa #8'i tespit etmez", () => {
    const hits = detectTraps({ archiveNames: ["p/src/a.ts"], files: [], license: license() });
    expect(hits.find((item) => item.id === 8)!.detected).toBe(false);
  });

  it("kaynak dosya yoksa dil dağılımını boş sayar (#9)", () => {
    const hits = detectTraps({ archiveNames: ["p/notebook.ipynb", "p/data.csv"], files: [] });
    expect(hits.find((item) => item.id === 9)!.detected).toBe(true);
  });

  it("kaynak var ama sembol çıkmadıysa #9'u tespit eder", () => {
    const hits = detectTraps({ archiveNames: ["p/a.ts"], files: [], symbolFileCount: 0 });
    expect(hits.find((item) => item.id === 9)!.detected).toBe(true);
  });

  it("büyük dosya varsa boyut tuzağını tespit eder (#10)", () => {
    const hits = detectTraps({
      archiveNames: [],
      files: [],
      sizeHotspots: [{ path: "p/blob.bin", bytes: 25 * 1024 * 1024 }],
    });
    const hit = hits.find((item) => item.id === 10)!;
    expect(hit.detected).toBe(true);
    expect(hit.evidence[0]).toContain("25.0 MB");
  });

  it("0 test + izin veren lisans kombinasyonunu tespit eder (#11)", () => {
    const hits = detectTraps({
      archiveNames: [],
      files: [],
      license: license(),
      tests: { count: 0, files: [], frameworks: [], searchedPatterns: ["*.test.ts"] },
    });
    expect(hits.find((item) => item.id === 11)!.detected).toBe(true);
  });

  it("test varsa #11'i tespit etmez", () => {
    const hits = detectTraps({
      archiveNames: [],
      files: [],
      license: license(),
      tests: { count: 3, files: ["a.test.ts"], frameworks: ["vitest"], searchedPatterns: ["*.test.ts"] },
    });
    expect(hits.find((item) => item.id === 11)!.detected).toBe(false);
  });

  it("test yalnızca ad deseniyle bulunduysa #13'ü tespit eder", () => {
    const hits = detectTraps({
      archiveNames: [],
      files: [],
      tests: { count: 1, files: ["p/src/a.test.ts"], frameworks: ["vitest"], searchedPatterns: ["*.test.ts"] },
    });
    const hit = hits.find((item) => item.id === 13)!;
    expect(hit.detected).toBe(true);
    expect(hit.evidence[0]).toContain("ad deseniyle");
  });

  it("test klasörü eşleşmesi varsa #13'ü tespit etmez", () => {
    const hits = detectTraps({
      archiveNames: [],
      files: [],
      tests: { count: 1, files: ["p/tests/a.test.ts"], frameworks: ["vitest"], searchedPatterns: ["*.test.ts"] },
    });
    expect(hits.find((item) => item.id === 13)!.detected).toBe(false);
  });

  it("süreç tuzaklarını asla tespit edildi diye işaretlemez", () => {
    const hits = detectTraps({
      archiveNames: ["p/a.ts"],
      files: [{ path: "p/a.ts", content: "\uFEFFx" }],
      license: license({ mismatch: true }),
      sizeHotspots: [{ path: "p/big.bin", bytes: 30 * 1024 * 1024 }],
      wrapper: { root: "p", doubleNested: true, depth: 2 },
    });
    const processTraps = hits.filter((hit) => !hit.detectable);
    expect(processTraps.length).toBeGreaterThan(0);
    expect(processTraps.every((hit) => !hit.detected)).toBe(true);
  });
});
