import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  $transaction: vi.fn(),
  suggestion: { findMany: vi.fn(), updateMany: vi.fn() },
  creditLedger: { findFirst: vi.fn(), create: vi.fn() },
  user: { update: vi.fn() },
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
});

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

  it("closes the other open cards without the stamp, then runs the refund for the person blocked", async () => {
    await closeSuggestionsBetween("me", "them");
    const second = db.suggestion.updateMany.mock.calls[1][0];
    expect(second.where.OR).toEqual([
      { recipientId: "me", candidateId: "them" },
      { recipientId: "them", candidateId: "me" },
    ]);
    expect(second.data).not.toHaveProperty("interestRefundedAt");
    expect(db.suggestion.findMany).toHaveBeenCalledTimes(1);
  });

  it("skips the refund run when nothing else was open", async () => {
    db.suggestion.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await closeSuggestionsBetween("me", "them");
    expect(db.suggestion.findMany).not.toHaveBeenCalled();
  });
});
