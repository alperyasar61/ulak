#!/usr/bin/env node
// Veri sızıntısı denetimi — üç katman:
//   1. .gitignore gerçekten engelliyor mu? (`git check-ignore`)
//   2. Depoda izlenen hassas dosya var mı? (`git ls-files`)
//   3. Geçmişe sızmış hassas yol var mı? (`git log --all --name-only`)
//
// Kullanım: node scripts/audit-data-hygiene.mjs
// Çıkış kodu 1 ise bulgu var; CI'da bu adım kırmızı olur.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Depoda asla bulunmaması gereken yollar (glob benzeri, git pathspec değil). */
const SENSITIVE = [
  { label: "ULAK veri klasörü", test: (p) => p === ".ulak-data" || p.startsWith(".ulak-data/") },
  { label: "Ortam dosyası", test: (p) => p === ".env" || (p.startsWith(".env.") && p !== ".env.example") },
  { label: "SQLite veritabanı", test: (p) => /\.(db|sqlite|sqlite3)$/i.test(p) },
  { label: "Makine sırrı", test: (p) => p.endsWith(".machine-secret") },
  { label: "Özel anahtar", test: (p) => /(^|\/)(id_rsa|id_ed25519|id_ecdsa)$/.test(p) || /\.(pem|pfx|p12)$/i.test(p) },
  { label: "Geçici test dosyası", test: (p) => /(^|\/)tmp-[^/]*$/.test(p) },
];

function git(args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function classify(filePath) {
  return SENSITIVE.filter((rule) => rule.test(filePath)).map((rule) => rule.label);
}

const problems = [];

if (!existsSync(path.join(repoRoot, ".git"))) {
  console.error("HATA: bu dizin bir git deposu değil; denetim yapılamaz.");
  process.exit(1);
}

// --- 1. .gitignore kuralları gerçekten devrede mi? ---
const ignoreProbes = [".ulak-data/probe.json", ".env", ".env.local", "apps/backend/tmp-probe.mjs"];
for (const probe of ignoreProbes) {
  let ignored = false;
  try {
    git(["check-ignore", "-q", "--no-index", probe]);
    ignored = true;
  } catch {
    ignored = false;
  }
  if (!ignored) problems.push(`.gitignore bu yolu engellemiyor: ${probe}`);
}

// --- 2. Şu an izlenen dosyalar ---
const tracked = git(["ls-files", "-z"]).split("\0").filter(Boolean);
for (const file of tracked) {
  const labels = classify(file);
  if (labels.length) problems.push(`izlenen hassas dosya: ${file} (${labels.join(", ")})`);
}

// --- 3. Tüm geçmişteki yollar ---
const history = new Set(
  git(["log", "--all", "--name-only", "--pretty=format:"])
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean),
);
for (const file of history) {
  const labels = classify(file);
  if (labels.length) problems.push(`geçmişte hassas yol: ${file} (${labels.join(", ")})`);
}

// --- 4. .gitignore'ın kendisi beklenen kuralları içeriyor mu? ---
const ignoreFile = path.join(repoRoot, ".gitignore");
const ignoreText = existsSync(ignoreFile) ? readFileSync(ignoreFile, "utf8") : "";
for (const required of [".ulak-data/", ".env", "tmp-*"]) {
  if (!ignoreText.split(/\r?\n/).some((line) => line.trim() === required)) {
    problems.push(`.gitignore içinde beklenen kural yok: ${required}`);
  }
}

console.log(`İzlenen dosya: ${tracked.length}`);
console.log(`Geçmişte görülen yol: ${history.size}`);

if (problems.length) {
  console.log("\nBULGULAR:");
  for (const problem of problems) console.log(`  - ${problem}`);
  console.log(
    "\nÇözüm: dosyayı `git rm --cached <yol>` ile takipten çıkarın, .gitignore'a ekleyin.\n" +
      "Geçmişe sızdıysa sır döndürülmeli (rotate) ve gerekirse geçmiş temizlenmelidir.",
  );
  process.exit(1);
}

console.log("\nOK: veri klasörü, ortam dosyaları ve geçici dosyalar depo dışında.");
