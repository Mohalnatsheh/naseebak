import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), findMany: vi.fn() },
  suggestion: { count: vi.fn(), findMany: vi.fn(), create: vi.fn(), createMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  mutualMatch: { count: vi.fn(), findMany: vi.fn() },
  block: { findMany: vi.fn() },
}));
const flags = vi.hoisted(() => ({
  getCycleFlags: vi.fn(async () => ({ introRequests: true, chat: true, mutualSuggestions: true, creditOnInterest: true })),
}));
const notifyMock = vi.hoisted(() => ({ notify: vi.fn(), notifyMany: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/settings", () => flags);
vi.mock("@/lib/notify", () => notifyMock);
vi.mock("@/lib/profile-completeness", () => ({ meetsSuggestionGate: () => true }));
vi.mock("@/lib/matching/score", () => ({
  calculateCompatibility: vi.fn(() => 80),
  mutuallyAcceptable: vi.fn(() => true),
}));

import { memberSuggestStatus } from "@/lib/admin/members-suggest-reason";

const member = {
  id: "u1", gender: "MALE", country: "JO", role: "USER", status: "PENDING", isDeactivated: false, isFlagged: false,
  matchCredits: 3, phone: "962790000001", lastActiveAt: new Date(), updatedAt: new Date(), profile: { isComplete: true },
};

beforeEach(() => {
  vi.clearAllMocks();
  db.user.findUnique.mockResolvedValue(member);
  db.user.findMany.mockResolvedValue([{ id: "u2" }, { id: "u3" }]);
  db.suggestion.count.mockResolvedValue(0);
  db.suggestion.findMany.mockResolvedValue([]);
  db.mutualMatch.count.mockResolvedValue(0);
  db.mutualMatch.findMany.mockResolvedValue([]);
  db.block.findMany.mockResolvedValue([]);
});

describe("memberSuggestStatus", () => {
  it("unknown member: null", async () => {
    db.user.findUnique.mockResolvedValue(null);
    expect(await memberSuggestStatus("x")).toBeNull();
  });

  it("no reason while the member has open cards", async () => {
    db.suggestion.count.mockResolvedValue(2);
    const s = await memberSuggestStatus("u1");
    expect(s).toMatchObject({ reason: null, openInterests: 2 });
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it("names what stops the run: suspended, flagged", async () => {
    db.user.findUnique.mockResolvedValue({ ...member, status: "SUSPENDED" });
    expect((await memberSuggestStatus("u1"))?.reason).toBe("suspended");
    db.user.findUnique.mockResolvedValue({ ...member, isFlagged: true });
    expect((await memberSuggestStatus("u1"))?.reason).toBe("flagged");
  });

  it("no_candidates when nobody suitable is left, ready with the count when some are", async () => {
    expect(await memberSuggestStatus("u1")).toMatchObject({ reason: "ready", candidates: 2 });
    db.user.findMany.mockResolvedValue([]);
    expect(await memberSuggestStatus("u1")).toMatchObject({ reason: "no_candidates", candidates: 0 });
  });

  it("is read-only: never writes a card or a notification", async () => {
    await memberSuggestStatus("u1");
    expect(db.suggestion.create).not.toHaveBeenCalled();
    expect(db.suggestion.createMany).not.toHaveBeenCalled();
    expect(db.suggestion.update).not.toHaveBeenCalled();
    expect(db.suggestion.updateMany).not.toHaveBeenCalled();
    expect(notifyMock.notify).not.toHaveBeenCalled();
    expect(notifyMock.notifyMany).not.toHaveBeenCalled();
  });
});
