#!/usr/bin/env node
// Açılış duman testi — metodolojinin 3, 4 ve 6. doğrulama katmanları.
// Derlenmiş sunucuyu gerçekten başlatır, gerçek HTTP istekleri atar ve kapatır.
// "Derlendi" ile "çalışıyor" arasındaki farkı yakalar.
//
// Kullanım: node scripts/smoke-startup.mjs
// Ön koşul: `pnpm build` çalıştırılmış olmalı (apps/backend/dist-server + apps/frontend/dist).
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = path.join(repoRoot, "apps/backend/dist-server/src/index.js");
const webDist = path.join(repoRoot, "apps/frontend/dist");

if (!existsSync(entry)) {
  console.error(`HATA: derlenmiş sunucu yok: ${path.relative(repoRoot, entry)}\nÖnce "pnpm build" çalıştırın.`);
  process.exit(1);
}

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

/** İşletim sisteminden boş bir port ister; sabit port çakışması tuzağını önler. */
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

const port = await freePort();
const dataDir = mkdtempSync(path.join(tmpdir(), "ulak-smoke-"));
const base = `http://127.0.0.1:${port}`;

const child = spawn(process.execPath, [entry], {
  cwd: repoRoot,
  env: { ...process.env, PORT: String(port), ULAK_HOST: "127.0.0.1", ULAK_DATA_DIR: dataDir, NODE_ENV: "production" },
  stdio: ["ignore", "pipe", "pipe"],
});

let serverLog = "";
child.stdout.on("data", (chunk) => { serverLog += chunk; });
child.stderr.on("data", (chunk) => { serverLog += chunk; });

let exited = false;
child.on("exit", (code) => { exited = true; serverLog += `\n[süreç çıkış kodu: ${code}]`; });

async function waitForHealth(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (exited) return null;
    try {
      const response = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return await response.json();
    } catch {
      // Sunucu henüz dinlemiyor; bekle ve tekrar dene.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return null;
}

try {
  const health = await waitForHealth();
  record("sunucu açılışı + GET /api/health", health?.ok === true, health ? JSON.stringify(health) : serverLog.slice(-400));

  if (health?.ok) {
    const sessionRes = await fetch(`${base}/api/session`);
    const session = await sessionRes.json().catch(() => ({}));
    record("GET /api/session 64 haneli token üretiyor", /^[a-f0-9]{64}$/i.test(session.token ?? ""), `HTTP ${sessionRes.status}`);

    const projectsRes = await fetch(`${base}/api/projects`, { headers: { "x-ulak-session": session.token ?? "" } });
    record("GET /api/projects 200 dönüyor", projectsRes.status === 200, `HTTP ${projectsRes.status}`);

    // 6. katman: kalıcılık — aynı veri klasöründe ikinci istek de tutarlı olmalı.
    const again = await fetch(`${base}/api/projects`, { headers: { "x-ulak-session": session.token ?? "" } });
    record("GET /api/projects tekrar çağrıda tutarlı", again.status === 200, `HTTP ${again.status}`);

    if (existsSync(webDist)) {
      const indexRes = await fetch(`${base}/`);
      const html = await indexRes.text();
      record("GET / arayüzü sunuyor", indexRes.status === 200 && /<div id="root"/.test(html), `HTTP ${indexRes.status}, ${html.length} bayt`);

      const assetPath = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
      if (assetPath) {
        const assetRes = await fetch(base + assetPath);
        record(`statik varlık erişilebilir (${assetPath})`, assetRes.status === 200, `HTTP ${assetRes.status}`);
      } else {
        record("index.html içinde JS varlık referansı var", false, "src=\"/assets/*.js\" bulunamadı");
      }
    } else {
      record("arayüz derlemesi mevcut", false, "apps/frontend/dist yok — önce pnpm build");
    }
  }
} finally {
  if (!exited) child.kill("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 300));
  if (!exited) child.kill("SIGKILL");
  rmSync(dataDir, { recursive: true, force: true });
}

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} kontrol geçti.`);
if (failed.length) {
  console.log("\nSunucu günlüğü (son 40 satır):");
  console.log(serverLog.split(/\r?\n/).slice(-40).join("\n"));
  process.exit(1);
}
