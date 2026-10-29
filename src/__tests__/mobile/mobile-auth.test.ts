import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  mobileSession: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));

import { bearerToken, createMobileSession, hashMobileToken, revokeMobileToken, sessionFromBearer } from "@/lib/mobile-auth";

const NOW = new Date("2026-10-29T12:00:00Z");
const row = (over: Record<string, unknown> = {}) => ({
  id: "s1",
  expiresAt: new Date("2026-12-01T00:00:00Z"),
  revokedAt: null,
  lastUsedAt: NOW,
  user: { id: "u1", email: "phone_9627@naseeb.local", firstName: "سارة", role: "USER", gender: "FEMALE", isVerified: false },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.mobileSession.update.mockResolvedValue({});
});

describe("mobile tokens", () => {
  it("stores only a hash of a random token, valid for 60 days", async () => {
    const { token, expiresAt } = await createMobileSession("u1", "android", NOW);
    expect(token).toMatch(/^nsb_[A-Za-z0-9_-]{40,}$/);
    const data = db.mobileSession.create.mock.calls[0][0].data;
    expect(data.tokenHash).toBe(hashMobileToken(token));
    expect(JSON.stringify(data)).not.toContain(token);
    expect(expiresAt.getTime() - NOW.getTime()).toBe(60 * 24 * 60 * 60 * 1000);
  });

  it("reads only well-formed Bearer headers", () => {
    expect(bearerToken("Bearer nsb_abc")).toBe("nsb_abc");
    expect(bearerToken("bearer nsb_abc")).toBe("nsb_abc");
    expect(bearerToken("Bearer eyJhbGciOi")).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });

  it("a valid token gives the member's session", async () => {
    db.mobileSession.findUnique.mockResolvedValue(row());
    const s = await sessionFromBearer("Bearer nsb_x", NOW);
    expect(s?.user).toMatchObject({ id: "u1", role: "USER", gender: "FEMALE" });
    expect(db.mobileSession.findUnique.mock.calls[0][0].where).toEqual({ tokenHash: hashMobileToken("nsb_x") });
  });

  it("expired, revoked, unknown and admin tokens give nothing", async () => {
    db.mobileSession.findUnique.mockResolvedValue(row({ expiresAt: new Date("2026-10-01T00:00:00Z") }));
    expect(await sessionFromBearer("Bearer nsb_x", NOW)).toBeNull();
    db.mobileSession.findUnique.mockResolvedValue(row({ revokedAt: NOW }));
    expect(await sessionFromBearer("Bearer nsb_x", NOW)).toBeNull();
    db.mobileSession.findUnique.mockResolvedValue(null);
    expect(await sessionFromBearer("Bearer nsb_x", NOW)).toBeNull();
    db.mobileSession.findUnique.mockResolvedValue(row({ user: { ...row().user, role: "ADMIN" } }));
    expect(await sessionFromBearer("Bearer nsb_x", NOW)).toBeNull();
  });

  it("records use at most every 10 minutes", async () => {
    db.mobileSession.findUnique.mockResolvedValue(row({ lastUsedAt: new Date(NOW.getTime() - 60_000) }));
    await sessionFromBearer("Bearer nsb_x", NOW);
    expect(db.mobileSession.update).not.toHaveBeenCalled();
    db.mobileSession.findUnique.mockResolvedValue(row({ lastUsedAt: new Date(NOW.getTime() - 11 * 60_000) }));
    await sessionFromBearer("Bearer nsb_x", NOW);
    expect(db.mobileSession.update).toHaveBeenCalledTimes(1);
  });

  it("logout revokes the token by its hash", async () => {
    db.mobileSession.updateMany.mockResolvedValue({ count: 1 });
    expect(await revokeMobileToken("nsb_x", NOW)).toBe(true);
    expect(db.mobileSession.updateMany).toHaveBeenCalledWith({ where: { tokenHash: hashMobileToken("nsb_x"), revokedAt: null }, data: { revokedAt: NOW } });
  });
});
