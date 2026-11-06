#!/usr/bin/env node
// Dış ağ sınırı denetimi — metodolojinin 9. bölümü (5 adım).
//   1. Tüm ağ çağrı noktalarını bul (fetch/undici/axios/http.request + sarmalayıcılar).
//   2. Her mutlak URL hedefini çıkar.
//   3. Hedefi bilinen sınır tablosuyla eşleştir.
//   4. Sınıflandırılmamış hedef varsa bildir.
//   5. Tabloyu yazdır (host / dosya / ne gönderiyor / kapatılabilir mi).
//
// Kullanım:
//   node scripts/audit-network.mjs           # rapor
//   node scripts/audit-network.mjs --strict  # sınıflandırılmamış hedef varsa çıkış 1
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const strict = process.argv.includes("--strict");

const SCAN_ROOTS = ["apps/backend/src", "apps/frontend/src", "scripts"];
const SKIP_DIRS = new Set(["node_modules", "dist", "dist-server", ".git", "modules"]);
const CODE_EXT = /\.(ts|tsx|mts|cts|js|mjs|cjs)$/;
const TEST_FILE = /\.test\.(ts|tsx|mts|cts|js|mjs|cjs)$/;
const SELF = "scripts/audit-network.mjs";

// Ağ çağrısı yapan fonksiyonlar: doğrudan API'ler + projedeki sarmalayıcılar.
const CALL_PATTERN = /\b(fetch|undiciFetch|axios(?:\.\w+)?|https?\.request|https?\.get|jsonRequest)\s*\(/;
const URL_PATTERN = /https?:\/\/[a-zA-Z0-9._~:/?#[\]@!$&'()*+,;=%-]+/g;

// Bilinen dış hedefler. Yeni bir dış hedef eklendiğinde buraya kaydı da eklenmelidir;
// `--strict` bunu zorlar.
const KNOWN_TARGETS = [
  { host: "evren-llmapi.ssyz.org.tr", module: "llm.ts", data: "AI istemi + proje bağlamı", gated: "EVREN_API_URL + açık onay" },
  { host: "api.github.com", module: "research.ts, index.ts", data: "depo adı, arama sorgusu", gated: "açık onay" },
  { host: "api.osv.dev", module: "research.ts", data: "paket adı + sürüm", gated: "açık onay" },
  { host: "osv.dev", module: "research.ts", data: "yalnızca bağlantı üretimi (istek yok)", gated: "—" },
  { host: "api.stackexchange.com", module: "research.ts", data: "arama sorgusu", gated: "açık onay" },
  { host: "registry.npmjs.org", module: "research.ts", data: "paket adı", gated: "açık onay" },
  { host: "pypi.org", module: "research.ts", data: "paket adı", gated: "açık onay" },
  { host: "www.npmjs.com", module: "research.ts", data: "yalnızca bağlantı üretimi (istek yok)", gated: "—" },
  { host: "schema.getpostman.com", module: "api-workspaces.ts", data: "yalnızca şema kimliği (istek yok)", gated: "—" },
  { host: "json.schemastore.org", module: "reports.ts", data: "yalnızca SARIF $schema alanı (istek yok)", gated: "—" },
  { host: "github.com", module: "index.ts, reports.ts", data: "yalnızca bağlantı/atıf (istek yok)", gated: "—" },
  // Arayüzdeki örnek/yer tutucu metinler; gerçek istek hedefi değildir.
  { host: "api.example.com", module: "ApiWorkspacePanel.tsx", data: "yer tutucu örnek metin (istek yok)", gated: "—" },
  { host: "proxy.ornek.com", module: "ApiWorkspacePanel.tsx", data: "yer tutucu örnek metin (istek yok)", gated: "—" },
];

/** Yerel/loopback hedefler dış sınır sayılmaz. */
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "0.0.0.0"]);

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walk(path.join(dir, entry.name));
    } else if (CODE_EXT.test(entry.name)) {
      yield path.join(dir, entry.name);
    }
  }
}

const callSites = [];
const urlSites = [];

for (const root of SCAN_ROOTS) {
  for (const file of walk(path.join(repoRoot, root))) {
    const rel = path.relative(repoRoot, file).split(path.sep).join("/");
    if (rel === SELF || TEST_FILE.test(rel)) continue;
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      if (/^\s*(\/\/|\*)/.test(line)) return;
      if (CALL_PATTERN.test(line)) callSites.push({ file: rel, line: index + 1, text: line.trim().slice(0, 110) });
      for (const url of line.match(URL_PATTERN) ?? []) {
        let host;
        try {
          host = new URL(url).hostname;
        } catch {
          continue;
        }
        // Şablon değişkenli adresler (`https://${host}/...`) statik olarak çözülemez;
        // bunlar kullanıcı girdisine bağlıdır ve ayrı sınıflandırılır.
        if (/[$%{}]/.test(host)) {
          urlSites.push({ file: rel, line: index + 1, host: "(dinamik)", url });
          continue;
        }
        if (LOCAL_HOSTS.has(host)) continue;
        urlSites.push({ file: rel, line: index + 1, host, url });
      }
    });
  }
}

const knownFor = (host) =>
  KNOWN_TARGETS.find((target) => host === target.host || host.endsWith(`.${target.host}`)) ?? null;

// Dinamik host'lar kullanıcı girdisine bağlıdır; sınır tablosunda ayrı satırda raporlanır.
const DYNAMIC = { host: "(dinamik)", module: "kullanıcı girdisi", data: "kullanıcının verdiği adres", gated: "kullanıcı eylemi" };

const byHost = new Map();
for (const site of urlSites) {
  if (!byHost.has(site.host)) byHost.set(site.host, []);
  byHost.get(site.host).push(site);
}

console.log(`Taranan kök      : ${SCAN_ROOTS.join(", ")}`);
console.log(`Ağ çağrı noktası : ${callSites.length}`);
console.log(`Mutlak URL hedefi: ${byHost.size} benzersiz host\n`);

const unknown = [];
console.log("Hedef tablosu:");
for (const [host, sites] of [...byHost].sort((a, b) => a[0].localeCompare(b[0]))) {
  const known = host === DYNAMIC.host ? DYNAMIC : knownFor(host);
  if (!known) unknown.push({ host, sites });
  const files = [...new Set(sites.map((site) => site.file))].join(", ");
  console.log(`  ${known ? "✓" : "✗"} ${host}`);
  console.log(`      dosya : ${files}`);
  if (known) console.log(`      veri  : ${known.data} | kapı: ${known.gated}`);
  else console.log(`      veri  : BİLİNMİYOR — sınıflandırılmalı`);
}

console.log("\nAğ çağrı noktaları:");
for (const site of callSites) console.log(`  ${site.file}:${site.line}  ${site.text}`);

if (unknown.length) {
  console.log(`\n${unknown.length} host KNOWN_TARGETS tablosunda yok: ${unknown.map((item) => item.host).join(", ")}`);
  console.log("Yeni dış hedef eklediyseniz tabloya veri/kapı bilgisiyle kaydedin.");
  if (strict) process.exit(1);
} else {
  console.log("\nOK: tüm dış hedefler tabloda tanımlı.");
}
