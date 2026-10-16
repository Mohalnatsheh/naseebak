import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  mutualMatch: { findUnique: vi.fn(), updateMany: vi.fn() },
  block: { findMany: vi.fn() },
  introRequest: { findMany: vi.fn(), updateMany: vi.fn() },
  parentInfo: { findUnique: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn() },
}));
const auth = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/auth", () => auth);
vi.mock("@/lib/settings", () => ({
  getCycleFlags: vi.fn(async () => ({ introRequests: true, chat: true, mutualSuggestions: true, creditOnInterest: true })),
}));
vi.mock("@/lib/intro/outcome", () => ({ applyIntroOutcome: vi.fn(async () => "NONE") }));
vi.mock("@/lib/notify", () => ({ notify: vi.fn(), notifyMany: vi.fn() }));
vi.mock("@/lib/credits", () => ({ reserveCredits: vi.fn(), notifyRequestCreditsExhausted: vi.fn(), recordCredit: vi.fn() }));

import { POST } from "@/app/api/matches/[id]/guardian-share/route";

const OPENED = new Date(Date.now() - 24 * 60 * 60 * 1000);
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (body?: object) =>
  POST(new Request("http://x", { method: "POST", body: body ? JSON.stringify(body) : undefined }), params("m1"));
const openedMatch = (over: object = {}) => ({
  id: "m1", femaleId: "f1", maleId: "u1", suggestionId: "s1", openedAt: OPENED,
  femaleGuardianShareAt: OPENED, maleGuardianShareAt: null, visitRequest: null, conversation: null, ...over,
});
const guardian = (consented: boolean) => ({
  userId: "x", parentName: "أبو يزن", parentPhone: "962790000000", relationship: "father",
  shareConsentAt: consented ? new Date() : null,
});

beforeEach(() => {
  vi.clearAllMocks();
  auth.requireUser.mockResolvedValue({ session: { user: { id: "u1" } } });
  db.mutualMatch.findUnique.mockResolvedValue(openedMatch());
  db.mutualMatch.updateMany.mockResolvedValue({ count: 1 });
  db.block.findMany.mockResolvedValue([]);
  db.introRequest.findMany.mockResolvedValue([
    { id: "o1", matchId: "m1", type: "FAMILY", status: "ACCEPTED", senderId: "f1", receiverId: "u1",
      respondedAt: OPENED, expiresAt: OPENED, createdAt: OPENED },
  ]);
  db.introRequest.updateMany.mockResolvedValue({ count: 0 });
  db.parentInfo.findUnique.mockResolvedValue(guardian(true));
  db.user.findUnique.mockResolvedValue({ matchCredits: 0, isDeactivated: false, status: "VERIFIED" });
});

describe("POST /api/matches/[id]/guardian-share", () => {
  it("guardian-share stamps only my side and requires consent", async () => {
    db.parentInfo.findUnique.mockResolvedValue(guardian(false));
    const refused = await post();
    expect(refused.status).toBe(412);
    expect((await refused.json()).code).toBe("CONSENT_REQUIRED");
    expect(db.mutualMatch.updateMany).not.toHaveBeenCalled();

    const res = await post({ consent: true });
    expect(res.status).toBe(200);
    expect(db.parentInfo.update).toHaveBeenCalledWith({ where: { userId: "u1" }, data: { shareConsentAt: expect.any(Date) } });
    expect(db.mutualMatch.updateMany).toHaveBeenCalledTimes(1);
    expect(db.mutualMatch.updateMany).toHaveBeenCalledWith({
      where: { id: "m1", maleGuardianShareAt: null },
      data: { maleGuardianShareAt: expect.any(Date) },
    });
    const state = await res.json();
    expect(state.family.status).toBe("accepted");
    expect(state.outcome).toBe("FAMILY");
  });

  it("with global consent already given, no body is needed", async () => {
    const res = await post();
    expect(res.status).toBe(200);
    expect(db.parentInfo.update).not.toHaveBeenCalled();
    expect(db.mutualMatch.updateMany).toHaveBeenCalledWith({
      where: { id: "m1", maleGuardianShareAt: null },
      data: { maleGuardianShareAt: expect.any(Date) },
    });
  });

  it("needs a guardian", async () => {
    db.parentInfo.findUnique.mockResolvedValue(null);
    const res = await post({ consent: true });
    expect(res.status).toBe(412);
    expect((await res.json()).code).toBe("GUARDIAN_REQUIRED");
    expect(db.mutualMatch.updateMany).not.toHaveBeenCalled();
  });

  it("only a party to the match can share", async () => {
    auth.requireUser.mockResolvedValue({ session: { user: { id: "stranger" } } });
    expect((await post({ consent: true })).status).toBe(404);
    expect(db.mutualMatch.updateMany).not.toHaveBeenCalled();
  });

  it("is refused for a pre-flag match (global consent rule applies there)", async () => {
    db.mutualMatch.findUnique.mockResolvedValue(openedMatch({ openedAt: null }));
    expect((await post({ consent: true })).status).toBe(409);
    expect(db.mutualMatch.updateMany).not.toHaveBeenCalled();
  });

  it("is refused once I blocked the partner", async () => {
    db.block.findMany.mockResolvedValue([{ id: "b1", blockerId: "u1" }]);
    expect((await post({ consent: true })).status).toBe(403);
    expect(db.mutualMatch.updateMany).not.toHaveBeenCalled();
  });

  it("returns the auth error for signed-out users", async () => {
    auth.requireUser.mockResolvedValue({ error: new Response(null, { status: 401 }) });
    expect((await post()).status).toBe(401);
  });
});
