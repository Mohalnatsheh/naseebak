import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  mutualMatch: { findFirst: vi.fn(), update: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
  block: { findFirst: vi.fn() },
  conversation: { update: vi.fn() },
  suggestion: { updateMany: vi.fn() },
}));
const notifyMod = vi.hoisted(() => ({ notify: vi.fn(), notifyMany: vi.fn() }));
const state = vi.hoisted(() => ({ cancelPendingBetween: vi.fn(), isUnavailable: (u: { isDeactivated?: boolean } | null) => !u || !!u.isDeactivated }));
const refunds = vi.hoisted(() => ({ refundUnansweredInterests: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/notify", () => notifyMod);
vi.mock("@/lib/matches/state", () => state);
vi.mock("@/lib/suggestions/mutual", () => refunds);
vi.mock("@/lib/ably", () => ({ publishChatEvent: vi.fn(async () => {}) }));

import { setMatchOutcome, runFamilyFollowUps, remindGuardianShare, FollowUpError } from "@/lib/intro/followup";

const match = (over: Record<string, unknown> = {}) => ({
  id: "m1", femaleId: "f1", maleId: "u1", femaleOutcome: null, maleOutcome: null, conversation: null, ...over,
});
const awake = { isDeactivated: false, status: "ACTIVE" };

beforeEach(() => {
  vi.clearAllMocks();
  db.block.findFirst.mockResolvedValue(null);
  db.mutualMatch.updateMany.mockResolvedValue({ count: 1 });
});

describe("setMatchOutcome", () => {
  it("«لم يحصل نصيب» ends an open chat, cancels requests and tells the partner", async () => {
    db.mutualMatch.findFirst.mockResolvedValue(match({ conversation: { id: "c1", status: "ACTIVE" } }));
    await setMatchOutcome({ matchId: "m1", userId: "u1", outcome: "NOT_A_MATCH" });
    expect(db.mutualMatch.update).toHaveBeenCalledWith({ where: { id: "m1" }, data: { maleOutcome: "NOT_A_MATCH", maleOutcomeAt: expect.any(Date) } });
    expect(db.conversation.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "c1" }, data: expect.objectContaining({ status: "ENDED", endedById: "u1" }) }));
    expect(state.cancelPendingBetween).toHaveBeenCalledWith("u1", "f1");
    expect(notifyMod.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: "f1", title: "انتهى التعارف" }));
  });

  it("«تمت الخطبة» closes my open suggestions, refunds others and asks the partner to confirm", async () => {
    db.mutualMatch.findFirst.mockResolvedValue(match());
    await setMatchOutcome({ matchId: "m1", userId: "f1", outcome: "ENGAGED" });
    expect(db.suggestion.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "EXPIRED" }) }));
    expect(refunds.refundUnansweredInterests).toHaveBeenCalledWith(expect.objectContaining({ userId: "f1" }));
    expect(notifyMod.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", title: "مبارك! 🎉" }));
  });

  it("is refused once the match was ended, and hidden when the partner blocked me", async () => {
    db.mutualMatch.findFirst.mockResolvedValue(match({ femaleOutcome: "NOT_A_MATCH" }));
    await expect(setMatchOutcome({ matchId: "m1", userId: "u1", outcome: "ENGAGED" })).rejects.toBeInstanceOf(FollowUpError);
    db.mutualMatch.findFirst.mockResolvedValue(match());
    db.block.findFirst.mockResolvedValue({ id: "b1" });
    await expect(setMatchOutcome({ matchId: "m1", userId: "u1", outcome: "CONTINUING" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("runFamilyFollowUps", () => {
  it("asks each side that hasn't answered or is still continuing, and counts the follow-up", async () => {
    db.mutualMatch.findMany.mockResolvedValue([
      { ...match({ maleOutcome: "CONTINUING" }), followUpCount: 0, followUpSentAt: null, female: awake, male: awake, openedAt: null },
      { ...match({ id: "m2", femaleOutcome: "NOT_A_MATCH" }), followUpCount: 0, followUpSentAt: null, female: awake, male: awake, openedAt: null },
      { ...match({ id: "m3" }), followUpCount: 0, followUpSentAt: null, female: awake, male: awake, openedAt: new Date(), femaleGuardianShareAt: new Date(), maleGuardianShareAt: null },
    ]);
    const r = await runFamilyFollowUps(new Date());
    expect(r).toEqual({ matches: 1, notified: 2 });
    expect(notifyMod.notifyMany).toHaveBeenCalledWith(["f1", "u1"], expect.objectContaining({ title: "كيف يسير التعارف العائلي؟" }));
    expect(db.mutualMatch.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ followUpCount: { increment: 1 } }) }));
  });
});

describe("remindGuardianShare", () => {
  it("reminds the side that hasn't shared, once", async () => {
    db.mutualMatch.findMany.mockResolvedValue([
      { id: "m1", femaleId: "f1", maleId: "u1", femaleGuardianShareAt: new Date(), femaleOutcome: null, maleOutcome: null, female: awake, male: awake },
    ]);
    expect(await remindGuardianShare(new Date())).toEqual({ reminded: 1 });
    expect(notifyMod.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", title: "بانتظار مشاركة بيانات وليّ أمرك" }));
  });
});
