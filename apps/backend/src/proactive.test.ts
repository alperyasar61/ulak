import { describe, expect, it } from "vitest";
import { buildProactiveAudit, diffAudits, type ProactiveAudit } from "./proactive.js";

function auditFor(archiveNames: string[], overrides: Partial<Parameters<typeof buildProactiveAudit>[0]> = {}) {
  return buildProactiveAudit({
    archiveNames,
    textFiles: [],
    dependencies: [],
    secretFileCount: 0,
    hasDynamicExecution: false,
    ...overrides,
  });
}

function check(audit: ProactiveAudit, id: string) {
  const found = audit.checks.find((item) => item.id === id);
  if (!found) throw new Error(`kontrol bulunamadı: ${id}`);
  return found;
}

describe("buildProactiveAudit", () => {
  it("her kontrolde kanıt, gerekçe ve sonraki adım üretir", () => {
    const audit = auditFor(["README.md", "package.json"]);
    expect(audit.checks.length).toBeGreaterThan(5);
    for (const item of audit.checks) {
      expect(item.title.length).toBeGreaterThan(0);
      expect(item.why.length).toBeGreaterThan(0);
      expect(item.nextStep.length).toBeGreaterThan(0);
      expect(item.basis.length).toBeGreaterThan(0);
      expect(Array.isArray(item.evidence)).toBe(true);
    }
  });

  it("skoru 0-100 aralığında ve notu A-D aralığında tutar", () => {
    const audit = auditFor(["src/index.ts"]);
    expect(audit.score).toBeGreaterThanOrEqual(0);
    expect(audit.score).toBeLessThanOrEqual(100);
    expect(["A", "B", "C", "D"]).toContain(audit.grade);
  });

  it("kilit dosyası ve manifest birlikteyse bağımlılık kontrolünü geçirir", () => {
    const audit = auditFor(["package.json", "pnpm-lock.yaml"]);
    expect(check(audit, "dependency-locking").status).toBe("pass");
  });

  it("manifest var ama kilit yoksa risk verir", () => {
    const audit = auditFor(["package.json"]);
    expect(check(audit, "dependency-locking").status).toBe("watch");
  });

  it("secretFileCount sıfırdan büyükse sır kontrolünü risk yapar", () => {
    const audit = auditFor(["README.md"], { secretFileCount: 1 });
    const secrets = check(audit, "secrets");
    expect(secrets.status).toBe("risk");
    expect(secrets.severity).toBe("high");
    expect(secrets.evidence.join(" ")).not.toContain("API_KEY=");
  });

  it("dinamik çalıştırma sinyalini orta öncelikle işaretler", () => {
    const audit = auditFor(["README.md"], { hasDynamicExecution: true });
    expect(check(audit, "runtime-risk").status).toBe("risk");
    expect(check(audit, "runtime-risk").severity).toBe("medium");
  });

  it("artifact-integrity: ikili artefakt risklidir", () => {
    const audit = auditFor(["README.md", ".github/workflows/ci.yml", "vendor/native.dll"]);
    const item = check(audit, "artifact-integrity");
    expect(item.status).toBe("risk");
    expect(item.severity).toBe("high");
    expect(item.evidence).toContain("vendor/native.dll");
  });

  it("artifact-integrity: ikili yoksa ve CI varsa geçer", () => {
    const audit = auditFor(["README.md", ".github/workflows/ci.yml"]);
    const item = check(audit, "artifact-integrity");
    expect(item.status).toBe("pass");
    expect(item.severity).toBe("low");
  });

  it("artifact-integrity: ne ikili ne CI varsa izlemeye alır", () => {
    const audit = auditFor(["README.md", "src/index.ts"]);
    const item = check(audit, "artifact-integrity");
    expect(item.status).toBe("watch");
    expect(item.severity).toBe("low");
  });

  it("container sertleştirmesi: root kullanıcı ve latest etiketi risklidir", () => {
    const audit = auditFor(["Dockerfile"], {
      textFiles: [{ path: "Dockerfile", content: "FROM node:latest\nUSER root\n" }],
    });
    const item = check(audit, "container-hardening");
    expect(item.status).toBe("risk");
    expect(item.severity).toBe("high");
  });

  it("CI action kayan etiketi orta öncelikli sinyal üretir", () => {
    const audit = auditFor([".github/workflows/ci.yml"], {
      textFiles: [{ path: ".github/workflows/ci.yml", content: "steps:\n  - uses: actions/checkout@main\n" }],
    });
    const item = check(audit, "ci-pinning");
    expect(item.status).toBe("risk");
    expect(item.severity).toBe("medium");
  });

  it("sağlıklı projede daha yüksek skor üretir", () => {
    const weak = auditFor(["src/index.ts"], { hasDynamicExecution: true });
    const strong = auditFor(
      [
        "README.md",
        "LICENSE",
        "SECURITY.md",
        "CODEOWNERS",
        "package.json",
        "pnpm-lock.yaml",
        "tests/app.test.ts",
        ".github/workflows/ci.yml",
        ".github/workflows/ci.yml",
      ],
      {
        textFiles: [
          { path: "package.json", content: '{"dependencies":{"express":"4.19.2"}}' },
          { path: ".github/workflows/ci.yml", content: "steps:\n  - uses: actions/checkout@v4\n" },
        ],
        dependencies: [{ name: "express", version: "4.19.2", ecosystem: "npm" }],
      },
    );
    expect(strong.score).toBeGreaterThan(weak.score);
  });
});

describe("diffAudits", () => {
  const previous: ProactiveAudit = {
    score: 80,
    grade: "B",
    summary: "önceki",
    checkedAt: new Date().toISOString(),
    externalResearchPending: false,
    checks: [
      { id: "a", category: "c", title: "A kontrolü", status: "pass", severity: "low", summary: "", why: "", evidence: [], nextStep: "", basis: "" },
      { id: "b", category: "c", title: "B kontrolü", status: "risk", severity: "high", summary: "", why: "", evidence: [], nextStep: "", basis: "" },
    ],
  };

  const current: ProactiveAudit = {
    ...previous,
    score: 70,
    grade: "B",
    checks: [
      { ...previous.checks[0], status: "watch" },
      { ...previous.checks[1], status: "pass" },
      { id: "c", category: "c", title: "C kontrolü", status: "watch", severity: "low", summary: "", why: "", evidence: [], nextStep: "", basis: "" },
    ],
  };

  it("önceki audit yoksa fark üretmez", () => {
    expect(diffAudits(null, current)).toBeNull();
  });

  it("skor değişimini ve yönünü hesaplar", () => {
    const diff = diffAudits(previous, current);
    expect(diff?.scoreDelta).toBe(-10);
    expect(diff?.previousScore).toBe(80);
    expect(diff?.currentScore).toBe(70);
  });

  it("regresyon ve iyileşmeyi ayrı listeler", () => {
    const diff = diffAudits(previous, current);
    expect(diff?.regressed).toEqual(["A kontrolü: pass → watch"]);
    expect(diff?.improved).toEqual(["B kontrolü: risk → pass"]);
  });

  it("yeni kontrolleri ayrı raporlar", () => {
    const diff = diffAudits(previous, current);
    expect(diff?.newChecks).toEqual(["C kontrolü"]);
  });
});
