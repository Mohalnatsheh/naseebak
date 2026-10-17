import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  $transaction: vi.fn(),
  suggestion: { findMany: vi.fn(), updateMany: vi.fn() },
  creditLedger: { findFirst: vi.fn(), create: vi.fn() },
  user: { update: vi.fn() },
}));
const notifyMod = vi.hoisted(() => ({ notify: vi.fn(async () => {}), notifyMany: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/notify", () => notifyMod);
vi.mock("@/lib/settings", () => ({ getCycleFlags: vi.fn(async () => ({ creditOnInterest: true })) }));
vi.mock("@/lib/intro/match", () => ({ createMutualMatch: vi.fn() }));

import { refundUnansweredInterests } from "@/lib/suggestions/mutual";

const now = new Date("2026-10-20T06:00:00Z");
const waitingRow = (over: object = {}) => ({
  id: "s1", recipientId: "u1", candidateId: "f1", recipientDecision: "INTERESTED",
  recipient: { gender: "MALE" }, candidate: { gender: "FEMALE" }, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation(async (fn: (t: typeof db) => unknown) => fn(db));
  db.suggestion.updateMany.mockResolvedValue({ count: 1 });
  db.creditLedger.findFirst.mockResolvedValue({ id: "charge" });
});

describe("refundUnansweredInterests", () => {
  it("only looks at closed rows where one side said «مهتم» and the other never answered", async () => {
    db.suggestion.findMany.mockResolvedValue([]);
    await refundUnansweredInterests({ now });
    const where = db.suggestion.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ flow: "MUTUAL", status: "EXPIRED", interestRefundedAt: null });
    expect(where.AND[0].OR).toEqual([
      { recipientDecision: "INTERESTED", candidateDecision: null },
      { candidateDecision: "INTERESTED", recipientDecision: null },
    ]);
  });

  it("gives the credit back once, records it and tells the person", async () => {
    db.suggestion.findMany.mockResolvedValue([waitingRow()]);
    expect(await refundUnansweredInterests({ now })).toEqual({ refunded: 1 });
    expect(db.suggestion.updateMany).toHaveBeenCalledWith({
      where: { id: "s1", interestRefundedAt: null },
      data: { interestRefundedAt: now },
    });
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { matchCredits: { increment: 1 } } });
    expect(db.creditLedger.create).toHaveBeenCalledWith({
      data: { userId: "u1", delta: 1, reason: "REFUND", refId: "s1" },
    });
    expect(notifyMod.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", type: "PAYMENT" }));
  });

  it("refunds the candidate side when they were the one waiting", async () => {
    db.suggestion.findMany.mockResolvedValue([waitingRow({ recipientDecision: null })]);
    await refundUnansweredInterests({ now });
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "f1" }, data: { matchCredits: { increment: 1 } } });
    expect((notifyMod.notify.mock.calls[0] as unknown as [{ body: string }])[0].body).toContain("أبديتِ");
  });

  it("nothing back without a real charge (e.g. «مهتم» given while credits weren't used)", async () => {
    db.suggestion.findMany.mockResolvedValue([waitingRow()]);
    db.creditLedger.findFirst.mockResolvedValue(null);
    expect(await refundUnansweredInterests({ now })).toEqual({ refunded: 0 });
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("a second run (lazy path vs daily job) refunds nothing", async () => {
    db.suggestion.findMany.mockResolvedValue([waitingRow()]);
    db.suggestion.updateMany.mockResolvedValue({ count: 0 });
    expect(await refundUnansweredInterests({ now })).toEqual({ refunded: 0 });
    expect(db.user.update).not.toHaveBeenCalled();
    expect(notifyMod.notify).not.toHaveBeenCalled();
  });
});
