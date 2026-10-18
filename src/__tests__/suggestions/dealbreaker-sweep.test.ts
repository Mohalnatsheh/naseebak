import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({ user: { findUnique: vi.fn() }, suggestion: { findMany: vi.fn(), updateMany: vi.fn() } }));
const refunds = vi.hoisted(() => ({ refundUnansweredInterests: vi.fn() }));
const score = vi.hoisted(() => ({ mutuallyAcceptable: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/suggestions/mutual", () => refunds);
vi.mock("@/lib/matching/score", () => score);

import { closeSuggestionsBreakingDealbreakers } from "@/lib/suggestions/dealbreaker-sweep";

beforeEach(() => {
  vi.clearAllMocks();
  db.user.findUnique.mockResolvedValue({ id: "u1", gender: "MALE", profile: { dealbreakers: ["city"] } });
  db.suggestion.updateMany.mockResolvedValue({ count: 1 });
});

describe("closeSuggestionsBreakingDealbreakers", () => {
  it("closes only undecided open rows that now fail, refunds, and returns the count", async () => {
    db.suggestion.findMany.mockResolvedValue([
      { id: "s1", recipientId: "u1", recipient: { id: "u1" }, candidate: { id: "a" } },
      { id: "s2", recipientId: "b", recipient: { id: "b" }, candidate: { id: "u1" } },
    ]);
    score.mutuallyAcceptable.mockImplementation((_me: unknown, other: { id: string }) => other.id !== "a");
    expect(await closeSuggestionsBreakingDealbreakers("u1")).toBe(1);
    expect(db.suggestion.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["s1"] },
        status: "PENDING",
        OR: [
          { recipientId: "u1", recipientDecision: null },
          { candidateId: "u1", candidateDecision: null },
        ],
      },
      data: { status: "EXPIRED", expiresAt: expect.any(Date) },
    });
    expect(refunds.refundUnansweredInterests).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1" }));
    // Undecided rows only: the query skips rows I already answered
    expect(db.suggestion.findMany.mock.calls[0][0].where.OR).toEqual([
      { recipientId: "u1", recipientDecision: null },
      { candidateId: "u1", candidateDecision: null },
    ]);
  });

  it("does nothing when every open row still passes", async () => {
    db.suggestion.findMany.mockResolvedValue([{ id: "s1", recipientId: "u1", recipient: { id: "u1" }, candidate: { id: "a" } }]);
    score.mutuallyAcceptable.mockReturnValue(true);
    expect(await closeSuggestionsBreakingDealbreakers("u1")).toBe(0);
    expect(db.suggestion.updateMany).not.toHaveBeenCalled();
  });
});
