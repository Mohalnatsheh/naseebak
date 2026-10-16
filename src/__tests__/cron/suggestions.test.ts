import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  suggestion: { updateMany: vi.fn(), findMany: vi.fn() },
  block: { findFirst: vi.fn() },
  user: { findMany: vi.fn() },
}));
const notifyMod = vi.hoisted(() => ({ notify: vi.fn(), notifyMany: vi.fn() }));
const settings = vi.hoisted(() => ({ getCycleFlags: vi.fn() }));
const auto = vi.hoisted(() => ({ autoSuggestForUser: vi.fn(), weeklyCounts: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/notify", () => notifyMod);
vi.mock("@/lib/settings", () => settings);
vi.mock("@/lib/matching/auto-suggest", () => auto);
vi.mock("@/lib/intro/match", () => ({ createMutualMatch: vi.fn() }));

import { expireMutualSuggestionsAll, remindMutualSuggestions, runWeeklySuggestions } from "@/lib/cron/suggestions";

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
  db.user.findMany.mockResolvedValue([]);
  settings.getCycleFlags.mockResolvedValue({ introRequests: true, chat: true, mutualSuggestions: true });
  auto.weeklyCounts.mockResolvedValue(new Map());
  auto.autoSuggestForUser.mockResolvedValue(0);
});

describe("expireMutualSuggestionsAll", () => {
  it("closes every MUTUAL row past its 14 days, like the lazy path", async () => {
    db.suggestion.updateMany.mockResolvedValue({ count: 3 });
    expect(await expireMutualSuggestionsAll(now)).toEqual({ expired: 3 });
    expect(db.suggestion.updateMany).toHaveBeenCalledWith({
      where: { flow: "MUTUAL", status: "PENDING", expiresAt: { lte: now } },
      data: { status: "EXPIRED" },
    });
  });
});

describe("remindMutualSuggestions", () => {
  it("reminds both sides once when neither decided and ≤3 days are left", async () => {
    db.suggestion.findMany.mockResolvedValue([row()]);
    const res = await remindMutualSuggestions(now);
    const where = db.suggestion.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ flow: "MUTUAL", status: "PENDING", reminderSentAt: null });
    expect(where.expiresAt).toEqual({ gt: now, lte: new Date(now.getTime() + 3 * DAY) });
    expect(notifyMod.notify).toHaveBeenCalledTimes(2);
    const female = notifyMod.notify.mock.calls.find((c) => c[0].userId === "f1")![0];
    expect(female.body).toContain("تقرّري");
    expect(female.url).toBe("/dashboard/suggestions");
    expect(res).toEqual({ suggestions: 1, reminded: 2 });
  });

  it("only reminds the undecided side (and says nothing about the other's answer)", async () => {
    db.suggestion.findMany.mockResolvedValue([row({ recipientDecision: "DECLINED" })]);
    await remindMutualSuggestions(now);
    expect(notifyMod.notify).toHaveBeenCalledTimes(1);
    const call = notifyMod.notify.mock.calls[0][0];
    expect(call.userId).toBe("f1");
    expect(call.body).not.toMatch(/رفض|لا/);
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
