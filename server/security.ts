import { createHash, randomBytes } from "node:crypto";
import type { Request } from "express";

export function newSessionToken() {
  return randomBytes(32).toString("hex");
}

export function ownerHashForRequest(req: Request) {
  const token = req.header("x-ulak-session") ?? "";
  if (!/^[a-f0-9]{64}$/i.test(token)) {
    throw Object.assign(new Error("ULAK oturumu eksik. Sayfayı yenileyip tekrar deneyin."), { status: 401 });
  }
  return createHash("sha256").update(token).digest("hex");
}
