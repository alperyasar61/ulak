import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { getObject, maxObjectBytes, putObject } from "./storage.js";

let dataDir = "";
let previousDataDir: string | undefined;
let previousLimit: string | undefined;

beforeAll(() => {
  previousDataDir = process.env.ULAK_DATA_DIR;
  dataDir = mkdtempSync(join(tmpdir(), "ulak-storage-"));
  process.env.ULAK_DATA_DIR = dataDir;
});

afterAll(() => {
  if (previousDataDir === undefined) delete process.env.ULAK_DATA_DIR;
  else process.env.ULAK_DATA_DIR = previousDataDir;
  rmSync(dataDir, { recursive: true, force: true });
});

afterEach(() => {
  if (previousLimit === undefined) delete process.env.ULAK_MAX_UPLOAD_MB;
  else process.env.ULAK_MAX_UPLOAD_MB = previousLimit;
});

describe("nesne deposu boyut sınırı", () => {
  it("varsayılan sınır 25 MB", () => {
    delete process.env.ULAK_MAX_UPLOAD_MB;
    expect(maxObjectBytes()).toBe(25 * 1024 * 1024);
  });

  it("ULAK_MAX_UPLOAD_MB ile değiştirilebilir", () => {
    process.env.ULAK_MAX_UPLOAD_MB = "2";
    expect(maxObjectBytes()).toBe(2 * 1024 * 1024);
  });

  it("geçersiz değer varsayılana döner", () => {
    process.env.ULAK_MAX_UPLOAD_MB = "abc";
    expect(maxObjectBytes()).toBe(25 * 1024 * 1024);
    process.env.ULAK_MAX_UPLOAD_MB = "-5";
    expect(maxObjectBytes()).toBe(25 * 1024 * 1024);
  });

  it("sınırı aşan yazma reddedilir ve mesaj sınırı yansıtır", async () => {
    process.env.ULAK_MAX_UPLOAD_MB = "1";
    const oversized = Buffer.alloc(1024 * 1024 + 1);
    await expect(putObject("test/big.bin", oversized, "application/octet-stream")).rejects.toThrow(/1 MB sınırını aşıyor/);
  });

  it("sınır içindeki yazma okunabilir", async () => {
    process.env.ULAK_MAX_UPLOAD_MB = "1";
    const payload = Buffer.from("merhaba");
    await putObject("test/small.bin", payload, "application/octet-stream");
    await expect(getObject("test/small.bin")).resolves.toEqual(payload);
  });

  it("yol geçişi reddedilir", async () => {
    await expect(putObject("../kacis.bin", Buffer.from("x"), "application/octet-stream")).rejects.toThrow(/geçersiz|dışına/);
  });
});
