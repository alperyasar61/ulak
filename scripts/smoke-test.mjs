// ULAK API duman testi: her uç noktayı gerçek istekle dener.
// Kullanım: node scripts/smoke-test.mjs [baseUrl]
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const base = process.argv[2] ?? "http://127.0.0.1:3001";
const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

async function call(name, url, init = {}, expect = [200]) {
  try {
    const response = await fetch(base + url, init);
    const text = await response.text();
    const ok = expect.includes(response.status);
    record(name, ok, `HTTP ${response.status}${ok ? "" : " " + text.slice(0, 200)}`);
    return { response, text, ok };
  } catch (error) {
    record(name, false, error.message);
    return { response: null, text: "", ok: false };
  }
}

// --- oturum ---
const sessionRes = await fetch(base + "/api/session");
const { token } = await sessionRes.json();
const H = { "x-ulak-session": token };
record("GET /api/session", /^[a-f0-9]{64}$/i.test(token), token.slice(0, 8) + "…");

await call("GET /api/health", "/api/health", { headers: H });
await call("GET /api/models", "/api/models", { headers: H }, [200, 503]);

// --- EVREN anahtar kasası: anahtar yalnızca bellekte, yanıtta asla dönmez ---
const parse = (result) => { try { return JSON.parse(result.text); } catch { return {}; } };
const evrenStatus = parse(await call("GET /api/evren/status", "/api/evren/status", { headers: H }));
record("GET /api/evren/status anahtar sızdırmıyor", !("apiKey" in evrenStatus) && !("key" in evrenStatus), JSON.stringify(evrenStatus));
await call("PUT /api/evren/key (biçimsiz anahtar, 400 beklenir)", "/api/evren/key", { method: "PUT", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify({ apiKey: "kisa" }) }, [400]);
// Kullanıcının gerçek anahtarı kasada kayıtlıysa yıkıcı adımlar atlanır: bu test
// DELETE /api/evren/key çağırdığı için gerçek anahtarı silerdi.
if (evrenStatus.configured) {
  record("EVREN kasası dolu — yıkıcı anahtar testleri atlandı", true, `source=${evrenStatus.source}`);
  await call("POST /api/evren/test (kayıtlı anahtar doğrulanır)", "/api/evren/test", { method: "POST", headers: H }, [200, 400, 502]);
} else {
  // Doğrulama artık EVREN'e gerçek istek atıyor: uydurma anahtar 400/502 ile reddedilmeli ve saklanmamalı.
  const rejected = await call("PUT /api/evren/key (doğrulanamayan anahtar reddedilir)", "/api/evren/key", { method: "PUT", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify({ apiKey: "smoke-test-key-0123456789" }) }, [400, 502]);
  record("PUT /api/evren/key anahtarı yankılamıyor", !rejected.text.includes("smoke-test-key"), rejected.text.slice(0, 120));
  const afterReject = parse(await call("GET /api/evren/status", "/api/evren/status", { headers: H }));
  record("reddedilen anahtar belleğe yazılmıyor", afterReject.configured === false, JSON.stringify(afterReject));
  await call("POST /api/evren/test (anahtar yokken 400 beklenir)", "/api/evren/test", { method: "POST", headers: H }, [400]);
  const cleared = parse(await call("DELETE /api/evren/key", "/api/evren/key", { method: "DELETE", headers: H }));
  record("DELETE /api/evren/key anahtarı siliyor", cleared.configured === false, JSON.stringify(cleared));
}
await call("GET /api/projects (boş)", "/api/projects", { headers: H });

// --- arşiv hazırla ---
const work = mkdtempSync(path.join(tmpdir(), "ulak-smoke-"));
const src = path.join(work, "src");
mkdirSync(src, { recursive: true });
writeFileSync(path.join(work, "README.md"), "# smoke\n");
writeFileSync(path.join(work, "package.json"), '{"name":"smoke","version":"1.0.0","dependencies":{"express":"4.19.2"}}');
writeFileSync(path.join(work, "pnpm-lock.yaml"), "lockfileVersion: 9\n");
writeFileSync(path.join(work, "SECURITY.md"), "# security\n");
writeFileSync(path.join(work, "LICENSE"), "MIT\n");
writeFileSync(path.join(src, "index.ts"), "export const x = 1;\n");
writeFileSync(path.join(src, "sample.exe"), readFileSync("C:\\Windows\\System32\\notepad.exe"));
const zip = path.join(work, "smoke.zip");
execFileSync("tar", ["-a", "-c", "-f", zip, "-C", work, "README.md", "package.json", "pnpm-lock.yaml", "SECURITY.md", "LICENSE", "src"]);

// --- proje oluştur ---
const form = new FormData();
form.set("archive", new Blob([readFileSync(zip)]), "smoke.zip");
form.set("projectName", "Smoke Test");
const created = await call("POST /api/projects (arşiv)", "/api/projects", { method: "POST", headers: H, body: form }, [200, 201]);
let projectId = "";
try { projectId = JSON.parse(created.text).project.id; } catch { /* ignore */ }

if (projectId) {
  const P = `/api/projects/${projectId}`;
  try {
  await call("GET /api/projects/:id", P, { headers: H });
  await call("GET /api/projects/:id/finding-states", `${P}/finding-states`, { headers: H });
  await call("POST /api/projects/:id/proactive-audit", `${P}/proactive-audit`, { method: "POST", headers: H });
  await call("GET /api/projects/:id/export/json", `${P}/export/json`, { headers: H });
  await call("GET /api/projects/:id/export/markdown", `${P}/export/markdown`, { headers: H });
  await call("GET /api/projects/:id/export/sarif", `${P}/export/sarif`, { headers: H });
  await call("GET /api/projects/:id/export/bogus (400 beklenir)", `${P}/export/bogus`, { headers: H }, [400]);
  await call("GET /api/projects/:id/ci-template", `${P}/ci-template`, { headers: H });
  await call("GET /api/projects/:id/dossier", `${P}/dossier`, { headers: H });
  await call("PUT /api/projects/:id/findings/:fid/state", `${P}/findings/license-not-found/state`, {
    method: "PUT", headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "triage", note: "smoke" }),
  });
  await call("PUT .../state geçersiz durum (400 beklenir)", `${P}/findings/x/state`, {
    method: "PUT", headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "bogus", note: "" }),
  }, [400]);
  await call("GET /api/projects/:id/messages", `${P}/messages`, { headers: H });
  await call("POST /api/projects/:id/deep-analyze", `${P}/deep-analyze`, {
    method: "POST", headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify({ filePath: "src/sample.exe" }),
  });
  await call("POST /api/projects/:id/ai (onaysız, 403 beklenir)", `${P}/ai`, {
    method: "POST", headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify({ consent: false, model: "x" }),
  }, [403]);
  await call("POST /api/projects/:id/research (onaysız, 403 beklenir)", `${P}/research`, {
    method: "POST", headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify({ consent: false, queries: ["x"] }),
  }, [403]);
  await call("POST /api/projects/:id/chat (onaysız, 403 beklenir)", `${P}/chat`, {
    method: "POST", headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify({ consent: false, question: "x", model: "x" }),
  }, [403]);
  } finally {
    // Test yarıda çökse bile geçici proje kayıtlı kalmasın.
    await call("DELETE /api/projects/:id", P, { method: "DELETE", headers: H });
    await call("GET /api/projects/:id (silindikten sonra 404)", P, { headers: H }, [404]);
  }
}

// --- oturumsuz erişim ---
await call("GET /api/projects (oturumsuz, 401 beklenir)", "/api/projects", {}, [401]);
await call("GET /api/projects/:id (oturumsuz, 401 beklenir)", "/api/projects/00000000-0000-0000-0000-000000000000", {}, [401]);

rmSync(work, { recursive: true, force: true });

const failed = results.filter((item) => !item.ok);
console.log(`\n${results.length - failed.length}/${results.length} geçti`);
if (failed.length) { console.log("BAŞARISIZ:"); for (const item of failed) console.log(" - " + item.name + " :: " + item.detail); process.exitCode = 1; }
