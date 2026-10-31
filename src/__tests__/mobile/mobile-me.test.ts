import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const db = vi.hoisted(() => ({
  countrySetting: { findMany: vi.fn() },
  user: { findUnique: vi.fn() },
}));
const auth = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/auth", () => auth);
vi.mock("@/lib/settings", () => ({ getSetting: async () => "" }));

import { clearCountrySettingsCache } from "@/lib/countries/settings";
import { mobileMe } from "@/lib/mobile-me";
import { GET } from "@/app/api/mobile/me/route";

const user = {
  id: "u1",
  firstName: "سارة",
  lastName: "أ",
  gender: "FEMALE",
  phone: "962796922292",
  country: "JO",
  matchCredits: 3,
  status: "VERIFIED",
  isDeactivated: true,
  createdAt: new Date(),
  profile: { isComplete: true },
  deletionRequest: null as null | { scheduledAt: Date; cancelledAt: Date | null },
};

beforeEach(() => {
  vi.clearAllMocks();
  clearCountrySettingsCache();
  db.countrySetting.findMany.mockResolvedValue([]);
  auth.requireUser.mockResolvedValue({ session: { user: { id: "u1" } } });
});

describe("mobileMe: pending deletion", () => {
  it("no request → deletion null", async () => {
    db.user.findUnique.mockResolvedValue(user);
    expect((await mobileMe("u1"))?.deletion).toBeNull();
  });

  it("a pending request gives the scheduled date; a cancelled one gives nothing", async () => {
    const scheduledAt = new Date("2026-11-30T10:00:00Z");
    db.user.findUnique.mockResolvedValue({ ...user, deletionRequest: { scheduledAt, cancelledAt: null } });
    expect((await mobileMe("u1"))?.deletion).toEqual({ scheduledFor: scheduledAt });
    db.user.findUnique.mockResolvedValue({ ...user, deletionRequest: { scheduledAt, cancelledAt: new Date() } });
    expect((await mobileMe("u1"))?.deletion).toBeNull();
  });
});

describe("GET /api/mobile/me", () => {
  it("lets a paused account through and shows its deletion date", async () => {
    const scheduledAt = new Date("2026-11-30T10:00:00Z");
    db.user.findUnique.mockResolvedValue({ ...user, deletionRequest: { scheduledAt, cancelledAt: null } });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(auth.requireUser).toHaveBeenCalledWith({ allowDeactivated: true });
    expect((await res.json()).user).toMatchObject({ deactivated: true, deletion: { scheduledFor: scheduledAt.toISOString() } });
  });

  it("a suspended account answers 403 SUSPENDED (the app shows its own page instead of retrying)", async () => {
    auth.requireUser.mockResolvedValue({ error: NextResponse.json({ error: "تم إيقاف حسابك" }, { status: 403 }) });
    const res = await GET();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "تم إيقاف حسابك", code: "SUSPENDED" });
  });

  it("not signed in stays 401", async () => {
    auth.requireUser.mockResolvedValue({ error: NextResponse.json({ error: "غير مصرح" }, { status: 401 }) });
    expect((await GET()).status).toBe(401);
  });
});
