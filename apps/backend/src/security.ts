import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Request, Response, NextFunction } from "express";
import { storageRoot } from "./storage.js";

export function newSessionToken() {
  return randomBytes(32).toString("hex");
}

let cachedMachineSecret: string | null = null;
let cachedMachineSecretPersistent = false;

/**
 * Makineye özgü sır. Yalnızca yerel şifreleme anahtarı türetmek için kullanılır
 * ve `.ulak-data` altında saklanır. EVREN anahtarının kendisi hiçbir zaman
 * düz metin olarak diske yazılmaz.
 */
export function machineSecret() {
  if (cachedMachineSecret) return cachedMachineSecret;
  const file = join(storageRoot(), ".machine-secret");
  try {
    if (existsSync(file)) {
      const existing = readFileSync(file, "utf8").trim();
      if (/^[a-f0-9]{64}$/i.test(existing)) {
        cachedMachineSecret = existing;
        cachedMachineSecretPersistent = true;
        return existing;
      }
    }
    mkdirSync(dirname(file), { recursive: true });
    const created = randomBytes(32).toString("hex");
    writeFileSync(file, created, { mode: 0o600 });
    cachedMachineSecret = created;
    cachedMachineSecretPersistent = true;
    return created;
  } catch {
    // Yazma izni yoksa süreç ömrü boyunca geçerli geçici bir sır kullanılır.
    cachedMachineSecret = randomBytes(32).toString("hex");
    return cachedMachineSecret;
  }
}

export function assertPersistentMachineSecret() {
  machineSecret();
  if (!cachedMachineSecretPersistent) {
    throw new Error("API sırları kalıcı olarak şifrelenemiyor; ULAK veri klasörüne yazma iznini kontrol edin.");
  }
}

function localCipherKey() {
  return scryptSync(machineSecret(), "ulak-evren-key-v1", 32);
}

/** Metni yerel anahtarla şifreler: `iv.tag.ciphertext` (base64). */
export function encryptLocal(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", localCipherKey(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((part) => part.toString("base64")).join(".");
}

/** `encryptLocal` çıktısını çözer; bozuk/yanlış makine ise null döner. */
export function decryptLocal(payload: string) {
  const parts = payload.split(".");
  if (parts.length !== 3) return null;
  try {
    const [iv, tag, body] = parts.map((part) => Buffer.from(part, "base64"));
    const decipher = createDecipheriv("aes-256-gcm", localCipherKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function ownerHashForRequest(req: Request) {
  const token = req.header("x-ulak-session") ?? "";
  if (!/^[a-f0-9]{64}$/i.test(token)) {
    throw Object.assign(new Error("ULAK oturumu eksik. Sayfayı yenileyip tekrar deneyin."), { status: 401 });
  }
  if (singleUserMode() && isLoopback(req)) return SINGLE_USER_HASH;
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Yerel tek kullanıcılı kurulumda tüm projeler tek bir sahip altında toplanır.
 * Aksi halde her yeni oturum jetonu (her test çalışması, her tarayıcı profili)
 * ayrı bir sahip üretir ve kenar çubuğu boş görünür.
 * `ULAK_SINGLE_USER=0` ile kapatılabilir.
 */
export const SINGLE_USER_HASH = createHash("sha256").update("ulak-local-single-user").digest("hex");

export function singleUserMode() {
  return process.env.ULAK_SINGLE_USER !== "0";
}

function isLoopback(req: Request) {
  const ip = req.ip ?? req.socket?.remoteAddress ?? "";
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

interface RateLimitWindow {
  hits: number;
  resetAt: number;
}

const windows = new Map<string, RateLimitWindow>();
const MAX_TRACKED_KEYS = 10_000;

/** Testlerde durumu sıfırlamak için. */
export function resetRateLimits() {
  windows.clear();
}

/**
 * Sınırlayıcı anahtarı: oturum jetonu varsa onun özeti, yoksa istemci IP'si.
 * Jetonun kendisi bellekte tutulmaz.
 */
function rateLimitKey(req: Request) {
  const token = req.header("x-ulak-session") ?? "";
  if (/^[a-f0-9]{64}$/i.test(token)) return `s:${createHash("sha256").update(token).digest("hex")}`;
  return `i:${req.ip ?? req.socket?.remoteAddress ?? "unknown"}`;
}

function sweepExpired(now: number) {
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
}

/**
 * Bellekte tutulan kayan pencere hız sınırlayıcı. Aşıldığında `429` ve
 * `Retry-After` döner; kabul edilen isteklerde `X-RateLimit-*` başlıkları yazılır.
 */
export function rateLimitMiddleware(limit: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    if (windows.size >= MAX_TRACKED_KEYS) sweepExpired(now);

    const key = rateLimitKey(req);
    const current = windows.get(key);
    const window = current && current.resetAt > now ? current : { hits: 0, resetAt: now + windowMs };

    if (window.hits >= limit) {
      const retryAfter = Math.max(1, Math.ceil((window.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfter));
      res.setHeader("X-RateLimit-Limit", String(limit));
      res.setHeader("X-RateLimit-Remaining", "0");
      res.setHeader("X-RateLimit-Reset", String(Math.ceil(window.resetAt / 1000)));
      res.status(429).json({ error: `Çok fazla istek. ${retryAfter} saniye sonra tekrar deneyin.` });
      return;
    }

    window.hits += 1;
    windows.set(key, window);
    res.setHeader("X-RateLimit-Limit", String(limit));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, limit - window.hits)));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(window.resetAt / 1000)));
    next();
  };
}
