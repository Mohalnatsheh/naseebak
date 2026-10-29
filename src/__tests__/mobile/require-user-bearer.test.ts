import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({ user: { findUnique: vi.fn() } }));
const authMock = vi.hoisted(() => vi.fn());
const headerStore = vi.hoisted(() => ({ authorization: null as string | null }));
const mobile = vi.hoisted(() => ({ sessionFromBearer: vi.fn() }));

vi.mock("@/lib/db", () => ({ db }));
vi.mock("next-auth/providers/credentials", () => ({ default: (cfg: unknown) => cfg }));
vi.mock("next-auth", () => ({ default: () => ({ handlers: {}, auth: authMock, signIn: vi.fn(), signOut: vi.fn() }) }));
vi.mock("next/headers", () => ({ headers: async () => ({ get: (k: string) => (k === "authorization" ? headerStore.authorization : null) }) }));
vi.mock("@/lib/mobile-auth", () => mobile);

import { currentSession, requireAdmin, requireUser } from "@/lib/auth";

const tokenSession = { user: { id: "u9", role: "USER" }, expires: "2026-12-01T00:00:00Z" };

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue(null);
  headerStore.authorization = null;
  mobile.sessionFromBearer.mockResolvedValue(null);
  db.user.findUnique.mockResolvedValue({ status: "ACTIVE", isDeactivated: false, role: "USER" });
});

describe("requireUser with a mobile Bearer token", () => {
  it("the web cookie still wins when present", async () => {
    authMock.mockResolvedValue({ user: { id: "u1", role: "USER" } });
    headerStore.authorization = "Bearer nsb_x";
    expect((await currentSession())?.user?.id).toBe("u1");
    expect(mobile.sessionFromBearer).not.toHaveBeenCalled();
  });

  it("a valid token signs the member in for every member route", async () => {
    headerStore.authorization = "Bearer nsb_x";
    mobile.sessionFromBearer.mockResolvedValue(tokenSession);
    const r = await requireUser();
    expect("session" in r && r.session.user.id).toBe("u9");
    expect(mobile.sessionFromBearer).toHaveBeenCalledWith("Bearer nsb_x");
  });

  it("no cookie and no valid token → 401", async () => {
    const r = await requireUser();
    expect("error" in r && r.error.status).toBe(401);
  });

  it("suspended and paused accounts are refused with a token too", async () => {
    mobile.sessionFromBearer.mockResolvedValue(tokenSession);
    db.user.findUnique.mockResolvedValue({ status: "SUSPENDED", isDeactivated: false });
    expect("error" in (await requireUser()) && true).toBe(true);
    db.user.findUnique.mockResolvedValue({ status: "ACTIVE", isDeactivated: true });
    const paused = await requireUser();
    expect("error" in paused && paused.error.status).toBe(403);
    expect("session" in (await requireUser({ allowDeactivated: true }))).toBe(true);
  });

  it("admin routes never accept a token", async () => {
    headerStore.authorization = "Bearer nsb_x";
    mobile.sessionFromBearer.mockResolvedValue({ user: { id: "a1", role: "ADMIN" } });
    const r = await requireAdmin();
    expect("error" in r && r.error.status).toBe(403);
  });
});
