import { describe, expect, it } from "vitest";
import { buildBlueprint, mergeAiBlueprint } from "./blueprint.js";
import type { LocalReport } from "./archive.js";

function reportFor(overrides: Partial<LocalReport> = {}): LocalReport {
  return {
    projectPurpose: "",
    summary: "",
    stack: [{ name: "TypeScript", confidence: "high" }],
    fileCount: 10,
    analyzedFiles: 10,
    totalBytes: 1024,
    modules: [],
    entryPoints: ["app/src/main.ts"],
    dependencies: [],
    sbom: [],
    relationships: [],
    apiSurface: [],
    privacySignals: [],
    findings: [],
    secretFileCount: 0,
    analyzedAt: new Date().toISOString(),
    ...overrides,
  };
}

const files = [
  { path: "app/src/main.ts", content: "import express from 'express';\nconst app = express();\napp.get('/', () => {});" },
  { path: "app/src/components/Button.tsx", content: "import { useState } from 'react';\nexport function Button() { const [x] = useState(0); return null; }" },
  { path: "app/src/db/schema.sql", content: "CREATE TABLE users (id INT);" },
  { path: "app/tests/main.test.ts", content: "import { describe } from 'vitest';" },
  { path: "app/package.json", content: "{\"name\":\"app\"}" },
];

describe("buildBlueprint", () => {
  it("ortak kökü atar ve dosyaları katmanlara dağıtır", () => {
    const blueprint = buildBlueprint("app", reportFor(), files);
    const names = blueprint.layers.flatMap((layer) => layer.components.map((component) => component.name));
    expect(names.some((name) => name.startsWith("app/"))).toBe(false);
    expect(blueprint.layers.map((layer) => layer.id)).toContain("presentation");
    expect(blueprint.layers.map((layer) => layer.id)).toContain("quality");
  });

  it("her adımda doğrulama ve risk üretir", () => {
    const blueprint = buildBlueprint("app", reportFor(), files);
    expect(blueprint.steps.length).toBeGreaterThanOrEqual(5);
    for (const step of blueprint.steps) {
      expect(step.verify.length).toBeGreaterThan(0);
      expect(step.risk.length).toBeGreaterThan(0);
      expect(step.outputs.length).toBeGreaterThan(0);
    }
  });

  it("test yoksa test güvencesi alternatifi ekler", () => {
    const blueprint = buildBlueprint("app", reportFor(), files.filter((file) => !file.path.includes("tests/")));
    expect(blueprint.alternatives.map((item) => item.topic)).toContain("Test güvencesi");
  });

  it("AI yanıtı geçersizse yerel planı korur", () => {
    const base = buildBlueprint("app", reportFor(), files);
    const merged = mergeAiBlueprint(base, { steps: "bozuk", alternatives: null }, "test-model");
    expect(merged.steps).toEqual(base.steps);
    expect(merged.alternatives).toEqual(base.alternatives);
    expect(merged.summary).toBe(base.summary);
  });

  it("AI yanıtı geçerliyse adımları devralır", () => {
    const base = buildBlueprint("app", reportFor(), files);
    const merged = mergeAiBlueprint(
      base,
      { summary: "Yeni özet", steps: [{ title: "Adım", detail: "Detay", outputs: ["x"], verify: "v", risk: "r" }] },
      "test-model",
    );
    expect(merged.summary).toBe("Yeni özet");
    expect(merged.steps).toHaveLength(1);
    expect(merged.steps[0].order).toBe(1);
  });
});
