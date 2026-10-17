import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  otp: { findFirst: vi.fn() },
  user: { findUnique: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
}));
const authMock = vi.hoisted(() => vi.fn());
const captured = vi.hoisted(() => ({ config: null as null | { providers: { id: string; authorize: (c: unknown) => unknown }[] } }));

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: () => ({ success: true }) }));
vi.mock("next-auth/providers/credentials", () => ({ default: (cfg: unknown) => cfg }));
vi.mock("next-auth", () => ({
  default: (config: NonNullable<typeof captured.config>) => {
    captured.config = config;
    return { handlers: {}, auth: authMock, signIn: vi.fn(), signOut: vi.fn() };
  },
}));

import { requireUser, sessionAccountGate } from "@/lib/auth";

const phoneLogin = () => captured.config!.providers.find((p) => p.id === "credentials")!;
const baseUser = { id: "u1", email: "phone_962790000000@naseeb.local", firstName: "يزن", role: "USER", gender: "MALE", isVerified: false };

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ user: { id: "u1", role: "USER" } });
  db.otp.findFirst.mockResolvedValue({ id: "o1" });
});

describe("phone sign-in", () => {
  it("lets a deactivated (not suspended) user sign in", async () => {
    db.user.findUnique.mockResolvedValue({ ...baseUser, status: "ACTIVE", isDeactivated: true });
    const user = await phoneLogin().authorize({ phone: "0790000000", otp: "111111" });
    expect(user).toMatchObject({ id: "u1", role: "USER" });
    // Sign-in records "last active" (conditional: at most once per hour)
    expect(db.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "u1" }), data: { lastActiveAt: expect.any(Date) } })
    );
  });

  it("still refuses suspended users", async () => {
    db.user.findUnique.mockResolvedValue({ ...baseUser, status: "SUSPENDED", isDeactivated: false });
    expect(await phoneLogin().authorize({ phone: "0790000000", otp: "111111" })).toBeNull();
  });

  it("refuses suspended users even when deactivated", async () => {
    db.user.findUnique.mockResolvedValue({ ...baseUser, status: "SUSPENDED", isDeactivated: true });
    expect(await phoneLogin().authorize({ phone: "0790000000", otp: "111111" })).toBeNull();
  });

  it("refuses an unverified code", async () => {
    db.otp.findFirst.mockResolvedValue(null);
    expect(await phoneLogin().authorize({ phone: "0790000000", otp: "000000" })).toBeNull();
  });
});

describe("requireUser", () => {
  it("rejects anonymous requests", async () => {
    authMock.mockResolvedValue(null);
    const r = await requireUser();
    expect("error" in r && r.error.status).toBe(401);
  });

  it("passes active users", async () => {
    db.user.findUnique.mockResolvedValue({ status: "ACTIVE", isDeactivated: false });
    const r = await requireUser();
    expect("session" in r).toBe(true);
  });

  it("rejects deactivated users by default", async () => {
    db.user.findUnique.mockResolvedValue({ status: "ACTIVE", isDeactivated: true });
    const r = await requireUser();
    expect("error" in r).toBe(true);
    if ("error" in r) {
      expect(r.error.status).toBe(403);
      expect((await r.error.json()).code).toBe("DEACTIVATED");
    }
  });

  it("lets deactivated users through reactivation routes", async () => {
    db.user.findUnique.mockResolvedValue({ status: "ACTIVE", isDeactivated: true });
    const r = await requireUser({ allowDeactivated: true });
    expect("session" in r).toBe(true);
  });

  it("rejects suspended users even on reactivation routes", async () => {
    db.user.findUnique.mockResolvedValue({ status: "SUSPENDED", isDeactivated: true });
    const r = await requireUser({ allowDeactivated: true });
    expect("error" in r && r.error.status).toBe(403);
  });
});

describe("sessionAccountGate (dashboard guard)", () => {
  it("is deactivated for a deactivated account", async () => {
    db.user.findUnique.mockResolvedValue({ status: "VERIFIED", isDeactivated: true });
    expect(await sessionAccountGate()).toBe("deactivated");
  });

  it("is suspended for a suspended account, even when also deactivated", async () => {
    db.user.findUnique.mockResolvedValue({ status: "SUSPENDED", isDeactivated: true });
    expect(await sessionAccountGate()).toBe("suspended");
  });

  it("is null for active accounts and anonymous visitors", async () => {
    db.user.findUnique.mockResolvedValue({ status: "VERIFIED", isDeactivated: false });
    expect(await sessionAccountGate()).toBeNull();
    authMock.mockResolvedValue(null);
    expect(await sessionAccountGate()).toBeNull();
  });
});
