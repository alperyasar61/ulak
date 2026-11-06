#!/usr/bin/env node
// Yerel git kancalarını kurar. Metodoloji kuralı: gizlilik denetimi üç katmanlıdır —
// .gitignore (kural), commit öncesi kanca (uygulama) ve CI (uzak doğrulama).
// Bu betik ikinci katmanı etkinleştirir.
//
// Kullanım: node scripts/install-hooks.mjs
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hooksDir = path.join(repoRoot, ".githooks");

if (!existsSync(path.join(repoRoot, ".git"))) {
  console.error("HATA: bu dizin bir git deposu değil.");
  process.exit(1);
}

mkdirSync(hooksDir, { recursive: true });

const preCommit = `#!/bin/sh
# Otomatik üretildi: node scripts/install-hooks.mjs
# Veri sızıntısı denetimi başarısızsa commit engellenir.
node scripts/audit-data-hygiene.mjs || {
  echo ""
  echo "Commit engellendi: veri hijyeni denetimi başarısız."
  echo "Bilerek geçmek için: git commit --no-verify"
  exit 1
}
`;

const preCommitPath = path.join(hooksDir, "pre-commit");
writeFileSync(preCommitPath, preCommit, "utf8");
try {
  chmodSync(preCommitPath, 0o755);
} catch {
  // Windows'ta chmod etkisiz olabilir; git yine de çalıştırır.
}

execFileSync("git", ["config", "core.hooksPath", ".githooks"], { cwd: repoRoot, stdio: "inherit" });
console.log("Git kancaları kuruldu: core.hooksPath = .githooks (pre-commit -> audit:data)");
