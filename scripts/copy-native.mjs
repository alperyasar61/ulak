import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * KodMercek'in Windows native eklentisi `import.meta.url` üzerinden kendi
 * paket köküne göre aranır. `tsc` çıktısı `apps/backend/dist-server/modules/KodMercek/src`
 * altına düştüğü için eklenti de aynı göreli konuma kopyalanır; aksi halde
 * `pnpm start` ile çalışan sunucu native yetkiyi kaybeder.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backend = path.join(root, "apps", "backend");
const source = path.join(backend, "modules", "KodMercek", "native");
const target = path.join(backend, "dist-server", "modules", "KodMercek", "native");

await mkdir(path.dirname(target), { recursive: true });
await cp(source, target, { recursive: true });
console.log(`KodMercek native eklentisi kopyalandı: ${path.relative(root, target)}`);
