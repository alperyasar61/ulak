#!/usr/bin/env node
// Yıkıcı işlemlerden (duman testi, otomasyon, elle deneme) önce veri klasörünün
// kopyasını alır. Metodoloji kuralı: yedeklemeden silme.
//
// Kullanım:
//   node scripts/backup-data.mjs            # .ulak-data -> .ulak-data-backups/<zaman>
//   node scripts/backup-data.mjs --list     # mevcut yedekleri listele
//   node scripts/backup-data.mjs --prune 5  # en yeni 5 yedeği bırak, gerisini sil
import { cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.resolve(repoRoot, process.env.ULAK_DATA_DIR?.trim() || ".ulak-data");
const backupRoot = path.join(repoRoot, ".ulak-data-backups");

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function listBackups() {
  if (!(await exists(backupRoot))) return [];
  const entries = await readdir(backupRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();
}

const args = process.argv.slice(2);

if (args.includes("--list")) {
  const backups = await listBackups();
  if (!backups.length) console.log("Yedek yok.");
  else for (const name of backups) console.log(path.join(backupRoot, name));
  process.exit(0);
}

const pruneIndex = args.indexOf("--prune");
if (pruneIndex !== -1) {
  const keep = Number(args[pruneIndex + 1]);
  if (!Number.isInteger(keep) || keep < 1) {
    console.error("HATA: --prune için pozitif tam sayı verin (örn. --prune 5).");
    process.exit(1);
  }
  const backups = await listBackups();
  const doomed = backups.slice(keep);
  for (const name of doomed) await rm(path.join(backupRoot, name), { recursive: true, force: true });
  console.log(`${doomed.length} yedek silindi, ${Math.min(keep, backups.length)} yedek kaldı.`);
  process.exit(0);
}

if (!(await exists(dataDir))) {
  console.log(`Veri klasörü yok, yedek gerekmiyor: ${path.relative(repoRoot, dataDir)}`);
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const target = path.join(backupRoot, stamp);
await mkdir(backupRoot, { recursive: true });
await cp(dataDir, target, { recursive: true, errorOnExist: false });
console.log(`Yedek alındı: ${path.relative(repoRoot, target)}`);
console.log("Geri yüklemek için veri klasörünü bu dizinle değiştirin (sunucu kapalıyken).");
