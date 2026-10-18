import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({ user: { findUnique: vi.fn() }, suggestion: { findMany: vi.fn(), updateMany: vi.fn() } }));
const score = vi.hoisted(() => ({ calculateCompatibility: vi.fn(), mutuallyAcceptable: vi.fn() }));
const auto = vi.hoisted(() => ({ autoSuggestForUser: vi.fn(), minSuggestionScore: vi.fn(() => 50), scoringSelect: {} }));
const flags = vi.hoisted(() => ({ value: { mutualSuggestions: true, creditOnInterest: true } }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/matching/score", () => score);
vi.mock("@/lib/matching/auto-suggest", () => auto);
vi.mock("@/lib/settings", () => ({ getCycleFlags: vi.fn(async () => flags.value) }));

import { refreshOpenSuggestions } from "@/lib/suggestions/refresh";

const me = { id: "u1", gender: "MALE", profile: { city: "عمّان" } };
const person = (id: string) => ({ id, gender: "FEMALE", profile: {} });
const row = (id: string, other: string, extra: Record<string, unknown> = {}) => ({
  id, source: "AI", compatibilityScore: 70, recipientId: "u1", recipientDecision: null, candidateDecision: null,
  recipient: me, candidate: person(other), ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  flags.value = { mutualSuggestions: true, creditOnInterest: true };
  db.user.findUnique.mockResolvedValue(me);
  db.suggestion.updateMany.mockResolvedValue({ count: 1 });
  score.mutuallyAcceptable.mockReturnValue(true);
  auto.autoSuggestForUser.mockResolvedValue(0);
});

describe("refreshOpenSuggestions", () => {
  it("only looks at open shared rows I haven't answered", async () => {
    db.suggestion.findMany.mockResolvedValue([]);
    await refreshOpenSuggestions("u1");
    const where = db.suggestion.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ flow: "MUTUAL", status: "PENDING" });
    expect(where.OR).toEqual([
      { recipientId: "u1", recipientDecision: null },
      { candidateId: "u1", candidateDecision: null },
    ]);
  });

  it("updates the % on rows that still fit and leaves unchanged ones alone", async () => {
    db.suggestion.findMany.mockResolvedValue([row("s1", "a"), row("s2", "b")]);
    score.calculateCompatibility.mockImplementation((_r: unknown, c: { id: string }) => (c.id === "a" ? 82 : 70));
    const r = await refreshOpenSuggestions("u1");
    expect(r).toEqual({ rescored: 1, closed: 0 });
    expect(db.suggestion.updateMany).toHaveBeenCalledTimes(1);
    expect(db.suggestion.updateMany).toHaveBeenCalledWith({
      where: { id: "s1", status: "PENDING", recipientDecision: null },
      data: { compatibilityScore: 82 },
    });
  });

  it("closes rows that drop under the minimum or break a dealbreaker, then tops up", async () => {
    db.suggestion.findMany.mockResolvedValue([row("low", "a"), row("db", "b"), row("ok", "c")]);
    score.calculateCompatibility.mockImplementation((_r: unknown, c: { id: string }) => (c.id === "a" ? 40 : 70));
    score.mutuallyAcceptable.mockImplementation((_m: unknown, o: { id: string }) => o.id !== "b");
    db.suggestion.updateMany.mockResolvedValue({ count: 2 });
    const r = await refreshOpenSuggestions("u1");
    expect(r.closed).toBe(2);
    const close = db.suggestion.updateMany.mock.calls.find((c) => c[0].data.status === "EXPIRED")![0];
    expect(close.where.id).toEqual({ in: ["low", "db"] });
    expect(close.data).toEqual({ status: "EXPIRED", expiresAt: expect.any(Date) });
    expect(auto.autoSuggestForUser).toHaveBeenCalledWith("u1");
  });

  it("keeps a row the other side said «مهتم» on, with the new %", async () => {
    db.suggestion.findMany.mockResolvedValue([row("paid", "a", { candidateDecision: "INTERESTED" })]);
    score.calculateCompatibility.mockReturnValue(30);
    const r = await refreshOpenSuggestions("u1");
    expect(r).toEqual({ rescored: 1, closed: 0 });
    expect(db.suggestion.updateMany.mock.calls.every((c) => c[0].data.status !== "EXPIRED")).toBe(true);
  });

  it("the close re-checks that the other side hasn't said «مهتم» meanwhile", async () => {
    db.suggestion.findMany.mockResolvedValue([row("low", "a")]);
    score.calculateCompatibility.mockReturnValue(10);
    await refreshOpenSuggestions("u1");
    const close = db.suggestion.updateMany.mock.calls.find((c) => c[0].data.status === "EXPIRED")![0];
    expect(close.where.OR).toEqual([
      { recipientId: "u1", recipientDecision: null, OR: [{ candidateDecision: null }, { candidateDecision: "DECLINED" }] },
      { candidateId: "u1", candidateDecision: null, OR: [{ recipientDecision: null }, { recipientDecision: "DECLINED" }] },
    ]);
  });

  it("never closes an admin hand-pick for its score (dealbreakers still apply)", async () => {
    db.suggestion.findMany.mockResolvedValue([row("adm", "a", { source: "ADMIN" })]);
    score.calculateCompatibility.mockReturnValue(20);
    const r = await refreshOpenSuggestions("u1");
    expect(r.closed).toBe(0);
  });

  it("scores in the row's own order when I am the candidate", async () => {
    db.suggestion.findMany.mockResolvedValue([
      { ...row("s1", "x"), recipientId: "b", recipient: person("b"), candidate: me },
    ]);
    score.calculateCompatibility.mockReturnValue(75);
    await refreshOpenSuggestions("u1");
    const [r, c] = score.calculateCompatibility.mock.calls[0];
    expect(r.id).toBe("b");
    expect(c.id).toBe("u1");
    expect(db.suggestion.updateMany.mock.calls[0][0].where).toMatchObject({ candidateDecision: null });
  });

  it("only tops up when shared suggestions are off", async () => {
    flags.value = { mutualSuggestions: false, creditOnInterest: false };
    expect(await refreshOpenSuggestions("u1")).toEqual({ rescored: 0, closed: 0 });
    expect(db.suggestion.findMany).not.toHaveBeenCalled();
    expect(auto.autoSuggestForUser).toHaveBeenCalledWith("u1");
  });
});
