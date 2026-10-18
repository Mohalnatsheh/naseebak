import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  otp: { findFirst: vi.fn(), deleteMany: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
}));
const captured = vi.hoisted(() => ({ config: null as null | { providers: { id: string; authorize: (c: unknown) => unknown }[] } }));

vi.mock("@/lib/db", () => ({ db }));
// The Postgres limiter behaves like the in-memory one (its own SQL is tested in lib/rate-limit.test.ts)
vi.mock("@/lib/rate-limit-db", async () => {
  const { rateLimit } = await import("@/lib/rate-limit");
  return { rateLimitDb: async (key: string, opts: { maxAttempts?: number; windowMs?: number }) => rateLimit(key, opts) };
});
vi.mock("next-auth/providers/credentials", () => ({ default: (cfg: unknown) => cfg }));
vi.mock("next-auth", () => ({
  default: (config: NonNullable<typeof captured.config>) => {
    captured.config = config;
    return { handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() };
  },
}));

import "@/lib/auth";
import { POST as verifyOtp } from "@/app/api/auth/verify-otp/route";
import { VERIFIED_OTP_WINDOW_MS } from "@/lib/validations/auth";

const phoneLogin = () => captured.config!.providers.find((p) => p.id === "credentials")!;
const verify = (phone: string, code: string, ip = "1.1.1.1") =>
  verifyOtp(new Request("http://x", { method: "POST", headers: { "x-forwarded-for": ip }, body: JSON.stringify({ phone, code }) }));

beforeEach(() => {
  vi.clearAllMocks();
  db.user.findUnique.mockResolvedValue({ id: "u1", firstName: "يزن", role: "USER", gender: "MALE", status: "ACTIVE" });
});

describe("sign-in with a verified code", () => {
  it("only accepts a code sent in the last 30 minutes, and uses it up", async () => {
    db.otp.findFirst.mockResolvedValue({ id: "o1" });
    const before = Date.now();
    expect(await phoneLogin().authorize({ phone: "0790000001", otp: "123456" })).toMatchObject({ id: "u1" });
    const where = db.otp.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ phone: "962790000001", code: "123456", verified: true });
    expect(where.createdAt.gt.getTime()).toBeGreaterThanOrEqual(before - VERIFIED_OTP_WINDOW_MS - 5);
    expect(db.otp.deleteMany).toHaveBeenCalledWith({ where: { phone: "962790000001", verified: true } });
  });

  it("keeps the code when there is no account yet (login → register hand-off)", async () => {
    db.otp.findFirst.mockResolvedValue({ id: "o1" });
    db.user.findUnique.mockResolvedValue(null);
    expect(await phoneLogin().authorize({ phone: "0790000002", otp: "123456" })).toBeNull();
    expect(db.otp.deleteMany).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/verify-otp", () => {
  it("stops after 5 tries on one phone and throws the code away", async () => {
    db.otp.findFirst.mockResolvedValue(null);
    for (let i = 0; i < 5; i++) expect((await verify("0790000003", "000000")).status).toBe(400);
    const res = await verify("0790000003", "123456");
    expect(res.status).toBe(429);
    expect(db.otp.deleteMany).toHaveBeenCalledWith({ where: { phone: "962790000003", verified: false } });
  });

  it("stops one device guessing across many phones", async () => {
    db.otp.findFirst.mockResolvedValue(null);
    for (let i = 0; i < 30; i++) await verify(`07900001${String(i).padStart(2, "0")}`, "000000", "9.9.9.9");
    expect((await verify("0790000200", "000000", "9.9.9.9")).status).toBe(429);
  });
});
