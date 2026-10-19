import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({ $queryRaw: vi.fn(), rateLimitBucket: { deleteMany: vi.fn() } }));
vi.mock("@/lib/db", () => ({ db }));

import { clientIp } from "@/lib/rate-limit";
import { purgeExpiredRateLimits, rateLimitDb } from "@/lib/rate-limit-db";

const req = (headers: Record<string, string>) => new Request("http://x", { headers });

beforeEach(() => vi.clearAllMocks());

describe("clientIp", () => {
  it("trusts X-Real-IP set by Nginx", () => {
    expect(clientIp(req({ "x-real-ip": "5.5.5.5", "x-forwarded-for": "1.2.3.4, 5.5.5.5" }))).toBe("5.5.5.5");
  });

  it("otherwise takes the last X-Forwarded-For hop, never the client-controlled first one", () => {
    expect(clientIp(req({ "x-forwarded-for": "6.6.6.6, 7.7.7.7" }))).toBe("7.7.7.7");
    expect(clientIp(req({}))).toBe("unknown");
  });
});

describe("rateLimitDb", () => {
  it("allows up to the limit and refuses beyond it", async () => {
    const resetAt = new Date(Date.now() + 60_000);
    db.$queryRaw.mockResolvedValueOnce([{ count: 3, resetAt }]);
    expect((await rateLimitDb("k", { maxAttempts: 3 })).success).toBe(true);
    db.$queryRaw.mockResolvedValueOnce([{ count: 4, resetAt }]);
    const r = await rateLimitDb("k", { maxAttempts: 3 });
    expect(r).toMatchObject({ success: false, remaining: 0, resetAt: resetAt.getTime() });
  });

  it("falls back to memory when the database fails", async () => {
    db.$queryRaw.mockRejectedValue(new Error("down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await rateLimitDb("fallback", { maxAttempts: 1 })).success).toBe(true);
    expect((await rateLimitDb("fallback", { maxAttempts: 1 })).success).toBe(false);
    spy.mockRestore();
  });

  it("purges finished windows", async () => {
    db.rateLimitBucket.deleteMany.mockResolvedValue({ count: 4 });
    const now = new Date();
    expect(await purgeExpiredRateLimits(now)).toBe(4);
    expect(db.rateLimitBucket.deleteMany).toHaveBeenCalledWith({ where: { resetAt: { lt: now } } });
  });
});

describe("rateLimitDbBlocked", () => {
  it("reports a full window without counting, and fails open", async () => {
    const { rateLimitDbBlocked } = await import("@/lib/rate-limit-db");
    const now = new Date();
    const resetAt = new Date(now.getTime() + 60_000);
    (db.rateLimitBucket as Record<string, unknown>).findUnique = vi.fn()
      .mockResolvedValueOnce({ count: 5, resetAt })
      .mockResolvedValueOnce({ count: 4, resetAt })
      .mockResolvedValueOnce({ count: 9, resetAt: new Date(now.getTime() - 1) })
      .mockRejectedValueOnce(new Error("down"));
    expect(await rateLimitDbBlocked("k", 5, now)).toEqual({ blocked: true, resetAt: resetAt.getTime() });
    expect((await rateLimitDbBlocked("k", 5, now)).blocked).toBe(false);
    expect((await rateLimitDbBlocked("k", 5, now)).blocked).toBe(false);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await rateLimitDbBlocked("k", 5, now)).blocked).toBe(false);
    spy.mockRestore();
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });
});
