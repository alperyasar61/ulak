#!/usr/bin/env node
// Bağımlılıkların `engines.node` aralıklarıyla projenin kendi `engines.node`
// aralığının kesişimini doğrular. "Bende çalışıyor" tuzağını yakalar: projenin
// izin verdiği bir Node major'ını bir bağımlılık desteklemiyorsa hata verir.
//
// Kullanım:
//   node scripts/check-engines.mjs            # doğrula
//   node scripts/check-engines.mjs --matrix   # CI matrisi için JSON major listesi
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import semver from "semver";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const matrixOnly = process.argv.includes("--matrix");

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function workspaceManifests() {
  const manifests = [path.join(repoRoot, "package.json")];
  const appsDir = path.join(repoRoot, "apps");
  if (existsSync(appsDir)) {
    for (const entry of readdirSync(appsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifest = path.join(appsDir, entry.name, "package.json");
      if (existsSync(manifest)) manifests.push(manifest);
    }
  }
  return manifests;
}

/** Kurulu paketlerin `engines.node` aralıklarını toplar (hoisted + yerel). */
function installedEngines() {
  const roots = [path.join(repoRoot, "node_modules")];
  const appsDir = path.join(repoRoot, "apps");
  if (existsSync(appsDir)) {
    for (const entry of readdirSync(appsDir, { withFileTypes: true })) {
      if (entry.isDirectory()) roots.push(path.join(appsDir, entry.name, "node_modules"));
    }
  }

  const found = new Map();
  const visit = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.name.startsWith("@")) {
        visit(full);
        continue;
      }
      const manifest = path.join(full, "package.json");
      if (!existsSync(manifest)) continue;
      let pkg;
      try {
        pkg = readJson(manifest);
      } catch {
        continue;
      }
      const range = pkg.engines?.node;
      if (typeof range !== "string" || !range.trim()) continue;
      if (!semver.validRange(range)) return;
      const name = pkg.name ?? entry.name;
      if (!found.has(name)) found.set(name, range);
    }
  };
  for (const root of roots) visit(root);
  return found;
}

const rootManifest = readJson(path.join(repoRoot, "package.json"));
const declared = rootManifest.engines?.node;
if (typeof declared !== "string" || !semver.validRange(declared)) {
  console.error(`HATA: kök package.json içinde geçerli bir engines.node yok (${declared ?? "tanımsız"}).`);
  process.exit(1);
}

const declaredMin = semver.minVersion(declared);
const deps = installedEngines();

// Aday sürümler: alt sınırın major'ından başlayarak 5 major'lık pencere.
// Her major için temsilci sürüm kullanılır (alt sınırın kendisi + X.0.0).
const WINDOW = 5;
const candidates = [];
for (let major = declaredMin.major; major < declaredMin.major + WINDOW; major += 1) {
  candidates.push(major === declaredMin.major ? declaredMin.version : `${major}.0.0`);
}

const supported = [];
const rejected = [];
for (const version of candidates) {
  if (!semver.satisfies(version, declared)) continue;
  const blockers = [...deps].filter(([, range]) => !semver.satisfies(version, range));
  if (blockers.length) rejected.push({ version, blockers });
  else supported.push(version);
}

// CI matrisi yalnızca çift (LTS) major'ları içerir: tek major'lar yayımlandıktan
// kısa süre sonra EOL olur ve üretimde kullanılmaz.
const majors = supported.map((version) => semver.major(version)).filter((major) => major % 2 === 0);

if (matrixOnly) {
  process.stdout.write(JSON.stringify(majors));
  process.exit(0);
}

console.log(`Proje engines.node : ${declared}`);
console.log(`Desteklenen major  : ${majors.length ? majors.join(", ") : "yok"}`);
console.log(`Taranan paket      : ${deps.size}`);

if (rejected.length) {
  console.log("\nProjenin izin verdiği ama bağımlılıkların reddettiği sürümler:");
  for (const { version, blockers } of rejected) {
    const detail = blockers.map(([name, range]) => `${name} (${range})`).join(", ");
    console.log(`  - ${version}: ${detail}`);
  }
  console.log(
    "\nÇözüm: engines.node aralığını yalnızca desteklenen major'ları kapsayacak biçimde daraltın,\n" +
      "ya da aykırı bağımlılığı güncelleyin. CI matrisi bu listeden türetilir.",
  );
  process.exit(1);
}

if (!majors.length) {
  console.error("\nHATA: hiçbir Node major'ı tüm bağımlılıklarla uyumlu değil.");
  process.exit(1);
}

console.log("\nOK: engines.node aralığı tüm bağımlılıklarla kesişiyor.");
