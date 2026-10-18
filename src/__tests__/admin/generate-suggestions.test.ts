import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  user: { findMany: vi.fn() },
  suggestion: { findMany: vi.fn(), create: vi.fn(), groupBy: vi.fn() },
  mutualMatch: { findMany: vi.fn() },
  block: { findMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));
const flags = vi.hoisted(() => ({ getCycleFlags: vi.fn() }));
vi.mock("@/lib/settings", () => flags);
const notifyMod = vi.hoisted(() => ({ notify: vi.fn(), notifyMany: vi.fn() }));
vi.mock("@/lib/notify", () => notifyMod);
vi.mock("@/lib/intro/match", () => ({ createMutualMatch: vi.fn() }));
vi.mock("@/lib/onesignal", () => ({ sendPushNotification: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  requireAdmin: vi.fn(async () => ({ session: { user: { id: "admin1", role: "ADMIN" } } })),
}));
const auto = vi.hoisted(() => ({ autoSuggestForUser: vi.fn(), minSuggestionScore: vi.fn(() => 30) }));
vi.mock("@/lib/matching/auto-suggest", () => auto);
const scores = vi.hoisted(() => ({ byId: new Map<string, number>() }));
vi.mock("@/lib/matching/score", () => ({
  calculateCompatibility: (_a: unknown, b: { id: string }) => scores.byId.get(b.id) ?? 70,
  mutuallyAcceptable: () => true,
}));

import { POST as generate } from "@/app/api/admin/suggestions/generate/route";

const person = (id: string, gender: "MALE" | "FEMALE") => ({
  id, gender, matchCredits: 10, profile: { isComplete: true },
  personalityResult: null, photos: [], identityDoc: null, parentInfo: null,
});
const on = { introRequests: true, chat: true, mutualSuggestions: true, creditOnInterest: true };

beforeEach(() => {
  vi.clearAllMocks();
  scores.byId.clear();
  flags.getCycleFlags.mockResolvedValue(on);
  db.suggestion.findMany.mockResolvedValue([]);
  db.suggestion.create.mockResolvedValue({});
  db.suggestion.groupBy.mockResolvedValue([]);
  db.mutualMatch.findMany.mockResolvedValue([]);
  db.block.findMany.mockResolvedValue([]);
  auto.autoSuggestForUser.mockResolvedValue(0);
});

describe("admin Generate with shared suggestions on", () => {
  it("runs the automatic top-up for each eligible, active user (new-cycle rules, once-a-day notices)", async () => {
    db.user.findMany.mockResolvedValue([{ id: "m1" }, { id: "f1" }, { id: "f2" }]);
    auto.autoSuggestForUser.mockImplementation(async (id: string) => (id === "m1" ? 2 : id === "f1" ? 1 : 0));
    const res = (await generate())!;
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ count: 3 });
    expect(auto.autoSuggestForUser.mock.calls.map((c) => c[0])).toEqual(["m1", "f1", "f2"]);
    const where = db.user.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ role: "USER", isDeactivated: false, isFlagged: false, profile: { isComplete: true } });
    // Idle 30+ days are left out (activeWhere)
    expect(where.OR).toHaveLength(2);
    // Nothing is created or announced outside autoSuggestForUser
    expect(db.suggestion.create).not.toHaveBeenCalled();
    expect(notifyMod.notify).not.toHaveBeenCalled();
  });

  it("same path with credit on interest off (per-request shared flow)", async () => {
    flags.getCycleFlags.mockResolvedValue({ ...on, creditOnInterest: false });
    db.user.findMany.mockResolvedValue([{ id: "m1" }]);
    await generate();
    expect(auto.autoSuggestForUser).toHaveBeenCalledWith("m1");
    expect(db.suggestion.create).not.toHaveBeenCalled();
  });

  it("one user's failure does not stop the run", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    db.user.findMany.mockResolvedValue([{ id: "bad" }, { id: "ok" }]);
    auto.autoSuggestForUser.mockImplementation(async (id: string) => {
      if (id === "bad") throw new Error("boom");
      return 1;
    });
    const res = (await generate())!;
    expect(res.status).toBe(200);
    expect((await res.json()).count).toBe(1);
    spy.mockRestore();
  });
});

describe("admin Generate with shared suggestions off", () => {
  it("keeps the weekly cap of 3 and score 30 in per-request mode", async () => {
    flags.getCycleFlags.mockResolvedValue({ introRequests: true, chat: true, mutualSuggestions: false, creditOnInterest: false });
    scores.byId.set("f3", 40);
    db.user.findMany.mockResolvedValue([person("m1", "MALE"), ...["f1", "f2", "f3"].map((id) => person(id, "FEMALE"))]);
    await generate();
    const forM1 = db.suggestion.create.mock.calls.map((c) => c[0].data).filter((d) => d.recipientId === "m1");
    expect(forM1).toHaveLength(3);
    expect(forM1.some((d) => d.candidateId === "f3")).toBe(true);
    expect(forM1.every((d) => d.flow === undefined)).toBe(true);
    expect(auto.autoSuggestForUser).not.toHaveBeenCalled();
  });
});
