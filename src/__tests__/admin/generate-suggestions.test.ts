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
vi.mock("@/lib/notify", () => ({ notify: vi.fn(), notifyMany: vi.fn() }));
vi.mock("@/lib/intro/match", () => ({ createMutualMatch: vi.fn() }));
vi.mock("@/lib/onesignal", () => ({ sendPushNotification: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  requireAdmin: vi.fn(async () => ({ session: { user: { id: "admin1", role: "ADMIN" } } })),
}));
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
});

describe("admin Generate with credit-on-interest", () => {
  it("uses the open cap (5 minus open) and the min score 50", async () => {
    // m1 has 3 open as recipient -> only 2 more; f3 scores 40 and is dropped
    scores.byId.set("f3", 40);
    db.user.findMany.mockResolvedValue([
      person("m1", "MALE"),
      ...["f1", "f2", "f3", "f4", "f5"].map((id) => person(id, "FEMALE")),
    ]);
    db.suggestion.groupBy
      .mockResolvedValueOnce([{ recipientId: "m1", _count: 3 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const res = (await generate())!;
    expect(res.status).toBe(200);
    const forM1 = db.suggestion.create.mock.calls.map((c) => c[0].data).filter((d) => d.recipientId === "m1");
    expect(forM1).toHaveLength(2);
    expect(forM1.some((d) => d.candidateId === "f3")).toBe(false);
    expect(forM1.every((d) => d.compatibilityScore >= 50 && d.flow === "MUTUAL")).toBe(true);
  });

  it("skips a candidate who already holds 5 open", async () => {
    db.user.findMany.mockResolvedValue([person("m1", "MALE"), person("busy", "FEMALE"), person("free", "FEMALE")]);
    db.suggestion.groupBy
      .mockResolvedValueOnce([{ recipientId: "busy", _count: 5 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    await generate();
    const forM1 = db.suggestion.create.mock.calls.map((c) => c[0].data).filter((d) => d.recipientId === "m1");
    expect(forM1.map((d) => d.candidateId)).toEqual(["free"]);
  });

  it("keeps the weekly cap of 3 and score 30 with the flag off", async () => {
    flags.getCycleFlags.mockResolvedValue({ ...on, creditOnInterest: false });
    scores.byId.set("f3", 40);
    db.user.findMany.mockResolvedValue([person("m1", "MALE"), ...["f1", "f2", "f3"].map((id) => person(id, "FEMALE"))]);
    await generate();
    const forM1 = db.suggestion.create.mock.calls.map((c) => c[0].data).filter((d) => d.recipientId === "m1");
    expect(forM1).toHaveLength(3);
    expect(forM1.some((d) => d.candidateId === "f3")).toBe(true);
  });
});
