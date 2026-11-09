import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  $transaction: vi.fn(),
  suggestion: { findMany: vi.fn(), updateMany: vi.fn() },
  creditLedger: { findFirst: vi.fn(), create: vi.fn() },
  user: { update: vi.fn() },
  block: { findMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/notify", () => ({ notify: vi.fn(async () => {}), notifyMany: vi.fn() }));
vi.mock("@/lib/settings", () => ({ getCycleFlags: vi.fn(async () => ({ creditOnInterest: true })) }));
vi.mock("@/lib/intro/match", () => ({ createMutualMatch: vi.fn() }));

import { closeSuggestionsBetween } from "@/lib/suggestions/mutual";

beforeEach(() => {
  vi.clearAllMocks();
  db.suggestion.findMany.mockResolvedValue([]);
  db.suggestion.updateMany.mockResolvedValue({ count: 1 });
  db.block.findMany.mockResolvedValue([]);
  db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) => fn(db));
});

/** "them" said «مهتم» and was charged; the card was closed by "me" blocking them */
const blockedRow = {
  id: "s9", recipientId: "them", candidateId: "me", recipientDecision: "INTERESTED",
  recipient: { gender: "FEMALE" }, candidate: { gender: "MALE" },
};

describe("closeSuggestionsBetween", () => {
  it("keeps the credit of the person who blocks while waiting: the row is stamped, with no refund", async () => {
    await closeSuggestionsBetween("me", "them");
    const first = db.suggestion.updateMany.mock.calls[0][0];
    expect(first.where.status).toBe("PENDING");
    expect(first.where.OR).toEqual([
      { recipientId: "me", candidateId: "them", recipientDecision: "INTERESTED", candidateDecision: null },
      { recipientId: "them", candidateId: "me", candidateDecision: "INTERESTED", recipientDecision: null },
    ]);
    expect(first.data.status).toBe("EXPIRED");
    expect(first.data.interestRefundedAt).toBeInstanceOf(Date);
  });

  it("leaves a card whose 7 days already ran out to the normal refund", async () => {
    await closeSuggestionsBetween("me", "them");
    const first = db.suggestion.updateMany.mock.calls[0][0];
    expect(first.where.expiresAt.gt).toBeInstanceOf(Date);
  });

  it("closes the other open cards without the stamp; the blocked person's refund is left to the morning job (QA WC-14)", async () => {
    await closeSuggestionsBetween("me", "them");
    const second = db.suggestion.updateMany.mock.calls[1][0];
    expect(second.where.OR).toEqual([
      { recipientId: "me", candidateId: "them" },
      { recipientId: "them", candidateId: "me" },
    ]);
    expect(second.data).not.toHaveProperty("interestRefundedAt");
    // No refund (and so no «أعدنا لك رصيداً» notice) seconds after the block
    expect(db.suggestion.findMany).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("the morning job then refunds the closed card (status EXPIRED, expiresAt = block time, within the look-back)", async () => {
    const { refundUnansweredInterests } = await import("@/lib/suggestions/mutual");
    const now = new Date();
    await refundUnansweredInterests({ now });
    const where = db.suggestion.findMany.mock.calls[0][0].where;
    expect(where.status).toBe("EXPIRED");
    expect(where.interestRefundedAt).toBeNull();
    expect(where.expiresAt.gt.getTime()).toBeLessThan(now.getTime());
  });

  it("a user-scoped sweep (the blocker's own visit expiring another card) never refunds the block-closed card", async () => {
    const { refundUnansweredInterests } = await import("@/lib/suggestions/mutual");
    db.suggestion.findMany.mockResolvedValue([blockedRow]);
    db.block.findMany.mockResolvedValue([{ blockerId: "me", blockedId: "them" }]);
    db.creditLedger.findFirst.mockResolvedValue({ id: "l1" });
    const res = await refundUnansweredInterests({ userId: "me" });
    expect(res.refunded).toBe(0);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("the morning job (no user) refunds it once, with the notice", async () => {
    const { refundUnansweredInterests } = await import("@/lib/suggestions/mutual");
    const { notify } = await import("@/lib/notify");
    db.suggestion.findMany.mockResolvedValue([blockedRow]);
    db.creditLedger.findFirst.mockResolvedValue({ id: "l1" });
    const res = await refundUnansweredInterests({});
    expect(res.refunded).toBe(1);
    expect(db.block.findMany).not.toHaveBeenCalled();
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "them" }, data: { matchCredits: { increment: 1 } } });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ userId: "them", title: "أعدنا لك رصيداً" }));
  });
});
