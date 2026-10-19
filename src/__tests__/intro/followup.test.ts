import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  mutualMatch: { findFirst: vi.fn(), update: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
  block: { findFirst: vi.fn() },
  conversation: { update: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
  suggestion: { updateMany: vi.fn() },
  visitRequest: { findMany: vi.fn(), updateMany: vi.fn() },
}));
const notifyMod = vi.hoisted(() => ({ notify: vi.fn(), notifyMany: vi.fn() }));
const state = vi.hoisted(() => ({
  cancelPendingBetween: vi.fn(),
  isUnavailable: (u: { isDeactivated?: boolean } | null) => !u || !!u.isDeactivated,
  loadMatchStates: vi.fn(async () => new Map()),
  LEGACY_ADMIN_VISIT: ["FAMILIES_CONTACTED", "SCHEDULED", "COMPLETED"],
}));
const refunds = vi.hoisted(() => ({ refundUnansweredInterests: vi.fn() }));
const reports = vi.hoisted(() => ({ endPausedChats: vi.fn(async () => 0) }));
vi.mock("@/lib/reports", () => reports);
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/notify", () => notifyMod);
vi.mock("@/lib/matches/state", () => state);
vi.mock("@/lib/suggestions/mutual", () => refunds);
vi.mock("@/lib/ably", () => ({ publishChatEvent: vi.fn(async () => {}) }));
vi.mock("@/lib/settings", () => ({ getCycleFlags: vi.fn(async () => ({ introRequests: true, chat: true })) }));

import {
  setMatchOutcome, runFamilyFollowUps, remindGuardianShare, FollowUpError, cancelClosedLegacyVisits, isEngaged, NOT_ENGAGED,
} from "@/lib/intro/followup";

const match = (over: Record<string, unknown> = {}) => ({
  id: "m1", femaleId: "f1", maleId: "u1", femaleOutcome: null, maleOutcome: null, conversation: null, ...over,
});
const awake = { isDeactivated: false, status: "ACTIVE" };

beforeEach(() => {
  vi.clearAllMocks();
  db.block.findFirst.mockResolvedValue(null);
  db.mutualMatch.updateMany.mockResolvedValue({ count: 1 });
  state.loadMatchStates.mockResolvedValue(new Map());
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

  it("G55: «لم يحصل نصيب» also ends a chat paused for review, for good", async () => {
    db.mutualMatch.findFirst.mockResolvedValue(match({ conversation: { id: "c1", status: "ENDED" } }));
    await setMatchOutcome({ matchId: "m1", userId: "u1", outcome: "NOT_A_MATCH" });
    expect(reports.endPausedChats).toHaveBeenCalledWith({ id: "m1" }, { endedById: "u1" });
  });

  it("G55: «تمت الخطبة» ends paused chats on my other open matches", async () => {
    db.mutualMatch.findFirst.mockResolvedValue(match());
    state.loadMatchStates.mockResolvedValue(new Map([["m2", { closed: null, partnerId: "p2" }]]));
    db.conversation.findUnique.mockResolvedValue({ id: "c2", status: "ENDED" });
    await setMatchOutcome({ matchId: "m1", userId: "f1", outcome: "ENGAGED" });
    expect(reports.endPausedChats).toHaveBeenCalledWith({ id: "m2" }, { endedById: "f1" });
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

describe("after-match gaps", () => {
  it("«لم يحصل نصيب» resets the partner's «تمت الخطبة» on that match", async () => {
    db.mutualMatch.findFirst.mockResolvedValue(match({ femaleOutcome: "ENGAGED" }));
    await setMatchOutcome({ matchId: "m1", userId: "u1", outcome: "NOT_A_MATCH" });
    expect(db.mutualMatch.update).toHaveBeenCalledWith({
      where: { id: "m1" },
      data: { maleOutcome: "NOT_A_MATCH", maleOutcomeAt: expect.any(Date), femaleOutcome: null, femaleOutcomeAt: expect.any(Date) },
    });
  });

  it("«تمت الخطبة» closes all my open shared suggestions, also those I said «مهتم» to", async () => {
    db.mutualMatch.findFirst.mockResolvedValue(match());
    await setMatchOutcome({ matchId: "m1", userId: "f1", outcome: "ENGAGED" });
    expect(db.suggestion.updateMany).toHaveBeenCalledWith({
      where: { flow: "MUTUAL", status: "PENDING", OR: [{ recipientId: "f1" }, { candidateId: "f1" }] },
      data: { status: "EXPIRED", expiresAt: expect.any(Date) },
    });
  });

  it("«تمت الخطبة» closes my other open matches: chat ended, requests cancelled, partner told", async () => {
    db.mutualMatch.findFirst.mockResolvedValue(match());
    state.loadMatchStates.mockResolvedValue(new Map([
      ["m1", { closed: null, partnerId: "u1" }],
      ["m2", { closed: null, partnerId: "u2" }],
      ["m3", { closed: "finished", partnerId: "u3" }],
    ]));
    db.conversation.findUnique.mockResolvedValue({ id: "c2", status: "ACTIVE" });
    db.conversation.updateMany.mockResolvedValue({ count: 1 });
    await setMatchOutcome({ matchId: "m1", userId: "f1", outcome: "ENGAGED" });
    expect(state.cancelPendingBetween).toHaveBeenCalledWith("f1", "u2");
    expect(state.cancelPendingBetween).not.toHaveBeenCalledWith("f1", "u3");
    expect(db.conversation.updateMany).toHaveBeenCalledWith({
      where: { id: "c2", status: "ACTIVE" },
      data: { status: "ENDED", endedById: "f1", endedAt: expect.any(Date) },
    });
    expect(notifyMod.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: "u2", title: "انتهى أحد التوافقات", url: "/dashboard/matches?match=m2" }));
    expect(notifyMod.notify).not.toHaveBeenCalledWith(expect.objectContaining({ userId: "u3" }));
  });

  it("an ENGAGED the partner answered with «لم يحصل نصيب» doesn't keep me out of suggestions", async () => {
    db.mutualMatch.count.mockResolvedValue(0);
    expect(await isEngaged("f1")).toBe(false);
    const where = db.mutualMatch.count.mock.calls[0][0].where;
    expect(where.OR[0]).toMatchObject({ femaleId: "f1", femaleOutcome: "ENGAGED", OR: [{ maleOutcome: null }, { maleOutcome: { not: "NOT_A_MATCH" } }] });
    expect(NOT_ENGAGED.matchesAsFemale).toEqual({
      none: { femaleOutcome: "ENGAGED", OR: [{ maleOutcome: null }, { maleOutcome: { not: "NOT_A_MATCH" } }] },
    });
  });

  it("follow-ups: closed rows are filtered in the query, oldest asked first, old-flow visits included", async () => {
    db.mutualMatch.findMany.mockResolvedValue([]);
    await runFamilyFollowUps(new Date());
    const q = db.mutualMatch.findMany.mock.calls[0][0];
    const text = JSON.stringify(q.where);
    expect(text).toContain("visitRequest");
    expect(text).toContain("NOT_A_MATCH");
    expect(text).toContain("SUSPENDED");
    expect(q.orderBy[0]).toEqual({ followUpSentAt: { sort: "asc", nulls: "first" } });
  });

  it("follow-ups: a blocked pair is marked as asked without using up a follow-up", async () => {
    db.mutualMatch.findMany.mockResolvedValue([
      { ...match(), followUpCount: 1, followUpSentAt: null, female: awake, male: awake, openedAt: null },
    ]);
    db.block.findFirst.mockResolvedValue({ id: "b1" });
    expect(await runFamilyFollowUps(new Date())).toEqual({ matches: 0, notified: 0 });
    expect(db.mutualMatch.updateMany).toHaveBeenCalledWith({
      where: { id: "m1", followUpCount: 1, followUpSentAt: null },
      data: { followUpSentAt: expect.any(Date) },
    });
    expect(notifyMod.notifyMany).not.toHaveBeenCalled();
  });

  it("guardian-share reminder skips an engaged match (claimed, not sent)", async () => {
    db.mutualMatch.findMany.mockResolvedValue([
      { id: "m1", femaleId: "f1", maleId: "u1", femaleGuardianShareAt: new Date(), femaleOutcome: "ENGAGED", maleOutcome: null, female: awake, male: awake },
    ]);
    expect(await remindGuardianShare(new Date())).toEqual({ reminded: 0 });
    expect(db.mutualMatch.updateMany).toHaveBeenCalled();
  });
});

describe("cancelClosedLegacyVisits", () => {
  const visit = (over: object = {}, updatedAt = new Date()) => ({
    id: "v1", updatedAt,
    match: {
      femaleId: "f1", maleId: "u1", femaleOutcome: null, maleOutcome: null, female: awake, male: awake,
      conversation: null, introRequests: [], ...over,
    },
  });

  it("closes an untouched REQUESTED visit after 30 days while the new cycle is on", async () => {
    db.visitRequest.findMany.mockResolvedValue([visit({}, new Date(Date.now() - 31 * 24 * 60 * 60 * 1000))]);
    db.visitRequest.updateMany.mockResolvedValue({ count: 1 });
    expect(await cancelClosedLegacyVisits()).toEqual({ cancelled: 1 });
    expect(db.visitRequest.updateMany.mock.calls[0][0].data.adminNotes).toMatch(/no admin action for 30 days/);
  });

  it("keeps a recent open one, and walks the queue page by page", async () => {
    const page = Array.from({ length: 300 }, (_, i) => ({ ...visit(), id: `v${i}` }));
    db.visitRequest.findMany.mockResolvedValueOnce(page).mockResolvedValueOnce([visit({ femaleOutcome: "NOT_A_MATCH" })]);
    db.visitRequest.updateMany.mockResolvedValue({ count: 1 });
    expect(await cancelClosedLegacyVisits()).toEqual({ cancelled: 1 });
    expect(db.visitRequest.findMany).toHaveBeenCalledTimes(2);
    expect(db.visitRequest.findMany.mock.calls[1][0]).toMatchObject({ cursor: { id: "v299" }, skip: 1 });
  });
});
