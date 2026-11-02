import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { repoRoot } from "./paths.js";

const DEFAULT_MAX_OBJECT_MB = 25;

/**
 * Yükleme boyutu sınırı (bayt). `ULAK_MAX_UPLOAD_MB` ile değiştirilebilir.
 * Multer, GitHub indirmesi ve nesne deposu aynı sınırı kullanır.
 */
export function maxObjectBytes() {
  const configured = Number(process.env.ULAK_MAX_UPLOAD_MB);
  const mb = Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_OBJECT_MB;
  return Math.floor(mb * 1024 * 1024);
}

function oversizeMessage() {
  return `Dosya boyutu ${Math.round(maxObjectBytes() / (1024 * 1024))} MB sınırını aşıyor.`;
}

/**
 * Yüklenen arşivlerin tutulduğu yerel dizin.
 *
 * Göreli `ULAK_DATA_DIR` değerleri depo köküne göre çözülür; böylece proje
 * başka bir klasöre kopyalandığında veriler yine proje içinde kalır ve
 * `pnpm --filter` gibi farklı çalışma dizinlerinden başlatmak yeri değiştirmez.
 */
export function storageRoot() {
  const configured = process.env.ULAK_DATA_DIR?.trim();
  if (!configured) return path.join(repoRoot, ".ulak-data");
  return path.isAbsolute(configured) ? configured : path.resolve(repoRoot, configured);
}

function objectPath(keyPath: string) {
  const segments = keyPath.split("/").filter((segment) => segment && segment !== ".");
  if (!segments.length || segments.some((segment) => segment === ".." || segment.includes("\0"))) {
    throw new Error("Nesne anahtarı geçersiz.");
  }
  const root = path.join(storageRoot(), "objects");
  const target = path.join(root, ...segments);
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error("Nesne anahtarı depolama alanının dışına çıkıyor.");
  return target;
}

export async function putObject(keyPath: string, bytes: Buffer, _contentType: string) {
  if (bytes.byteLength > maxObjectBytes()) throw new Error(oversizeMessage());
  const target = objectPath(keyPath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
  return keyPath;
}

export async function getObject(keyPath: string) {
  const target = objectPath(keyPath);
  const info = await stat(target).catch(() => null);
  if (!info?.isFile()) throw new Error("Kaynak arşiv depoda bulunamadı.");
  if (info.size > maxObjectBytes()) throw new Error("Kaynak arşiv boyutu güvenlik sınırını aştı.");
  const buffer = await readFile(target);
  if (buffer.byteLength > maxObjectBytes()) throw new Error("Kaynak arşiv boyutu güvenlik sınırını aştı.");
  return buffer;
}

export async function deleteObject(keyPath: string) {
  await rm(objectPath(keyPath), { force: true });
}
