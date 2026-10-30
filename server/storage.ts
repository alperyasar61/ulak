import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const MAX_OBJECT_BYTES = 25 * 1024 * 1024;

/** Yüklenen arşivlerin tutulduğu yerel dizin. */
export function storageRoot() {
  const configured = process.env.ULAK_DATA_DIR?.trim();
  return path.resolve(configured && configured.length ? configured : path.join(process.cwd(), ".ulak-data"));
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
  if (bytes.byteLength > MAX_OBJECT_BYTES) throw new Error("Dosya boyutu 25 MB sınırını aşıyor.");
  const target = objectPath(keyPath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
  return keyPath;
}

export async function getObject(keyPath: string) {
  const target = objectPath(keyPath);
  const info = await stat(target).catch(() => null);
  if (!info?.isFile()) throw new Error("Kaynak arşiv depoda bulunamadı.");
  if (info.size > MAX_OBJECT_BYTES) throw new Error("Kaynak arşiv boyutu güvenlik sınırını aştı.");
  const buffer = await readFile(target);
  if (buffer.byteLength > MAX_OBJECT_BYTES) throw new Error("Kaynak arşiv boyutu güvenlik sınırını aştı.");
  return buffer;
}

export async function deleteObject(keyPath: string) {
  await rm(objectPath(keyPath), { force: true });
}
