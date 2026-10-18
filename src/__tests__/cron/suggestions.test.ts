import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  suggestion: { updateMany: vi.fn(), findMany: vi.fn() },
  block: { findFirst: vi.fn(), findMany: vi.fn() },
  user: { findMany: vi.fn() },
  mutualMatch: { findMany: vi.fn() },
}));
const notifyMod = vi.hoisted(() => ({ notify: vi.fn(), notifyMany: vi.fn() }));
const settings = vi.hoisted(() => ({ getCycleFlags: vi.fn() }));
const auto = vi.hoisted(() => ({ autoSuggestForUser: vi.fn(), weeklyCounts: vi.fn(), openCounts: vi.fn(), MAX_OPEN_SUGGESTIONS: 5 }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/notify", () => notifyMod);
vi.mock("@/lib/settings", () => settings);
vi.mock("@/lib/matching/auto-suggest", () => auto);
const createMutualMatch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/intro/match", () => ({ createMutualMatch }));

import { expireMutualSuggestionsAll, healMissingMatches, remindMutualSuggestions, runWeeklySuggestions } from "@/lib/cron/suggestions";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-10-16T06:00:00Z");
const party = (id: string, gender = "MALE", over: object = {}) => ({ id, gender, isDeactivated: false, status: "ACTIVE", ...over });
const row = (over: object = {}) => ({
  id: "s1", recipientId: "u1", candidateId: "f1", recipientDecision: null, candidateDecision: null,
  recipient: party("u1"), candidate: party("f1", "FEMALE"), ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.suggestion.updateMany.mockResolvedValue({ count: 1 });
  db.suggestion.findMany.mockResolvedValue([]);
  db.block.findFirst.mockResolvedValue(null);
  db.block.findMany.mockResolvedValue([]);
  db.mutualMatch.findMany.mockResolvedValue([]);
  db.user.findMany.mockResolvedValue([]);
  settings.getCycleFlags.mockResolvedValue({ introRequests: true, chat: true, mutualSuggestions: true });
  auto.weeklyCounts.mockResolvedValue(new Map());
  auto.openCounts.mockResolvedValue(new Map());
  auto.autoSuggestForUser.mockResolvedValue(0);
});

describe("expireMutualSuggestionsAll", () => {
  it("closes every MUTUAL row past its 7 days, like the lazy path", async () => {
    db.suggestion.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 3 });
    expect(await expireMutualSuggestionsAll(now)).toEqual({ expired: 3, rejected: 0, refunded: 0 });
    expect(db.suggestion.updateMany).toHaveBeenCalledWith({
      where: { flow: "MUTUAL", status: "PENDING", expiresAt: { lte: now } },
      data: { status: "EXPIRED" },
    });
  });

  it("first closes older rows one side declined as REJECTED (G03, like the lazy path)", async () => {
    db.suggestion.updateMany.mockResolvedValueOnce({ count: 2 }).mockResolvedValueOnce({ count: 0 });
    expect(await expireMutualSuggestionsAll(now)).toEqual({ expired: 0, rejected: 2, refunded: 0 });
    expect(db.suggestion.updateMany.mock.calls[0][0]).toEqual({
      where: {
        flow: "MUTUAL",
        status: "PENDING",
        OR: [{ recipientDecision: "DECLINED" }, { candidateDecision: "DECLINED" }],
      },
      data: { status: "REJECTED" },
    });
  });
});

describe("healMissingMatches (G40)", () => {
  const accepted = (id: string, m: string, f: string) => ({
    id, recipientId: m, candidateId: f, recipient: party(m), candidate: party(f, "FEMALE"),
  });

  it("orders oldest first and filters left / suspended people in the query", async () => {
    await healMissingMatches(now);
    const args = db.suggestion.findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual([{ updatedAt: "asc" }, { id: "asc" }]);
    expect(args.where).toMatchObject({
      flow: "MUTUAL",
      status: "ACCEPTED",
      recipient: { isDeactivated: false, status: { not: "SUSPENDED" } },
      candidate: { isDeactivated: false, status: { not: "SUSPENDED" } },
    });
  });

  it("skips matched and blocked pairs and heals the live row behind them", async () => {
    db.suggestion.findMany.mockResolvedValueOnce([
      accepted("done", "m1", "f1"),
      accepted("blocked", "m2", "f2"),
      accepted("live", "m3", "f3"),
    ]);
    db.mutualMatch.findMany.mockResolvedValue([{ femaleId: "f1", maleId: "m1" }]);
    db.block.findMany.mockResolvedValue([{ blockerId: "m2", blockedId: "f2" }]);
    expect(await healMissingMatches(now)).toEqual({ healed: 1 });
    expect(createMutualMatch).toHaveBeenCalledTimes(1);
    expect(createMutualMatch).toHaveBeenCalledWith({ femaleId: "f3", maleId: "m3", suggestionId: "live" });
  });

  it("pages past a full batch of rows that can't be healed", async () => {
    const full = Array.from({ length: 500 }, (_, i) => accepted(`s${i}`, `m${i}`, `f${i}`));
    db.suggestion.findMany.mockResolvedValueOnce(full).mockResolvedValueOnce([accepted("late", "mx", "fx")]);
    db.mutualMatch.findMany
      .mockResolvedValueOnce(full.map((r) => ({ femaleId: r.candidateId, maleId: r.recipientId })))
      .mockResolvedValueOnce([]);
    expect(await healMissingMatches(now)).toEqual({ healed: 1 });
    expect(db.suggestion.findMany.mock.calls[1][0]).toMatchObject({ cursor: { id: "s499" }, skip: 1 });
    expect(createMutualMatch).toHaveBeenCalledWith({ femaleId: "fx", maleId: "mx", suggestionId: "late" });
  });
});

describe("remindMutualSuggestions", () => {
  it("reminds both sides once when neither decided and ≤2 days are left", async () => {
    db.suggestion.findMany.mockResolvedValue([row()]);
    const res = await remindMutualSuggestions(now);
    const where = db.suggestion.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ flow: "MUTUAL", status: "PENDING", reminderSentAt: null });
    expect(where.expiresAt).toEqual({ gt: now, lte: new Date(now.getTime() + 2 * DAY) });
    expect(notifyMod.notify).toHaveBeenCalledTimes(2);
    const female = notifyMod.notify.mock.calls.find((c) => c[0].userId === "f1")![0];
    expect(female.body).toContain("تقرّري");
    expect(female.url).toBe("/dashboard/suggestions");
    expect(res).toEqual({ suggestions: 1, reminded: 2 });
  });

  it("only reminds the undecided side (and says nothing about the other's answer)", async () => {
    db.suggestion.findMany.mockResolvedValue([row({ recipientDecision: "INTERESTED" })]);
    await remindMutualSuggestions(now);
    expect(notifyMod.notify).toHaveBeenCalledTimes(1);
    const call = notifyMod.notify.mock.calls[0][0];
    expect(call.userId).toBe("f1");
    expect(call.body).not.toMatch(/رفض|مهتم/);
  });

  it("sends no reminder when the other side already said «لا» (it can't become a match)", async () => {
    db.suggestion.findMany.mockResolvedValue([row({ recipientDecision: "DECLINED" })]);
    const res = await remindMutualSuggestions(now);
    expect(notifyMod.notify).not.toHaveBeenCalled();
    expect(res).toEqual({ suggestions: 0, reminded: 0 });
  });

  it("skips claimed rows, blocks and inactive people", async () => {
    db.suggestion.findMany.mockResolvedValue([
      row({ id: "a" }),
      row({ id: "b" }),
      row({ id: "c", candidate: party("f1", "FEMALE", { isDeactivated: true }) }),
    ]);
    db.suggestion.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValue({ count: 1 });
    db.block.findFirst.mockResolvedValueOnce({ id: "blk" });
    const res = await remindMutualSuggestions(now);
    expect(notifyMod.notify).not.toHaveBeenCalled();
    expect(res).toEqual({ suggestions: 0, reminded: 0 });
  });
});

describe("runWeeklySuggestions", () => {
  it("does nothing in legacy mode (a suggestion would cost a credit)", async () => {
    settings.getCycleFlags.mockResolvedValue({ introRequests: false, chat: false, mutualSuggestions: false });
    const res = await runWeeklySuggestions(now);
    expect(res.skipped).toBe("switch_off");
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it("asks only for eligible, active, non-flagged users and skips those at the weekly cap", async () => {
    db.user.findMany.mockResolvedValue([{ id: "a" }, { id: "b" }, { id: "c" }]);
    auto.weeklyCounts.mockResolvedValue(new Map([["b", 3]]));
    auto.autoSuggestForUser.mockImplementation(async (id: string) => (id === "a" ? 3 : 0));
    const res = await runWeeklySuggestions(now);

    const where = db.user.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      role: "USER", isDeactivated: false, status: { not: "SUSPENDED" }, isFlagged: false, profile: { isComplete: true },
    });
    expect(where.OR).toBeDefined(); // activity filter
    expect(auto.autoSuggestForUser.mock.calls.map((c) => c[0])).toEqual(["a", "c"]);
    expect(res).toEqual({ eligible: 2, processed: 2, created: 3, failed: 0 });
  });

  it("selects users with < 5 open when credit-on-interest is on (the weekly counts are not used)", async () => {
    settings.getCycleFlags.mockResolvedValue({ introRequests: true, chat: true, mutualSuggestions: true, creditOnInterest: true });
    db.user.findMany.mockResolvedValue([{ id: "a" }, { id: "b" }, { id: "c" }]);
    auto.openCounts.mockResolvedValue(new Map([["a", 4], ["b", 5], ["c", 0]]));
    const res = await runWeeklySuggestions(now);
    expect(auto.weeklyCounts).not.toHaveBeenCalled();
    expect(auto.autoSuggestForUser.mock.calls.map((c) => c[0])).toEqual(["a", "c"]);
    expect(res.eligible).toBe(2);
  });

  it("respects the per-run limit and keeps going after a failure", async () => {
    db.user.findMany.mockResolvedValue([{ id: "a" }, { id: "b" }, { id: "c" }]);
    auto.autoSuggestForUser.mockRejectedValueOnce(new Error("boom")).mockResolvedValue(1);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await runWeeklySuggestions(now, 2);
    spy.mockRestore();
    expect(auto.autoSuggestForUser).toHaveBeenCalledTimes(2);
    expect(res).toEqual({ eligible: 3, processed: 2, created: 1, failed: 1 });
  });
});
