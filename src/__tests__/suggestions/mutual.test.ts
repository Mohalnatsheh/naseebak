import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => {
  const d = {
    suggestion: { findUnique: vi.fn(), updateMany: vi.fn() },
    block: { findFirst: vi.fn() },
    user: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    creditLedger: { create: vi.fn(), findFirst: vi.fn(async (): Promise<{ id: string } | null> => null) },
    parentInfo: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  };
  d.$transaction.mockImplementation((fn: (tx: typeof d) => unknown) => fn(d));
  return d;
});
const matchMod = vi.hoisted(() => ({ createMutualMatch: vi.fn() }));
const notifyMod = vi.hoisted(() => ({ notify: vi.fn(), notifyMany: vi.fn() }));
const flags = vi.hoisted(() => ({ value: { introRequests: true, chat: true, mutualSuggestions: true, creditOnInterest: false } }));
const requestsMod = vi.hoisted(() => ({ setGuardianConsent: vi.fn() }));
const autoMod = vi.hoisted(() => ({ autoSuggestForUser: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/intro/match", () => matchMod);
vi.mock("@/lib/notify", () => notifyMod);
vi.mock("@/lib/settings", () => ({ getCycleFlags: vi.fn(async () => flags.value) }));
vi.mock("@/lib/intro/requests", () => requestsMod);
vi.mock("@/lib/matching/auto-suggest", () => autoMod);

import { decideSuggestion } from "@/lib/suggestions/mutual";
import { IntroError } from "@/lib/intro/errors";

const DAY = 24 * 60 * 60 * 1000;
const row = (over: object = {}) => ({
  id: "s1", recipientId: "u1", candidateId: "f1", flow: "MUTUAL", status: "PENDING",
  expiresAt: new Date(Date.now() + DAY), recipientDecision: null, candidateDecision: null, ...over,
});

async function expectNotFound(p: Promise<unknown>) {
  const err = await p.catch((e) => e);
  expect(err).toBeInstanceOf(IntroError);
  expect((err as IntroError).code).toBe("NOT_FOUND");
}

let balance: Record<string, number>;

beforeEach(() => {
  vi.clearAllMocks();
  flags.value = { introRequests: true, chat: true, mutualSuggestions: true, creditOnInterest: false };
  balance = { u1: 3, f1: 3 };
  db.block.findFirst.mockResolvedValue(null);
  db.suggestion.updateMany.mockResolvedValue({ count: 1 });
  db.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
    gender: where.id.startsWith("f") ? "FEMALE" : "MALE",
    matchCredits: balance[where.id] ?? 0,
  }));
  db.user.findUniqueOrThrow.mockImplementation(async ({ where }: { where: { id: string } }) => ({
    matchCredits: balance[where.id] ?? 0,
  }));
  db.user.updateMany.mockImplementation(async ({ where }: { where: { id: string; matchCredits: { gte: number } } }) => {
    if ((balance[where.id] ?? 0) < where.matchCredits.gte) return { count: 0 };
    balance[where.id] -= where.matchCredits.gte;
    return { count: 1 };
  });
  db.creditLedger.create.mockResolvedValue({});
  db.parentInfo.findUnique.mockResolvedValue({ userId: "u1", shareConsentAt: new Date() });
  matchMod.createMutualMatch.mockResolvedValue({ matchId: "m1" });
  autoMod.autoSuggestForUser.mockResolvedValue(0);
});

async function expectCode(p: Promise<unknown>, code: string) {
  const err = await p.catch((e) => e);
  expect(err).toBeInstanceOf(IntroError);
  expect((err as IntroError).code).toBe(code);
}

const flush = async () => {
  await vi.dynamicImportSettled();
  await new Promise((r) => setTimeout(r, 0));
};

describe("decideSuggestion", () => {
  it("refuses users who are not part of the suggestion", async () => {
    db.suggestion.findUnique.mockResolvedValue(row());
    await expectNotFound(decideSuggestion({ suggestionId: "s1", userId: "stranger", interested: true }));
    expect(db.suggestion.updateMany).not.toHaveBeenCalled();
  });

  it("refuses legacy rows", async () => {
    db.suggestion.findUnique.mockResolvedValue(row({ flow: "LEGACY" }));
    await expectNotFound(decideSuggestion({ suggestionId: "s1", userId: "u1", interested: true }));
  });

  it("refuses expired and closed rows", async () => {
    db.suggestion.findUnique.mockResolvedValue(row({ expiresAt: new Date(Date.now() - 1000) }));
    await expectNotFound(decideSuggestion({ suggestionId: "s1", userId: "u1", interested: true }));
    db.suggestion.findUnique.mockResolvedValue(row({ status: "REJECTED" }));
    await expectNotFound(decideSuggestion({ suggestionId: "s1", userId: "u1", interested: true }));
  });

  it("refuses when either side blocked the other", async () => {
    db.suggestion.findUnique.mockResolvedValue(row());
    db.block.findFirst.mockResolvedValue({ id: "b1" });
    await expectNotFound(decideSuggestion({ suggestionId: "s1", userId: "f1", interested: true }));
    expect(db.suggestion.updateMany).not.toHaveBeenCalled();
  });

  it("refuses when the other person is deactivated or suspended (no decision recorded)", async () => {
    for (const other of [{ isDeactivated: true, status: "VERIFIED" }, { isDeactivated: false, status: "SUSPENDED" }]) {
      db.suggestion.findUnique.mockResolvedValue(row());
      db.user.findUnique.mockResolvedValue(other);
      await expectNotFound(decideSuggestion({ suggestionId: "s1", userId: "u1", interested: true }));
    }
    expect(db.suggestion.updateMany).not.toHaveBeenCalled();
    expect(matchMod.createMutualMatch).not.toHaveBeenCalled();
  });

  it("never creates a match with someone who deactivated at the last moment", async () => {
    db.suggestion.findUnique
      .mockResolvedValueOnce(row({ candidateDecision: "INTERESTED" }))
      .mockResolvedValueOnce(row({ candidateDecision: "INTERESTED", recipientDecision: "INTERESTED" }));
    db.user.findUnique
      .mockResolvedValueOnce({ isDeactivated: false, status: "VERIFIED" })
      .mockResolvedValueOnce({ isDeactivated: true, status: "VERIFIED" });
    const res = await decideSuggestion({ suggestionId: "s1", userId: "u1", interested: true });
    expect(res).toEqual({ match: false });
    expect(matchMod.createMutualMatch).not.toHaveBeenCalled();
  });

  it("gives both «مهتم» charges back when the match is lost that way", async () => {
    db.suggestion.findUnique
      .mockResolvedValueOnce(row({ candidateDecision: "INTERESTED" }))
      .mockResolvedValueOnce(row({ candidateDecision: "INTERESTED", recipientDecision: "INTERESTED" }));
    db.user.findUnique
      .mockResolvedValueOnce({ isDeactivated: false, status: "VERIFIED" })
      .mockResolvedValueOnce({ isDeactivated: true, status: "VERIFIED" });
    db.creditLedger.findFirst.mockResolvedValue({ id: "charge" });
    await decideSuggestion({ suggestionId: "s1", userId: "u1", interested: true });
    const entries = (db.creditLedger.create.mock.calls as unknown as [{ data: { reason: string; userId: string } }][]).map((c) => c[0].data);
    expect(entries.filter((e) => e.reason === "REFUND").map((e) => e.userId).sort()).toEqual(["f1", "u1"]);
  });

  it("refuses a second decision by the same person", async () => {
    db.suggestion.findUnique.mockResolvedValue(row({ candidateDecision: "INTERESTED" }));
    await expectNotFound(decideSuggestion({ suggestionId: "s1", userId: "f1", interested: false }));
    // and when a concurrent request won the conditional update
    db.suggestion.findUnique.mockResolvedValue(row());
    db.suggestion.updateMany.mockResolvedValueOnce({ count: 0 });
    await expectNotFound(decideSuggestion({ suggestionId: "s1", userId: "f1", interested: false }));
  });

  it("records the first yes without a match or any notification", async () => {
    db.suggestion.findUnique.mockResolvedValueOnce(row()).mockResolvedValueOnce(row({ candidateDecision: "INTERESTED" }));
    const res = await decideSuggestion({ suggestionId: "s1", userId: "f1", interested: true });
    expect(res).toEqual({ match: false });
    expect(db.suggestion.updateMany).toHaveBeenCalledTimes(1);
    expect(db.suggestion.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: "s1", flow: "MUTUAL", status: "PENDING", candidateDecision: null },
      data: { candidateDecision: "INTERESTED" },
    });
    expect(matchMod.createMutualMatch).not.toHaveBeenCalled();
    expect(notifyMod.notify).not.toHaveBeenCalled();
    expect(notifyMod.notifyMany).not.toHaveBeenCalled();
  });

  it("creates the match once both said yes", async () => {
    db.suggestion.findUnique
      .mockResolvedValueOnce(row({ candidateDecision: "INTERESTED" }))
      .mockResolvedValueOnce(row({ candidateDecision: "INTERESTED", recipientDecision: "INTERESTED" }));
    const res = await decideSuggestion({ suggestionId: "s1", userId: "u1", interested: true });
    expect(res).toEqual({ match: true, matchId: "m1" });
    expect(db.suggestion.updateMany.mock.calls[1][0]).toEqual({
      where: { id: "s1", status: "PENDING" },
      data: { status: "ACCEPTED" },
    });
    expect(matchMod.createMutualMatch).toHaveBeenCalledTimes(1);
    expect(matchMod.createMutualMatch).toHaveBeenCalledWith({ femaleId: "f1", maleId: "u1", suggestionId: "s1" });
  });

  it("does not create a second match when the other request already closed it", async () => {
    db.suggestion.findUnique
      .mockResolvedValueOnce(row({ recipientDecision: "INTERESTED" }))
      .mockResolvedValueOnce(row({ candidateDecision: "INTERESTED", recipientDecision: "INTERESTED" }));
    db.suggestion.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const res = await decideSuggestion({ suggestionId: "s1", userId: "f1", interested: true });
    expect(res.match).toBe(true);
    expect(matchMod.createMutualMatch).not.toHaveBeenCalled();
  });

  it("closes the row silently after a no once both decided", async () => {
    db.suggestion.findUnique
      .mockResolvedValueOnce(row({ recipientDecision: "INTERESTED" }))
      .mockResolvedValueOnce(row({ recipientDecision: "INTERESTED", candidateDecision: "DECLINED" }));
    const res = await decideSuggestion({ suggestionId: "s1", userId: "f1", interested: false });
    expect(res).toEqual({ match: false });
    expect(db.suggestion.updateMany.mock.calls[1][0]).toEqual({
      where: { id: "s1", status: "PENDING" },
      data: { status: "REJECTED" },
    });
    expect(matchMod.createMutualMatch).not.toHaveBeenCalled();
    expect(notifyMod.notify).not.toHaveBeenCalled();
  });

  it("keeps the row open after a first no", async () => {
    db.suggestion.findUnique.mockResolvedValueOnce(row()).mockResolvedValueOnce(row({ recipientDecision: "DECLINED" }));
    await decideSuggestion({ suggestionId: "s1", userId: "u1", interested: false });
    expect(db.suggestion.updateMany).toHaveBeenCalledTimes(1);
  });
});

describe("decideSuggestion with credit on interest", () => {
  beforeEach(() => {
    flags.value = { ...flags.value, creditOnInterest: true };
  });

  const yes = (over: object = {}) =>
    decideSuggestion({ suggestionId: "s1", userId: "u1", interested: true, introPreference: "CHAT", ...over });

  it('"مهتم" charges 1 credit and records INTEREST', async () => {
    db.suggestion.findUnique.mockResolvedValueOnce(row()).mockResolvedValueOnce(row({ recipientDecision: "INTERESTED" }));
    const res = await yes();
    expect(res).toEqual({ match: false, creditsLeft: 2 });
    expect(balance.u1).toBe(2);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.creditLedger.create).toHaveBeenCalledTimes(1);
    expect(db.creditLedger.create).toHaveBeenCalledWith({
      data: { userId: "u1", delta: -1, reason: "INTEREST", refId: "s1" },
    });
  });

  it("refused with NO_CREDITS at 0 and records nothing", async () => {
    balance.u1 = 0;
    db.suggestion.findUnique.mockResolvedValue(row());
    await expectCode(yes(), "NO_CREDITS");
    expect(db.suggestion.updateMany).not.toHaveBeenCalled();
    expect(db.creditLedger.create).not.toHaveBeenCalled();
  });

  it("rolls back the claim when the reserve fails inside the transaction", async () => {
    db.suggestion.findUnique.mockResolvedValue(row());
    // balance spent between the pre-check and the reserve (concurrent request)
    db.user.updateMany.mockResolvedValueOnce({ count: 0 });
    await expectCode(yes(), "NO_CREDITS");
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.creditLedger.create).not.toHaveBeenCalled();
    expect(matchMod.createMutualMatch).not.toHaveBeenCalled();
  });

  it("«لا» stays free and allowed at 0 credits", async () => {
    balance.u1 = 0;
    db.suggestion.findUnique.mockResolvedValue(row());
    await decideSuggestion({ suggestionId: "s1", userId: "u1", interested: false });
    expect(db.suggestion.updateMany).toHaveBeenCalled();
    expect(balance.u1).toBe(0);
    expect(matchMod.createMutualMatch).not.toHaveBeenCalled();
  });

  it("at 0 credits NO_CREDITS comes before the preference and consent checks", async () => {
    balance.u1 = 0;
    db.suggestion.findUnique.mockResolvedValue(row());
    db.parentInfo.findUnique.mockResolvedValue({ userId: "u1", shareConsentAt: null });
    await expectCode(yes({ introPreference: "FAMILY", guardianConsent: true }), "NO_CREDITS");
    await expectCode(yes({ introPreference: undefined }), "NO_CREDITS");
    expect(requestsMod.setGuardianConsent).not.toHaveBeenCalled();
  });

  it('"لا" costs nothing', async () => {
    db.suggestion.findUnique.mockResolvedValueOnce(row()).mockResolvedValueOnce(row({ recipientDecision: "DECLINED" }));
    const res = await decideSuggestion({ suggestionId: "s1", userId: "u1", interested: false });
    expect(res.match).toBe(false);
    expect(balance.u1).toBe(3);
    expect(db.user.updateMany).not.toHaveBeenCalled();
    expect(db.creditLedger.create).not.toHaveBeenCalled();
    expect(db.suggestion.updateMany.mock.calls[0][0].data).toEqual({
      recipientDecision: "DECLINED",
      recipientDecidedAt: expect.any(Date),
    });
  });

  it("charges once when the claim is lost", async () => {
    db.suggestion.findUnique.mockResolvedValueOnce(row()).mockResolvedValueOnce(row({ recipientDecision: "INTERESTED" }));
    await yes();
    db.suggestion.findUnique.mockResolvedValueOnce(row());
    db.suggestion.updateMany.mockResolvedValueOnce({ count: 0 });
    await expectNotFound(yes());
    expect(db.user.updateMany).toHaveBeenCalledTimes(1);
    expect(db.creditLedger.create).toHaveBeenCalledTimes(1);
    expect(balance.u1).toBe(2);
  });

  it("no charge when the decision is refused", async () => {
    db.suggestion.findUnique.mockResolvedValueOnce(row({ expiresAt: new Date(Date.now() - 1000) }));
    await expectNotFound(yes());
    db.suggestion.findUnique.mockResolvedValueOnce(row());
    db.block.findFirst.mockResolvedValueOnce({ id: "b1" });
    await expectNotFound(yes());
    db.suggestion.findUnique.mockResolvedValueOnce(row());
    db.user.findUnique.mockResolvedValueOnce({ isDeactivated: true, status: "VERIFIED" });
    await expectNotFound(yes());
    expect(db.user.updateMany).not.toHaveBeenCalled();
    expect(db.creditLedger.create).not.toHaveBeenCalled();
    expect(balance.u1).toBe(3);
  });

  it("PREFERENCE_REQUIRED without preference", async () => {
    db.suggestion.findUnique.mockResolvedValue(row());
    await expectCode(yes({ introPreference: undefined }), "PREFERENCE_REQUIRED");
    expect(db.suggestion.updateMany).not.toHaveBeenCalled();
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });

  it("CHAT refused when chat flag off", async () => {
    flags.value = { ...flags.value, chat: false };
    db.suggestion.findUnique.mockResolvedValue(row());
    await expectCode(yes({ introPreference: "CHAT" }), "DISABLED");
    expect(db.suggestion.updateMany).not.toHaveBeenCalled();
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });

  it("FAMILY without guardian → GUARDIAN_REQUIRED", async () => {
    db.suggestion.findUnique.mockResolvedValue(row());
    db.parentInfo.findUnique.mockResolvedValue(null);
    await expectCode(yes({ introPreference: "FAMILY", guardianConsent: true }), "GUARDIAN_REQUIRED");
    expect(requestsMod.setGuardianConsent).not.toHaveBeenCalled();
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });

  it("FAMILY without consent → CONSENT_REQUIRED", async () => {
    db.suggestion.findUnique.mockResolvedValue(row());
    db.parentInfo.findUnique.mockResolvedValue({ userId: "u1", shareConsentAt: null });
    await expectCode(yes({ introPreference: "FAMILY" }), "CONSENT_REQUIRED");
    expect(requestsMod.setGuardianConsent).not.toHaveBeenCalled();
    expect(db.suggestion.updateMany).not.toHaveBeenCalled();
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });

  it("FAMILY with guardianConsent:true sets consent and stores FAMILY", async () => {
    db.suggestion.findUnique.mockResolvedValueOnce(row()).mockResolvedValueOnce(row({ recipientDecision: "INTERESTED" }));
    db.parentInfo.findUnique.mockResolvedValue({ userId: "u1", shareConsentAt: null });
    await yes({ introPreference: "FAMILY", guardianConsent: true });
    expect(requestsMod.setGuardianConsent).toHaveBeenCalledWith("u1");
    expect(db.suggestion.updateMany.mock.calls[0][0].data).toMatchObject({
      recipientDecision: "INTERESTED",
      recipientIntroPreference: "FAMILY",
    });
  });

  it("FAMILY with existing consent does not ask again", async () => {
    db.suggestion.findUnique.mockResolvedValueOnce(row()).mockResolvedValueOnce(row({ recipientDecision: "INTERESTED" }));
    await yes({ introPreference: "FAMILY" });
    expect(requestsMod.setGuardianConsent).not.toHaveBeenCalled();
    expect(db.suggestion.updateMany.mock.calls[0][0].data).toMatchObject({ recipientIntroPreference: "FAMILY" });
  });

  it("preference stored on my side's column", async () => {
    db.suggestion.findUnique.mockResolvedValueOnce(row()).mockResolvedValueOnce(row({ candidateDecision: "INTERESTED" }));
    await decideSuggestion({ suggestionId: "s1", userId: "f1", interested: true, introPreference: "CHAT" });
    const call = db.suggestion.updateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ id: "s1", candidateDecision: null });
    expect(call.data).toEqual({
      candidateDecision: "INTERESTED",
      candidateDecidedAt: expect.any(Date),
      candidateIntroPreference: "CHAT",
    });
    expect(balance.f1).toBe(2);
    expect(balance.u1).toBe(3);
  });

  it("a decision sends no notification", async () => {
    db.suggestion.findUnique.mockResolvedValueOnce(row()).mockResolvedValueOnce(row({ recipientDecision: "INTERESTED" }));
    await yes();
    db.suggestion.findUnique.mockResolvedValueOnce(row({ id: "s2" })).mockResolvedValueOnce(row({ id: "s2", recipientDecision: "DECLINED" }));
    await decideSuggestion({ suggestionId: "s2", userId: "u1", interested: false });
    await flush();
    expect(notifyMod.notify).not.toHaveBeenCalled();
    expect(notifyMod.notifyMany).not.toHaveBeenCalled();
  });

  it("exhausted notice once when balance reaches 0", async () => {
    balance.u1 = 1;
    db.suggestion.findUnique.mockResolvedValueOnce(row()).mockResolvedValueOnce(row({ recipientDecision: "INTERESTED" }));
    const res = await yes();
    expect(res.creditsLeft).toBe(0);
    expect(notifyMod.notify).toHaveBeenCalledTimes(1);
    expect(notifyMod.notify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", type: "PAYMENT", url: "/dashboard/payments" })
    );
    await flush();
    expect(notifyMod.notify).toHaveBeenCalledTimes(1);
  });

  it("two concurrent charges from 2 send exactly one exhausted notice (balance read inside the transaction)", async () => {
    balance.u1 = 2;
    // In-transaction reads see each charge's own result; a later read outside would see 0 for both
    db.user.findUniqueOrThrow.mockResolvedValueOnce({ matchCredits: 1 }).mockResolvedValueOnce({ matchCredits: 0 });
    // Per row: first read is undecided, the re-read after the claim shows my INTERESTED
    const reads = new Map<string, number>();
    db.suggestion.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
      const n = reads.get(where.id) ?? 0;
      reads.set(where.id, n + 1);
      return row({ id: where.id, ...(n > 0 && { recipientDecision: "INTERESTED" }) });
    });
    const [a, b] = await Promise.all([yes(), yes({ suggestionId: "s2" })]);
    expect([a.creditsLeft, b.creditsLeft].sort()).toEqual([0, 1]);
    await flush();
    const exhausted = notifyMod.notify.mock.calls.filter((c) => c[0].type === "PAYMENT");
    expect(exhausted).toHaveLength(1);
  });

  it("logs and rethrows when the match cannot be created after the row closed ACCEPTED (no revert)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    db.suggestion.findUnique
      .mockResolvedValueOnce(row({ candidateDecision: "INTERESTED" }))
      .mockResolvedValueOnce(row({ candidateDecision: "INTERESTED", recipientDecision: "INTERESTED" }));
    const boom = new Error("db down");
    matchMod.createMutualMatch.mockRejectedValueOnce(boom);
    await expect(yes()).rejects.toBe(boom);
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("createMutualMatch failed"),
      { suggestionId: "s1", femaleId: "f1", maleId: "u1" },
      boom
    );
    // Closed ACCEPTED once; never reopened, never refunded
    const statusWrites = db.suggestion.updateMany.mock.calls.map((c) => c[0].data.status).filter(Boolean);
    expect(statusWrites).toEqual(["ACCEPTED"]);
    expect(balance.u1).toBe(2);
    expect(db.creditLedger.create).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("tops up the decider after a decision", async () => {
    db.suggestion.findUnique.mockResolvedValueOnce(row()).mockResolvedValueOnce(row({ recipientDecision: "INTERESTED" }));
    await yes();
    await flush();
    expect(autoMod.autoSuggestForUser).toHaveBeenCalledWith("u1");
    autoMod.autoSuggestForUser.mockClear();
    db.suggestion.findUnique.mockResolvedValueOnce(row({ id: "s2" })).mockResolvedValueOnce(row({ id: "s2", recipientDecision: "DECLINED" }));
    await decideSuggestion({ suggestionId: "s2", userId: "u1", interested: false });
    await flush();
    expect(autoMod.autoSuggestForUser).toHaveBeenCalledWith("u1");
  });

  it("match path still creates the match after the charge", async () => {
    db.suggestion.findUnique
      .mockResolvedValueOnce(row({ candidateDecision: "INTERESTED" }))
      .mockResolvedValueOnce(row({ candidateDecision: "INTERESTED", recipientDecision: "INTERESTED" }));
    const res = await yes();
    expect(res).toEqual({ match: true, matchId: "m1", creditsLeft: 2 });
    expect(matchMod.createMutualMatch).toHaveBeenCalledWith({ femaleId: "f1", maleId: "u1", suggestionId: "s1" });
  });
});

describe("decideSuggestion with credit on interest off", () => {
  it("flag off: لا and مهتم at 0 credits are still recorded", async () => {
    balance.u1 = 0;
    db.suggestion.findUnique.mockResolvedValueOnce(row()).mockResolvedValueOnce(row({ recipientDecision: "DECLINED" }));
    expect(await decideSuggestion({ suggestionId: "s1", userId: "u1", interested: false })).toEqual({ match: false });
    expect(db.suggestion.updateMany).toHaveBeenCalledTimes(1);
  });

  it("flag off: free, preference ignored, existing behaviour", async () => {
    db.suggestion.findUnique.mockResolvedValueOnce(row()).mockResolvedValueOnce(row({ recipientDecision: "INTERESTED" }));
    db.parentInfo.findUnique.mockResolvedValue(null);
    const res = await decideSuggestion({
      suggestionId: "s1", userId: "u1", interested: true, introPreference: "FAMILY", guardianConsent: true,
    });
    expect(res).toEqual({ match: false });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.user.updateMany).not.toHaveBeenCalled();
    expect(db.creditLedger.create).not.toHaveBeenCalled();
    expect(requestsMod.setGuardianConsent).not.toHaveBeenCalled();
    expect(db.suggestion.updateMany.mock.calls[0][0].data).toEqual({
      recipientDecision: "INTERESTED",
      recipientDecidedAt: expect.any(Date),
    });
    await flush();
    expect(autoMod.autoSuggestForUser).not.toHaveBeenCalled();
  });
});
