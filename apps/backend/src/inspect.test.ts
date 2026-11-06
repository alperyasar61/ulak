import { describe, expect, it } from "vitest";
import {
  buildAbsenceEvidence,
  countTests,
  detectWrapper,
  extractManifestNotes,
  extractSymbols,
  findSizeHotspots,
  formatBytes,
} from "./inspect.js";

describe("extractSymbols", () => {
  it("extracts exported TypeScript functions, classes and types with line numbers", () => {
    const source = `export function alpha() {}
export class Beta {
  run() {}
}
export interface Gamma { a: string }
const delta = () => {};
export const epsilon = 1;`;
    const inventory = extractSymbols([{ path: "src/a.ts", content: source }], new Map([["src/a.ts", 1024]]));

    const names = inventory.files[0].symbols.map((symbol) => symbol.name);
    expect(names).toEqual(expect.arrayContaining(["alpha", "Beta", "run", "Gamma", "delta", "epsilon"]));
    expect(inventory.files[0].symbols.find((symbol) => symbol.name === "alpha")).toMatchObject({ kind: "function", exported: true, line: 1 });
    expect(inventory.files[0].symbols.find((symbol) => symbol.name === "delta")).toMatchObject({ kind: "function", exported: false });
    expect(inventory.files[0].symbols.find((symbol) => symbol.name === "epsilon")).toMatchObject({ kind: "constant" });
    expect(inventory.total).toBe(6);
  });

  it("extracts Python functions and classes and marks underscore names as internal", () => {
    const source = `def public_fn():
    pass

def _private_fn():
    pass

class Widget:
    def method(self):
        pass`;
    const inventory = extractSymbols([{ path: "app/core.py", content: source }], new Map());

    const byName = new Map(inventory.files[0].symbols.map((symbol) => [symbol.name, symbol]));
    expect(byName.get("public_fn")).toMatchObject({ kind: "function", exported: true, line: 1 });
    expect(byName.get("_private_fn")).toMatchObject({ exported: false });
    expect(byName.get("Widget")).toMatchObject({ kind: "class", line: 7 });
    expect(byName.get("method")).toMatchObject({ kind: "method" });
  });

  it("ignores files in unsupported languages", () => {
    const inventory = extractSymbols([{ path: "README.md", content: "def not_code()" }], new Map());

    expect(inventory.total).toBe(0);
    expect(inventory.files).toEqual([]);
  });

  it("ranks hotspots by byte size, not symbol count", () => {
    const inventory = extractSymbols(
      [
        { path: "small.ts", content: "export function a() {}\nexport function b() {}" },
        { path: "large.ts", content: "export function c() {}" },
      ],
      new Map([
        ["small.ts", 100],
        ["large.ts", 90_000],
      ]),
    );

    expect(inventory.hotspots[0].file).toBe("large.ts");
    expect(inventory.files[0].file).toBe("small.ts");
  });
});

describe("countTests", () => {
  it("counts test files across naming conventions and records the searched patterns", () => {
    const names = [
      "tests/test_api.py",
      "src/util.test.ts",
      "pkg/handler_test.go",
      "src/App.spec.tsx",
      "src/index.ts",
      "README.md",
    ];
    const inventory = countTests(names, [{ path: "package.json", content: '{"devDependencies":{"vitest":"^5"}}' }]);

    expect(inventory.count).toBe(4);
    expect(inventory.frameworks).toContain("vitest");
    expect(inventory.searchedPatterns.length).toBeGreaterThanOrEqual(6);
  });

  it("finds tests under src/test/ even when no file name matches a test pattern", () => {
    const inventory = countTests(["src/test/helpers.ts"], []);

    expect(inventory.count).toBe(1);
  });

  it("returns zero with evidence when nothing matches", () => {
    const inventory = countTests(["src/index.ts", "README.md"], []);

    expect(inventory.count).toBe(0);
    expect(inventory.files).toEqual([]);
    expect(inventory.searchedPatterns.length).toBeGreaterThan(0);
  });
});

describe("findSizeHotspots", () => {
  it("lists only entries above the threshold, largest first", () => {
    const hotspots = findSizeHotspots([
      { path: "small.txt", bytes: 1024 },
      { path: "big.exe", bytes: 180 * 1024 * 1024 },
      { path: "medium.bin", bytes: 25 * 1024 * 1024 },
    ]);

    expect(hotspots.map((entry) => entry.path)).toEqual(["big.exe", "medium.bin"]);
  });

  it("returns an empty list when nothing exceeds the threshold", () => {
    expect(findSizeHotspots([{ path: "a.txt", bytes: 10 }])).toEqual([]);
  });
});

describe("detectWrapper", () => {
  it("detects a single wrapper directory", () => {
    const info = detectWrapper(["repo-main/src/a.ts", "repo-main/README.md"]);

    expect(info).toMatchObject({ root: "repo-main", doubleNested: false, depth: 1 });
  });

  it("detects the double-nested ZIP trap", () => {
    const info = detectWrapper(["repo-main/repo-main/src/a.ts", "repo-main/repo-main/README.md"]);

    expect(info).toMatchObject({ root: "repo-main", doubleNested: true, depth: 2 });
  });

  it("reports no wrapper when multiple roots exist", () => {
    expect(detectWrapper(["a/x.ts", "b/y.ts"])).toMatchObject({ root: null, doubleNested: false });
  });

  it("reports no wrapper for a flat archive", () => {
    expect(detectWrapper(["README.md", "index.ts"])).toMatchObject({ root: null, doubleNested: false });
  });
});

describe("extractManifestNotes", () => {
  it("keeps only comments that explain a decision", () => {
    const notes = extractManifestNotes([
      {
        path: "requirements.txt",
        content: [
          "# zhipuai is deliberately excluded: it pins pyjwt<2 which conflicts with our auth stack",
          "# just a separator",
          "fastapi==0.115.0",
        ].join("\n"),
      },
    ]);

    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ file: "requirements.txt", line: 1 });
    expect(notes[0].text).toContain("zhipuai");
  });

  it("ignores manifests that are not dependency files", () => {
    expect(extractManifestNotes([{ path: "src/app.ts", content: "// because this is a comment about a conflict" }])).toEqual([]);
  });
});

describe("buildAbsenceEvidence", () => {
  it("records the searches behind every negative claim", () => {
    const tests = countTests(["src/index.ts"], []);
    const evidence = buildAbsenceEvidence(["src/index.ts"], tests, null);

    expect(evidence.map((item) => item.id)).toEqual(["missing-readme", "test-structure-not-found", "license-not-found"]);
    for (const item of evidence) expect(item.searches.length).toBeGreaterThan(0);
  });

  it("produces no evidence when everything is present", () => {
    const tests = countTests(["tests/test_a.py"], []);
    expect(buildAbsenceEvidence(["README.md", "tests/test_a.py", "LICENSE"], tests, "LICENSE")).toEqual([]);
  });
});

describe("formatBytes", () => {
  it("formats across units", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(3 * 1024 ** 3)).toBe("3.0 GB");
  });
});
