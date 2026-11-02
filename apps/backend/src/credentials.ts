/**
 * EVREN API anahtarı yönetimi.
 *
 * Anahtar hiçbir zaman düz metin olarak kalıcılaşmaz:
 * - `.env` dosyasına yazılmaz, veritabanına veya denetim günlüğüne işlenmez,
 * - `process.env` içinde bırakılmaz (KodMercek'in başlattığı objdump/rizin alt
 *   süreçleri ortamı devraldığı için anahtar oradan sızabilirdi),
 * - hiçbir API yanıtında istemciye dönmez,
 * - analiz edilen proje verisine, prompt'a veya rapora eklenmez.
 *
 * Sunucu yeniden başladığında anahtar kaybolmasın diye `.ulak-data` altında
 * makineye özgü bir sırla AES-256-GCM ile şifrelenmiş olarak saklanır. Şifre
 * çözme anahtarı yalnızca bu makinede bulunur; dosya başka bir makineye
 * kopyalanırsa okunamaz. "Anahtarı sil" hem belleği hem şifreli dosyayı siler.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { decryptLocal, encryptLocal } from "./security.js";
import { storageRoot } from "./storage.js";

let memoryKey = "";
let envKey = "";

/**
 * Doğrulama sonucu. Anahtarın kendisi değil, yalnızca "EVREN bu anahtarı kabul
 * etti mi" bilgisi tutulur; böylece sayfa yenilendiğinde de kullanıcı sonucu
 * görebilir.
 */
let verification: { verified: boolean; modelCount: number; checkedAt: string; error: string } | null = null;

/** Anahtar biçimi: yazdırılabilir ASCII, boşluksuz, makul uzunlukta. */
const KEY_PATTERN = /^[\x21-\x7e]{8,512}$/;

function dataDir() {
  return storageRoot();
}

function keyFile() {
  return join(dataDir(), "evren-key.enc");
}

function persistKey(key: string) {
  try {
    mkdirSync(dirname(keyFile()), { recursive: true });
    writeFileSync(keyFile(), encryptLocal(key), { mode: 0o600 });
  } catch {
    // Disk yazılamıyorsa anahtar yalnızca bellekte kalır; işlev bozulmaz.
  }
}

function dropPersistedKey() {
  try {
    if (existsSync(keyFile())) rmSync(keyFile(), { force: true });
  } catch {
    // Silinemezse yoksayılır; bellek zaten temizlendi.
  }
}

/**
 * Başlangıçta çağrılır: `.env` içindeki anahtarı bir kez okur, `process.env`
 * üzerinden siler ve varsa şifreli saklanan anahtarı yükler.
 */
export function adoptEnvKey() {
  const fromEnv = process.env.EVREN_API_KEY?.trim() ?? "";
  if (fromEnv) envKey = fromEnv;
  delete process.env.EVREN_API_KEY;

  if (!memoryKey && !envKey) {
    try {
      if (existsSync(keyFile())) {
        const restored = decryptLocal(readFileSync(keyFile(), "utf8"));
        if (restored && KEY_PATTERN.test(restored)) memoryKey = restored;
      }
    } catch {
      // Bozuk veya başka makineden gelmiş dosya yoksayılır.
    }
  }
}

/** Yalnızca sunucu içi kullanım içindir; istemciye asla gönderilmez. */
export function resolveEvrenKey() {
  return memoryKey || envKey;
}

export interface EvrenKeyStatus {
  configured: boolean;
  /** "memory": arayüzden girildi ve silinebilir, "env": .env dosyasından geldi. */
  source: "memory" | "env" | null;
  removable: boolean;
  /** Anahtar EVREN tarafından canlı olarak doğrulandı mı. */
  verified?: boolean;
  /** Doğrulandıysa erişilebilen sohbet modeli sayısı. */
  modelCount?: number;
  /** Son doğrulamanın ISO zaman damgası. */
  checkedAt?: string;
  /** Son doğrulama başarısızsa nedeni (anahtar içermez). */
  lastError?: string;
}

export function evrenKeyStatus(): EvrenKeyStatus {
  const source = memoryKey ? "memory" : envKey ? "env" : null;
  const base: EvrenKeyStatus = { configured: Boolean(source), source, removable: Boolean(source) };
  if (!source || !verification) return base;
  return {
    ...base,
    verified: verification.verified,
    ...(verification.verified ? { modelCount: verification.modelCount } : {}),
    checkedAt: verification.checkedAt,
    ...(verification.error ? { lastError: verification.error } : {}),
  };
}

/** Doğrulama sonucunu kaydeder. Anahtarın kendisi burada tutulmaz. */
export function recordVerification(result: { verified: boolean; modelCount?: number; error?: string }) {
  verification = {
    verified: result.verified,
    modelCount: result.modelCount ?? 0,
    checkedAt: new Date().toISOString(),
    error: result.error ?? "",
  };
}

/** Biçim denetimi yapar, değeri döndürür; hiçbir yere yazmaz. */
export function validateEvrenKey(raw: unknown): string {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) throw Object.assign(new Error("API anahtarı boş olamaz."), { status: 400 });
  if (!KEY_PATTERN.test(value)) {
    throw Object.assign(new Error("API anahtarı geçersiz: boşluk içermeyen 8-512 karakterlik bir değer girin."), { status: 400 });
  }
  return value;
}

export function setEvrenKey(raw: unknown): EvrenKeyStatus {
  memoryKey = validateEvrenKey(raw);
  verification = null;
  persistKey(memoryKey);
  return evrenKeyStatus();
}

export function clearEvrenKey(): EvrenKeyStatus {
  memoryKey = "";
  envKey = "";
  verification = null;
  delete process.env.EVREN_API_KEY;
  dropPersistedKey();
  return evrenKeyStatus();
}

/**
 * Dışa dönen her metinden anahtarı temizler. Sağlayıcı hata mesajı anahtarı
 * yankılarsa bile istemciye veya günlüğe sızmaz.
 */
export function redactSecrets(text: string) {
  let result = text;
  for (const key of [memoryKey, envKey]) {
    if (key) result = result.split(key).join("[gizli]");
  }
  return result;
}
