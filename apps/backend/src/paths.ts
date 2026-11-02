import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Depo kökü, `pnpm-workspace.yaml` dosyası aranarak bulunur. Böylece aynı kod
 * hem `src/` içinden (tsx) hem de `dist-server/` içinden (derlenmiş) çalışırken
 * doğru kökü gösterir; `process.cwd()` değerine bağlı kalmaz.
 */
function findRepoRoot(start: string) {
  let current = start;
  for (;;) {
    if (existsSync(path.join(current, "pnpm-workspace.yaml"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return start;
    current = parent;
  }
}

export const repoRoot = findRepoRoot(path.dirname(fileURLToPath(import.meta.url)));

/** Ön yüzün üretim derlemesinin okunacağı dizin. */
export function webDistRoot() {
  const configured = process.env.ULAK_WEB_DIST?.trim();
  return configured && configured.length
    ? path.resolve(configured)
    : path.join(repoRoot, "apps", "frontend", "dist");
}
