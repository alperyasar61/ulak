import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { adoptEnvKey, clearEvrenKey, evrenKeyStatus, recordVerification, redactSecrets, resolveEvrenKey, setEvrenKey } from "./credentials.js";

const SAMPLE = "evren-test-key-0123456789";

let dataDir = "";
let previousDataDir: string | undefined;

beforeAll(() => {
  previousDataDir = process.env.ULAK_DATA_DIR;
  dataDir = mkdtempSync(join(tmpdir(), "ulak-credentials-"));
  process.env.ULAK_DATA_DIR = dataDir;
});

afterAll(() => {
  if (previousDataDir === undefined) delete process.env.ULAK_DATA_DIR;
  else process.env.ULAK_DATA_DIR = previousDataDir;
  rmSync(dataDir, { recursive: true, force: true });
});

afterEach(() => {
  clearEvrenKey();
  delete process.env.EVREN_API_KEY;
});

describe("EVREN anahtar kasası", () => {
  it("başlangıçta anahtar tanımlı değildir", () => {
    expect(evrenKeyStatus()).toEqual({ configured: false, source: null, removable: false });
    expect(resolveEvrenKey()).toBe("");
  });

  it("anahtarı yalnızca bellekte tutar ve durumu bildirir", () => {
    const status = setEvrenKey(SAMPLE);
    expect(status).toEqual({ configured: true, source: "memory", removable: true });
    expect(resolveEvrenKey()).toBe(SAMPLE);
  });

  it("anahtarı process.env içine yazmaz", () => {
    setEvrenKey(SAMPLE);
    expect(process.env.EVREN_API_KEY).toBeUndefined();
  });

  it("silme anahtarı bellekten kaldırır", () => {
    setEvrenKey(SAMPLE);
    expect(clearEvrenKey()).toEqual({ configured: false, source: null, removable: false });
    expect(resolveEvrenKey()).toBe("");
  });

  it("boş veya geçersiz anahtarı reddeder", () => {
    expect(() => setEvrenKey("")).toThrow(/boş olamaz/);
    expect(() => setEvrenKey("   ")).toThrow(/boş olamaz/);
    expect(() => setEvrenKey("kisa")).toThrow(/geçersiz/);
    expect(() => setEvrenKey("boşluk lu anahtar")).toThrow(/geçersiz/);
    expect(() => setEvrenKey(42)).toThrow(/boş olamaz/);
  });

  it(".env anahtarını okur ve ortamdan siler", () => {
    process.env.EVREN_API_KEY = SAMPLE;
    adoptEnvKey();
    expect(process.env.EVREN_API_KEY).toBeUndefined();
    expect(evrenKeyStatus()).toEqual({ configured: true, source: "env", removable: true });
    expect(resolveEvrenKey()).toBe(SAMPLE);
  });

  it("hata metinlerindeki anahtarı maskeler", () => {
    setEvrenKey(SAMPLE);
    expect(redactSecrets(`401 Unauthorized: ${SAMPLE} geçersiz`)).toBe("401 Unauthorized: [gizli] geçersiz");
    expect(redactSecrets("anahtar yok")).toBe("anahtar yok");
  });

  it("doğrulama sonucunu anahtar olmadan saklar", () => {
    setEvrenKey(SAMPLE);
    recordVerification({ verified: true, modelCount: 7 });
    const status = evrenKeyStatus();
    expect(status.verified).toBe(true);
    expect(status.modelCount).toBe(7);
    expect(typeof status.checkedAt).toBe("string");
    expect(JSON.stringify(status)).not.toContain(SAMPLE);
  });

  it("başarısız doğrulamayı neden bilgisiyle bildirir", () => {
    setEvrenKey(SAMPLE);
    recordVerification({ verified: false, error: "EVREN anahtarı reddedildi (401/403)." });
    const status = evrenKeyStatus();
    expect(status.verified).toBe(false);
    expect(status.lastError).toMatch(/reddedildi/);
    expect(status.modelCount).toBeUndefined();
  });

  it("anahtar değişince eski doğrulama sonucu temizlenir", () => {
    setEvrenKey(SAMPLE);
    recordVerification({ verified: true, modelCount: 3 });
    setEvrenKey("evren-baska-anahtar-9876543210");
    expect(evrenKeyStatus().verified).toBeUndefined();
    expect(evrenKeyStatus().modelCount).toBeUndefined();
  });

  it("anahtar silinince doğrulama sonucu da silinir", () => {
    setEvrenKey(SAMPLE);
    recordVerification({ verified: true, modelCount: 3 });
    clearEvrenKey();
    expect(evrenKeyStatus()).toEqual({ configured: false, source: null, removable: false });
  });

  it("anahtarı diske düz metin olarak yazmaz", () => {
    setEvrenKey(SAMPLE);
    const file = join(dataDir, "evren-key.enc");
    expect(existsSync(file)).toBe(true);
    const raw = readFileSync(file, "utf8");
    expect(raw).not.toContain(SAMPLE);
    expect(raw.split(".")).toHaveLength(3);
  });

  it("şifreli anahtarı yeniden başlatmada geri yükler", () => {
    setEvrenKey(SAMPLE);
    const file = join(dataDir, "evren-key.enc");
    const encrypted = readFileSync(file, "utf8");
    // Yeni süreç benzetimi: bellek ve dosya temizlenir, sonra dosya geri konur.
    clearEvrenKey();
    expect(evrenKeyStatus().configured).toBe(false);
    writeFileSync(file, encrypted, { mode: 0o600 });
    adoptEnvKey();
    expect(resolveEvrenKey()).toBe(SAMPLE);
    expect(evrenKeyStatus().source).toBe("memory");
  });

  it("silme işlemi şifreli dosyayı da kaldırır", () => {
    setEvrenKey(SAMPLE);
    const file = join(dataDir, "evren-key.enc");
    expect(existsSync(file)).toBe(true);
    clearEvrenKey();
    expect(existsSync(file)).toBe(false);
  });
});
