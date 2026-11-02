import { describe, expect, it } from "vitest";
import { analyzePhase2 } from "./phase2.js";

describe("analyzePhase2 security checks", () => {
  it("reports disabled TLS verification without including source values", () => {
    const result = analyzePhase2([
      { path: "client.js", content: 'process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";' },
      { path: "client.py", content: "requests.get(url, verify=False)" },
    ]);

    const finding = result.findings.find((item) => item.id === "insecure-tls-verification");
    expect(finding?.severity).toBe("high");
    expect(finding?.evidence).toEqual([
      "client.js:1 (TLS doğrulama ayarı)",
      "client.py:1 (TLS doğrulama ayarı)",
    ]);
    expect(JSON.stringify(finding)).not.toContain("requests.get");
  });

  it("reports permissive CORS configuration", () => {
    const result = analyzePhase2([{ path: "server.ts", content: 'app.use(cors({ origin: "*" }));' }]);

    expect(result.findings.some((item) => item.id === "permissive-cors")).toBe(true);
  });

  it("does not report explicit secure TLS and CORS settings", () => {
    const result = analyzePhase2([
      { path: "client.js", content: "const agent = new https.Agent({ rejectUnauthorized: true });" },
      { path: "server.ts", content: 'app.use(cors({ origin: "https://example.test" }));' },
    ]);

    expect(result.findings).toEqual([]);
  });
});
