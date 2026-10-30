import { Readable } from "node:stream";

const MAX_OBJECT_BYTES = 25 * 1024 * 1024;

function runtimeConfig() {
  const base = (process.env.MANUS_API_URL ?? "").replace(/\/+$/, "");
  const key = process.env.MANUS_API_KEY ?? "";
  if (!base || !key) throw new Error("Platform storage servisi yapılandırılmamış.");
  return { base, key };
}

async function requestPresignedUrl(action: "put" | "get", keyPath: string) {
  const { base, key } = runtimeConfig();
  const url = `${base}/v1/storage/presign/${action}?path=${encodeURIComponent(keyPath)}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(20_000),
  });
  const data = await response.json().catch(() => ({})) as { url?: string; error?: string };
  if (!response.ok || !data.url) {
    throw new Error(`Nesne depolama ${action} isteği başarısız oldu (${response.status}). ${data.error ?? ""}`.trim());
  }
  return data.url;
}

export async function putObject(keyPath: string, bytes: Buffer, contentType: string) {
  if (bytes.byteLength > MAX_OBJECT_BYTES) throw new Error("Dosya boyutu 25 MB sınırını aşıyor.");
  const url = await requestPresignedUrl("put", keyPath);
  const response = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: new Uint8Array(bytes),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`Dosya nesne depolamaya yazılamadı (${response.status}).`);
  return `/manus-storage/${keyPath}`;
}

async function readBounded(stream: ReadableStream<Uint8Array>, maxBytes: number) {
  const reader = stream.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error("Arşiv indirme boyutu güvenlik sınırını aştı.");
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

export async function getObject(keyPath: string) {
  const url = await requestPresignedUrl("get", keyPath);
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok || !response.body) throw new Error(`Kaynak arşiv storage’dan alınamadı (${response.status}).`);
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_OBJECT_BYTES) throw new Error("Kaynak arşiv boyutu güvenlik sınırını aştı.");
  return readBounded(response.body, MAX_OBJECT_BYTES);
}
