import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => {
  const d = {
    suggestion: { findUnique: vi.fn(), updateMany: vi.fn() },
    block: { findFirst: vi.fn() },
    parentInfo: { findUnique: vi.fn() },
    mutualMatch: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    introRequest: { findFirst: vi.fn(), create: vi.fn() },
    conversation: { create: vi.fn(), findUnique: vi.fn() },
    visitRequest: { create: vi.fn() },
    creditLedger: { create: vi.fn() },
    user: { updateMany: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
  };
  d.$transaction.mockImplementation(async (fn: (tx: typeof d) => unknown) => fn(d));
  return d;
});
const notifyMod = vi.hoisted(() => {
  const m = { notify: vi.fn(), notifyMany: vi.fn() };
  m.notifyMany.mockImplementation(async (ids: string[], input: object) => {
    for (const userId of ids) await m.notify({ ...input, userId });
  });
  return m;
});
const credits = vi.hoisted(() => ({
  reserveCredits: vi.fn(),
  recordCredit: vi.fn(),
  notifyRequestCreditsExhausted: vi.fn(),
  notifyInterestCreditsExhausted: vi.fn(),
}));
const flags = vi.hoisted(() => ({
  value: { introRequests: true, chat: true, mutualSuggestions: true, creditOnInterest: true },
}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/notify", () => notifyMod);
vi.mock("@/lib/credits", () => credits);
vi.mock("@/lib/settings", () => ({ getCycleFlags: vi.fn(async () => flags.value) }));
vi.mock("@/lib/matching/auto-suggest", () => ({ autoSuggestForUser: vi.fn(async () => 0) }));

import { applyIntroOutcome } from "@/lib/intro/outcome";
import { createMutualMatch } from "@/lib/intro/match";
import { CHAT_TTL_DAYS } from "@/lib/intro/requests";
import { decideSuggestion } from "@/lib/suggestions/mutual";

const DAY = 24 * 60 * 60 * 1000;
const ON = { introRequests: true, chat: true, mutualSuggestions: true, creditOnInterest: true };
const match = { id: "m1", femaleId: "f1", maleId: "u1", suggestionId: "s1" };
/** Recipient is the man (u1), candidate the woman (f1) — the mapping to female/male must follow ids */
const suggestion = (recipient: string | null, candidate: string | null, flow = "MUTUAL") => ({
  id: "s1", flow, recipientId: "u1", candidateId: "f1",
  recipientIntroPreference: recipient, candidateIntroPreference: candidate,
});

function notificationsFor(userId: string) {
  return notifyMod.notify.mock.calls.map((c) => c[0]).filter((n) => n.userId === userId);
}

beforeEach(() => {
  vi.clearAllMocks();
  flags.value = { ...ON };
  db.introRequest.findFirst.mockResolvedValue(null);
  db.introRequest.create.mockImplementation(async ({ data }: { data: object }) => ({ id: "r1", ...data }));
  db.conversation.create.mockResolvedValue({ id: "c1" });
  db.conversation.findUnique.mockResolvedValue({ id: "c1" });
  db.mutualMatch.findUnique.mockResolvedValue(null);
  db.mutualMatch.create.mockImplementation(async ({ data }: { data: object }) => ({ id: "m1", ...data }));
  db.mutualMatch.update.mockResolvedValue({});
  db.$executeRaw.mockResolvedValue(1);
});

describe("applyIntroOutcome", () => {
  it("CHAT+CHAT creates ACCEPTED CHAT request and a Conversation", async () => {
    db.suggestion.findUnique.mockResolvedValue(suggestion("CHAT", "CHAT"));
    const before = Date.now();
    expect(await applyIntroOutcome(match, ON)).toBe("CHAT");
    const { data } = db.introRequest.create.mock.calls[0][0];
    expect(data).toMatchObject({ matchId: "m1", type: "CHAT", status: "ACCEPTED", senderId: "f1", receiverId: "u1" });
    expect(data.respondedAt).toBeInstanceOf(Date);
    expect(data.expiresAt).toBeInstanceOf(Date);
    const conv = db.conversation.create.mock.calls[0][0].data;
    expect(conv.matchId).toBe("m1");
    expect(conv.expiresAt.getTime() - before).toBeGreaterThanOrEqual(CHAT_TTL_DAYS * DAY);
    expect(conv.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(CHAT_TTL_DAYS * DAY);
    expect(db.mutualMatch.update).not.toHaveBeenCalled();
  });

  it("FAMILY+FAMILY creates ACCEPTED FAMILY request and both stamps", async () => {
    db.suggestion.findUnique.mockResolvedValue(suggestion("FAMILY", "FAMILY"));
    expect(await applyIntroOutcome(match, ON)).toBe("FAMILY");
    expect(db.introRequest.create.mock.calls[0][0].data).toMatchObject({
      matchId: "m1", type: "FAMILY", status: "ACCEPTED", senderId: "f1", receiverId: "u1",
    });
    const upd = db.mutualMatch.update.mock.calls[0][0];
    expect(upd.where).toEqual({ id: "m1" });
    expect(upd.data.femaleGuardianShareAt).toBeInstanceOf(Date);
    expect(upd.data.maleGuardianShareAt).toBeInstanceOf(Date);
    expect(db.conversation.create).not.toHaveBeenCalled();
  });

  it("mixed creates FAMILY, stamps only the FAMILY side", async () => {
    // man (recipient) chose CHAT, woman (candidate) chose FAMILY
    db.suggestion.findUnique.mockResolvedValue(suggestion("CHAT", "FAMILY"));
    expect(await applyIntroOutcome(match, ON)).toBe("FAMILY");
    expect(db.introRequest.create.mock.calls[0][0].data.type).toBe("FAMILY");
    const { data } = db.mutualMatch.update.mock.calls[0][0];
    expect(data.femaleGuardianShareAt).toBeInstanceOf(Date);
    expect(data).not.toHaveProperty("maleGuardianShareAt");
    expect(db.conversation.create).not.toHaveBeenCalled();
  });

  it("CHAT+CHAT with chat flag off → NONE", async () => {
    db.suggestion.findUnique.mockResolvedValue(suggestion("CHAT", "CHAT"));
    expect(await applyIntroOutcome(match, { ...ON, chat: false })).toBe("NONE");
    expect(db.introRequest.create).not.toHaveBeenCalled();
    expect(db.conversation.create).not.toHaveBeenCalled();
  });

  it("null preference → NONE (also legacy rows and matches without a suggestion)", async () => {
    db.suggestion.findUnique.mockResolvedValue(suggestion("CHAT", null));
    expect(await applyIntroOutcome(match, ON)).toBe("NONE");
    db.suggestion.findUnique.mockResolvedValue(suggestion(null, null, "LEGACY"));
    expect(await applyIntroOutcome(match, ON)).toBe("NONE");
    db.suggestion.findUnique.mockResolvedValue(null);
    expect(await applyIntroOutcome(match, ON)).toBe("NONE");
    expect(await applyIntroOutcome({ ...match, suggestionId: null }, ON)).toBe("NONE");
    expect(db.introRequest.create).not.toHaveBeenCalled();
    expect(db.mutualMatch.update).not.toHaveBeenCalled();
  });

  it("idempotent on a second call", async () => {
    db.suggestion.findUnique.mockResolvedValue(suggestion("CHAT", "CHAT"));
    await applyIntroOutcome(match, ON);
    db.introRequest.findFirst.mockResolvedValue({ id: "r1" });
    expect(await applyIntroOutcome(match, ON)).toBe("CHAT");
    expect(db.introRequest.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { matchId: "m1", type: "CHAT", status: "ACCEPTED" },
    }));
    expect(db.introRequest.create).toHaveBeenCalledTimes(1);
    expect(db.conversation.create).toHaveBeenCalledTimes(1);
  });
});

describe("applyIntroOutcome serialisation", () => {
  it("locks the match row before the idempotency check", async () => {
    db.suggestion.findUnique.mockResolvedValue(suggestion("CHAT", "CHAT"));
    await applyIntroOutcome(match, ON);
    expect(db.$executeRaw).toHaveBeenCalledTimes(1);
    const [strings, id] = db.$executeRaw.mock.calls[0];
    expect(strings.join("?")).toBe("SELECT 1 FROM mutual_matches WHERE id = ? FOR UPDATE");
    expect(id).toBe("m1");
    expect(db.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(db.introRequest.findFirst.mock.invocationCallOrder[0]);
  });
});

describe("outcome failure after the charge", () => {
  const silence = () => vi.spyOn(console, "error").mockImplementation(() => {});

  it("createMutualMatch still notifies both with the match url when the outcome throws", async () => {
    const spy = silence();
    db.suggestion.findUnique.mockResolvedValue(suggestion("CHAT", "CHAT"));
    db.introRequest.create.mockRejectedValueOnce(new Error("db down"));
    expect(await createMutualMatch({ femaleId: "f1", maleId: "u1", suggestionId: "s1" })).toEqual({ matchId: "m1" });
    for (const id of ["f1", "u1"]) {
      expect(notificationsFor(id)).toEqual([expect.objectContaining({
        type: "MATCH",
        body: "تهانينا! لديك توافق متبادل جديد. يمكنك الآن إرسال طلب تعارف عائلي أو طلب محادثة.",
        url: "/dashboard/matches?match=m1",
      })]);
    }
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("intro outcome failed"), { matchId: "m1" }, expect.any(Error));
    spy.mockRestore();
  });

  it("decideSuggestion returns { match: true } when the outcome throws", async () => {
    const spy = silence();
    const future = new Date(Date.now() + DAY);
    const row = (over: object = {}) => ({
      ...suggestion("CHAT", "CHAT"), status: "PENDING", expiresAt: future,
      recipientDecision: null, candidateDecision: "INTERESTED", ...over,
    });
    db.suggestion.findUnique
      .mockResolvedValueOnce(row())
      .mockResolvedValueOnce(row({ recipientDecision: "INTERESTED" }))
      .mockResolvedValue(row({ recipientDecision: "INTERESTED" }));
    db.suggestion.updateMany.mockResolvedValue({ count: 1 });
    db.block.findFirst.mockResolvedValue(null);
    db.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
      gender: where.id.startsWith("f") ? "FEMALE" : "MALE", matchCredits: 3, isDeactivated: false, status: "VERIFIED",
    }));
    db.user.findUniqueOrThrow.mockResolvedValue({ matchCredits: 2 });
    credits.reserveCredits.mockResolvedValue(true);
    db.introRequest.create.mockRejectedValueOnce(new Error("db down"));
    const res = await decideSuggestion({ suggestionId: "s1", userId: "u1", interested: true, introPreference: "CHAT" });
    expect(res).toMatchObject({ match: true, matchId: "m1" });
    expect(notificationsFor("f1")[0].url).toBe("/dashboard/matches?match=m1");
    expect(notificationsFor("u1")[0].url).toBe("/dashboard/matches?match=m1");
    spy.mockRestore();
  });
});

describe("createMutualMatch with credit_on_interest", () => {
  it("createMutualMatch flag on: openedAt set, no VisitRequest, no credit taken", async () => {
    db.suggestion.findUnique.mockResolvedValue(suggestion("FAMILY", "FAMILY"));
    const res = await createMutualMatch({ femaleId: "f1", maleId: "u1", suggestionId: "s1" });
    expect(res).toEqual({ matchId: "m1" });
    expect(db.mutualMatch.create.mock.calls[0][0].data.openedAt).toBeInstanceOf(Date);
    expect(db.visitRequest.create).not.toHaveBeenCalled();
    expect(credits.reserveCredits).not.toHaveBeenCalled();
    expect(credits.recordCredit).not.toHaveBeenCalled();
    expect(db.creditLedger.create).not.toHaveBeenCalled();
    expect(db.introRequest.create.mock.calls[0][0].data.type).toBe("FAMILY");
  });

  it("one per person, conversation url for CHAT", async () => {
    db.suggestion.findUnique.mockResolvedValue(suggestion("CHAT", "CHAT"));
    await createMutualMatch({ femaleId: "f1", maleId: "u1", suggestionId: "s1" });
    for (const id of ["f1", "u1"]) {
      const mine = notificationsFor(id);
      expect(mine).toHaveLength(1);
      expect(mine[0]).toMatchObject({
        type: "MATCH",
        body: "توافق متبادل! المحادثة مفتوحة الآن",
        url: "/dashboard/chats/c1",
      });
    }
  });

  it("FAMILY+FAMILY: one per person, family text, match url", async () => {
    db.suggestion.findUnique.mockResolvedValue(suggestion("FAMILY", "FAMILY"));
    await createMutualMatch({ femaleId: "f1", maleId: "u1", suggestionId: "s1" });
    for (const id of ["f1", "u1"]) {
      const mine = notificationsFor(id);
      expect(mine).toHaveLength(1);
      expect(mine[0]).toMatchObject({
        body: "توافق متبادل! تم مشاركة بيانات التواصل العائلي",
        url: "/dashboard/matches?match=m1",
      });
    }
  });

  it('mixed CHAT side gets "الطرف الآخر فضّل التعارف العائلي"', async () => {
    db.suggestion.findUnique.mockResolvedValue(suggestion("CHAT", "FAMILY")); // man CHAT, woman FAMILY
    await createMutualMatch({ femaleId: "f1", maleId: "u1", suggestionId: "s1" });
    const her = notificationsFor("f1");
    const him = notificationsFor("u1");
    expect(her).toHaveLength(1);
    expect(him).toHaveLength(1);
    // She chose family: told she waits for his guardian contact (not that it was shared)
    expect(her[0].body).toContain("فضّل الطرف الآخر المحادثة أولاً");
    expect(her[0].body).not.toContain("تم مشاركة");
    // He chose chat: her contact is visible, and he is asked to share his
    expect(him[0].body).toContain("الطرف الآخر فضّل التعارف العائلي");
    expect(him[0].body).toContain("شارك بيانات وليّ أمرك");
    expect(him[0].url).toBe("/dashboard/matches?match=m1");
  });

  it("null preference: today's match text without the credit sentence, request buttons", async () => {
    db.suggestion.findUnique.mockResolvedValue(suggestion(null, null, "LEGACY"));
    await createMutualMatch({ femaleId: "f1", maleId: "u1", suggestionId: "s1" });
    for (const id of ["f1", "u1"]) {
      const mine = notificationsFor(id);
      expect(mine).toHaveLength(1);
      expect(mine[0]).toMatchObject({
        body: "تهانينا! لديك توافق متبادل جديد. يمكنك الآن إرسال طلب تعارف عائلي أو طلب محادثة.",
        url: "/dashboard/matches?match=m1",
      });
      expect(mine[0].body).not.toContain("رصيد");
    }
    expect(db.introRequest.create).not.toHaveBeenCalled();
  });

  it("an existing pair creates nothing and notifies nobody", async () => {
    db.mutualMatch.findUnique.mockResolvedValue({ id: "m0" });
    db.suggestion.findUnique.mockResolvedValue(suggestion("CHAT", "CHAT"));
    expect(await createMutualMatch({ femaleId: "f1", maleId: "u1", suggestionId: "s1" })).toEqual({ matchId: "m0" });
    expect(db.mutualMatch.create).not.toHaveBeenCalled();
    expect(db.introRequest.create).not.toHaveBeenCalled();
    expect(notifyMod.notify).not.toHaveBeenCalled();
  });
});

describe("createMutualMatch with credit_on_interest off", () => {
  it("flag off: unchanged text and VisitRequest (legacy)", async () => {
    flags.value = { introRequests: false, chat: false, mutualSuggestions: false, creditOnInterest: false };
    await createMutualMatch({ femaleId: "f1", maleId: "u1", suggestionId: "s1" });
    expect(db.mutualMatch.create.mock.calls[0][0].data).not.toHaveProperty("openedAt");
    expect(db.visitRequest.create).toHaveBeenCalledWith({ data: { matchId: "m1" } });
    expect(db.introRequest.create).not.toHaveBeenCalled();
    for (const id of ["f1", "u1"]) {
      expect(notificationsFor(id)).toEqual([expect.objectContaining({
        type: "MATCH",
        title: "توافق متبادل!",
        body: "تهانينا! لديك توافق متبادل جديد. يمكنك الآن رؤية التفاصيل.",
        url: "/dashboard/matches?match=m1",
      })]);
    }
  });

  it("flag off, intro requests on: request text, no VisitRequest, no outcome", async () => {
    flags.value = { introRequests: true, chat: true, mutualSuggestions: true, creditOnInterest: false };
    db.suggestion.findUnique.mockResolvedValue(suggestion("CHAT", "CHAT"));
    await createMutualMatch({ femaleId: "f1", maleId: "u1", suggestionId: "s1" });
    expect(db.mutualMatch.create.mock.calls[0][0].data).not.toHaveProperty("openedAt");
    expect(db.visitRequest.create).not.toHaveBeenCalled();
    expect(db.introRequest.create).not.toHaveBeenCalled();
    expect(notificationsFor("f1")[0].body).toBe(
      "تهانينا! لديك توافق متبادل جديد. يمكنك الآن إرسال طلب تعارف عائلي أو طلب محادثة.",
    );
  });
});
