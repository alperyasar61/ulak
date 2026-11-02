import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { rateLimitMiddleware, resetRateLimits } from "./security.js";

function fakeRequest(token?: string, ip = "127.0.0.1") {
  return {
    header: (name: string) => (name.toLowerCase() === "x-ulak-session" ? token : undefined),
    ip,
    socket: { remoteAddress: ip },
  } as unknown as Request;
}

function fakeResponse() {
  const headers = new Map<string, string>();
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    setHeader: (name: string, value: string) => headers.set(name.toLowerCase(), value),
    getHeader: (name: string) => headers.get(name.toLowerCase()),
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown; getHeader: (n: string) => string | undefined };
}

const TOKEN = "a".repeat(64);

describe("rateLimitMiddleware", () => {
  beforeEach(() => resetRateLimits());

  it("sınırın altındaki istekleri geçirir", () => {
    const middleware = rateLimitMiddleware(2, 60_000);
    const next = vi.fn() as unknown as NextFunction;
    middleware(fakeRequest(TOKEN), fakeResponse(), next);
    middleware(fakeRequest(TOKEN), fakeResponse(), next);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it("sınır aşılınca 429 ve Retry-After döner", () => {
    const middleware = rateLimitMiddleware(1, 60_000);
    const next = vi.fn() as unknown as NextFunction;
    middleware(fakeRequest(TOKEN), fakeResponse(), next);

    const res = fakeResponse();
    middleware(fakeRequest(TOKEN), res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(429);
    expect(Number(res.getHeader("retry-after"))).toBeGreaterThan(0);
    expect(res.getHeader("x-ratelimit-remaining")).toBe("0");
  });

  it("farklı oturumlar birbirinin sınırını tüketmez", () => {
    const middleware = rateLimitMiddleware(1, 60_000);
    const next = vi.fn() as unknown as NextFunction;
    middleware(fakeRequest(TOKEN), fakeResponse(), next);
    middleware(fakeRequest("b".repeat(64)), fakeResponse(), next);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it("jeton yoksa IP'ye göre sınırlar", () => {
    const middleware = rateLimitMiddleware(1, 60_000);
    const next = vi.fn() as unknown as NextFunction;
    middleware(fakeRequest(undefined, "10.0.0.5"), fakeResponse(), next);

    const res = fakeResponse();
    middleware(fakeRequest(undefined, "10.0.0.5"), res, next);
    expect(res.statusCode).toBe(429);

    const other = fakeResponse();
    middleware(fakeRequest(undefined, "10.0.0.6"), other, next);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it("pencere dolunca sayaç sıfırlanır", () => {
    vi.useFakeTimers();
    try {
      const middleware = rateLimitMiddleware(1, 1_000);
      const next = vi.fn() as unknown as NextFunction;
      middleware(fakeRequest(TOKEN), fakeResponse(), next);

      const blocked = fakeResponse();
      middleware(fakeRequest(TOKEN), blocked, next);
      expect(blocked.statusCode).toBe(429);

      vi.advanceTimersByTime(1_500);
      const res = fakeResponse();
      middleware(fakeRequest(TOKEN), res, next);
      expect(res.statusCode).toBe(200);
      expect(next).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
