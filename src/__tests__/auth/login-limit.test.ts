import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  otp: { findFirst: vi.fn(), deleteMany: vi.fn() },
  user: { findUnique: vi.fn() },
}));
const limits = vi.hoisted(() => ({ rateLimitDb: vi.fn(), rateLimitDbBlocked: vi.fn() }));

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/rate-limit-db", () => limits);
vi.mock("@/lib/activity", () => ({ touchLastActive: vi.fn() }));
vi.mock("next-auth", () => ({
  CredentialsSignin: class extends Error {
    code = "credentials";
  },
}));
vi.mock("bcryptjs", () => ({ default: { compare: vi.fn(async (pw: string) => pw === "right") } }));

import { authorizeAdminLogin, authorizePhoneLogin, LOGIN_MAX_FAILURES } from "@/lib/auth-authorize";
import { rateLimitedMinutes } from "@/lib/login-limit";

beforeEach(() => {
  vi.clearAllMocks();
  limits.rateLimitDbBlocked.mockResolvedValue({ blocked: false, resetAt: 0 });
  limits.rateLimitDb.mockResolvedValue({ success: true, remaining: 4, resetAt: 0 });
  db.otp.findFirst.mockResolvedValue({ id: "o1" });
  db.user.findUnique.mockResolvedValue({ id: "u1", firstName: "يزن", role: "USER", gender: "MALE", status: "ACTIVE" });
});

describe("member sign-in limit (G54)", () => {
  it("never counts a successful sign-in", async () => {
    for (let i = 0; i < 8; i++) {
      expect(await authorizePhoneLogin({ phone: "0790000001", otp: "111111" })).toMatchObject({ id: "u1" });
    }
    expect(limits.rateLimitDb).not.toHaveBeenCalled();
    expect(limits.rateLimitDbBlocked).toHaveBeenCalledWith("login:962790000001", LOGIN_MAX_FAILURES);
  });

  it("counts a failed sign-in in Postgres", async () => {
    db.otp.findFirst.mockResolvedValue(null);
    expect(await authorizePhoneLogin({ phone: "0790000001", otp: "000000" })).toBeNull();
    expect(limits.rateLimitDb).toHaveBeenCalledWith("login:962790000001", { maxAttempts: 5, windowMs: 15 * 60 * 1000 });
  });

  it("refuses with the minutes left once failures reach the limit, without looking anything up", async () => {
    limits.rateLimitDbBlocked.mockResolvedValue({ blocked: true, resetAt: Date.now() + 7 * 60_000 - 1000 });
    const error = await authorizePhoneLogin({ phone: "0790000001", otp: "111111" }).catch((e) => e);
    expect(error.code).toBe("rate_limited:7");
    expect(rateLimitedMinutes(error.code)).toBe(7);
    expect(db.otp.findFirst).not.toHaveBeenCalled();
  });
});

describe("admin sign-in limit (G54)", () => {
  beforeEach(() => {
    db.user.findUnique.mockResolvedValue({ id: "a1", role: "ADMIN", passwordHash: "h", email: "a@x.jo" });
  });

  it("counts a wrong password only", async () => {
    expect(await authorizeAdminLogin({ email: "a@x.jo", password: "right" })).toMatchObject({ id: "a1" });
    expect(limits.rateLimitDb).not.toHaveBeenCalled();
    expect(await authorizeAdminLogin({ email: "a@x.jo", password: "wrong" })).toBeNull();
    expect(limits.rateLimitDb).toHaveBeenCalledWith("admin-login:a@x.jo", expect.any(Object));
  });

  it("is refused while blocked", async () => {
    limits.rateLimitDbBlocked.mockResolvedValue({ blocked: true, resetAt: Date.now() + 60_000 });
    await expect(authorizeAdminLogin({ email: "a@x.jo", password: "right" })).rejects.toMatchObject({ code: "rate_limited:1" });
  });
});

describe("rateLimitedMinutes", () => {
  it("reads only the rate-limit code", () => {
    expect(rateLimitedMinutes("credentials")).toBeNull();
    expect(rateLimitedMinutes(undefined)).toBeNull();
    expect(rateLimitedMinutes("rate_limited:12")).toBe(12);
  });
});
