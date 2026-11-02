import { existsSync } from "node:fs";
import path from "node:path";
import { repoRoot } from "./paths.js";

/**
 * `.env` dosyası varsa süreç ortamına yüklenir. Dosya yoksa veya geçersizse
 * mevcut ortam değişkenleri korunur; uygulama bu yüzden başlamaz duruma gelmez.
 */
const envFile = path.join(repoRoot, ".env");
if (existsSync(envFile) && typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(envFile);
  } catch {
    console.warn("ULAK: .env okunamadı; mevcut ortam değişkenleri kullanılıyor.");
  }
}

/**
 * Proje ile birlikte taşınan işleyiş tetkiki araçları. Kullanıcı ortam
 * değişkeniyle açıkça başka bir yol vermediyse gömülü kopya kullanılır; böylece
 * klasör başka bir makineye kopyalandığında sistem PATH'ine ihtiyaç kalmaz.
 */
const bundledTools: ReadonlyArray<readonly [string, string]> = [
  ["REA_OBJDUMP_COMMAND", path.join("tools", "binutils", "objdump.exe")],
  ["REA_RIZIN_COMMAND", path.join("tools", "rizin", "rizin.exe")],
];

for (const [variable, relative] of bundledTools) {
  if (process.env[variable]) continue;
  const candidate = path.join(repoRoot, relative);
  if (existsSync(candidate)) process.env[variable] = candidate;
}
