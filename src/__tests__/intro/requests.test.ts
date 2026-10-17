import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  mutualMatch: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  block: { findFirst: vi.fn(), findMany: vi.fn() },
  introRequest: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  parentInfo: { findUnique: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn(), count: vi.fn() },
  conversation: { create: vi.fn() },
  visitRequest: { update: vi.fn() },
  notification: { updateMany: vi.fn() },
  $transaction: vi.fn(),
}));
const credits = vi.hoisted(() => ({
  reserveCredits: vi.fn(),
  refundCredits: vi.fn(),
  notifyRequestCreditsExhausted: vi.fn(),
  recordCredit: vi.fn(),
}));
const notifyMod = vi.hoisted(() => ({ notify: vi.fn(), notifyMany: vi.fn() }));
const settings = vi.hoisted(() => ({ getCycleFlags: vi.fn() }));
const outcomeMod = vi.hoisted(() => ({ applyIntroOutcome: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/credits", () => credits);
vi.mock("@/lib/notify", () => notifyMod);
vi.mock("@/lib/settings", () => settings);
vi.mock("@/lib/intro/outcome", () => outcomeMod);

import { cancelIntroRequest, getMatchIntroState, respondToIntroRequest, sendIntroRequest } from "@/lib/intro/requests";
import { IntroError } from "@/lib/intro/errors";

const DAY = 24 * 60 * 60 * 1000;
const match = (over: object = {}) => ({
  id: "m1", femaleId: "f1", maleId: "u1", visitRequest: null, conversation: null, ...over,
});
const guardian = (consented = true) => ({
  userId: "x", parentName: "أبو يزن", parentPhone: "962790000000", relationship: "father",
  shareConsentAt: consented ? new Date() : null,
});
const pending = (over: object = {}) => ({
  id: "r1", matchId: "m1", type: "CHAT", senderId: "u1", receiverId: "f1", status: "PENDING",
  expiresAt: new Date(Date.now() + DAY), createdAt: new Date(), match: match(), ...over,
});

async function expectCode(p: Promise<unknown>, code: string) {
  const err = await p.catch((e) => e);
  expect(err).toBeInstanceOf(IntroError);
  expect((err as IntroError).code).toBe(code);
}

beforeEach(() => {
  vi.clearAllMocks();
  settings.getCycleFlags.mockResolvedValue({ introRequests: true, chat: true });
  db.mutualMatch.findUnique.mockResolvedValue(match());
  db.block.findFirst.mockResolvedValue(null);
  db.block.findMany.mockResolvedValue([]);
  db.notification.updateMany.mockResolvedValue({ count: 1 });
  db.introRequest.findMany.mockResolvedValue([]);
  db.introRequest.updateMany.mockResolvedValue({ count: 1 });
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));
  db.introRequest.create.mockImplementation(async ({ data }: { data: object }) => ({ id: "new", ...data }));
  db.introRequest.update.mockImplementation(async ({ data }: { data: object }) => data);
  db.parentInfo.findUnique.mockResolvedValue(guardian());
  db.user.findUnique.mockResolvedValue({ matchCredits: 2, firstName: "يزن" });
  db.conversation.create.mockResolvedValue({ id: "c1" });
  credits.reserveCredits.mockResolvedValue(true);
  db.user.count.mockResolvedValue(0);
  db.mutualMatch.updateMany.mockResolvedValue({ count: 1 });
  outcomeMod.applyIntroOutcome.mockResolvedValue("NONE");
});

describe("sendIntroRequest", () => {
  it("rejects users who are not part of the match", async () => {
    await expectCode(sendIntroRequest({ matchId: "m1", senderId: "stranger", type: "CHAT" }), "NOT_FOUND");
    expect(credits.reserveCredits).not.toHaveBeenCalled();
  });

  it("is unavailable while the switch is off", async () => {
    settings.getCycleFlags.mockResolvedValue({ introRequests: false, chat: false });
    await expectCode(sendIntroRequest({ matchId: "m1", senderId: "u1", type: "FAMILY" }), "DISABLED");
  });

  it("refuses chat requests while chat is off", async () => {
    settings.getCycleFlags.mockResolvedValue({ introRequests: true, chat: false });
    await expectCode(sendIntroRequest({ matchId: "m1", senderId: "u1", type: "CHAT" }), "DISABLED");
  });

  it("refuses when either side blocked the other", async () => {
    db.block.findFirst.mockResolvedValue({ id: "b1" });
    await expectCode(sendIntroRequest({ matchId: "m1", senderId: "u1", type: "CHAT" }), "BLOCKED");
  });

  it("refuses when the sender or partner is suspended", async () => {
    db.user.count.mockResolvedValue(1);
    await expectCode(sendIntroRequest({ matchId: "m1", senderId: "u1", type: "CHAT" }), "NOT_ALLOWED");
    expect(db.user.count).toHaveBeenCalledWith({ where: { id: { in: ["u1", "f1"] }, status: "SUSPENDED" } });
    expect(credits.reserveCredits).not.toHaveBeenCalled();
  });

  it("charges 1 credit, creates a 7-day request and notifies the receiver", async () => {
    const res = await sendIntroRequest({ matchId: "m1", senderId: "u1", type: "CHAT" });
    expect(credits.reserveCredits).toHaveBeenCalledWith("u1", 1, expect.anything());
    expect(credits.recordCredit).toHaveBeenCalledWith({ userId: "u1", delta: -1, reason: "REQUEST", refId: "new" });
    const { data } = db.introRequest.create.mock.calls[0][0];
    expect(data).toMatchObject({ matchId: "m1", type: "CHAT", senderId: "u1", receiverId: "f1" });
    expect(data.expiresAt.getTime() - Date.now()).toBeGreaterThan(6.9 * DAY);
    expect(notifyMod.notify).toHaveBeenCalledWith(expect.objectContaining({
      userId: "f1", type: "INTRO_REQUEST", url: "/dashboard/matches?match=m1",
    }));
    expect(res.creditsLeft).toBe(2);
  });

  it("creates nothing without credits", async () => {
    credits.reserveCredits.mockResolvedValue(false);
    await expectCode(sendIntroRequest({ matchId: "m1", senderId: "u1", type: "CHAT" }), "NO_CREDITS");
    expect(db.introRequest.create).not.toHaveBeenCalled();
    expect(credits.recordCredit).not.toHaveBeenCalled();
  });

  it("does not charge twice while a request is pending", async () => {
    db.introRequest.findMany.mockResolvedValue([pending()]);
    await expectCode(sendIntroRequest({ matchId: "m1", senderId: "u1", type: "CHAT" }), "DUPLICATE");
    expect(credits.reserveCredits).not.toHaveBeenCalled();
  });

  it("does not charge twice for two simultaneous taps", async () => {
    let release: () => void = () => {};
    credits.reserveCredits.mockImplementationOnce(() => new Promise((r) => { release = () => r(true); }));
    const first = sendIntroRequest({ matchId: "m1", senderId: "u1", type: "CHAT" });
    await new Promise((r) => setTimeout(r, 0));
    await expectCode(sendIntroRequest({ matchId: "m1", senderId: "u1", type: "CHAT" }), "DUPLICATE");
    release();
    await first;
    expect(credits.reserveCredits).toHaveBeenCalledTimes(1);
  });

  it("a declined request is final for that type", async () => {
    db.introRequest.findMany.mockResolvedValue([pending({ status: "DECLINED" })]);
    await expectCode(sendIntroRequest({ matchId: "m1", senderId: "u1", type: "CHAT" }), "NOT_ALLOWED");
  });

  it("an expired request can be sent again", async () => {
    db.introRequest.findMany.mockResolvedValue([pending({ status: "EXPIRED" })]);
    await sendIntroRequest({ matchId: "m1", senderId: "u1", type: "CHAT" });
    expect(db.introRequest.create).toHaveBeenCalled();
  });

  it("family request needs the sender's guardian and consent", async () => {
    db.parentInfo.findUnique.mockResolvedValue(null);
    await expectCode(sendIntroRequest({ matchId: "m1", senderId: "u1", type: "FAMILY" }), "GUARDIAN_REQUIRED");
    db.parentInfo.findUnique.mockResolvedValue(guardian(false));
    await expectCode(sendIntroRequest({ matchId: "m1", senderId: "u1", type: "FAMILY" }), "CONSENT_REQUIRED");
    expect(credits.reserveCredits).not.toHaveBeenCalled();
  });

  it("family request after a chat is free", async () => {
    db.mutualMatch.findUnique.mockResolvedValue(match({ conversation: { id: "c1", status: "ACTIVE", expiresAt: new Date(Date.now() + DAY) } }));
    await sendIntroRequest({ matchId: "m1", senderId: "u1", type: "FAMILY" });
    expect(credits.reserveCredits).not.toHaveBeenCalled();
    expect(db.introRequest.create).toHaveBeenCalled();
  });

  it("no new chat request once a conversation exists", async () => {
    db.mutualMatch.findUnique.mockResolvedValue(match({ conversation: { id: "c1", status: "ENDED", expiresAt: new Date() } }));
    await expectCode(sendIntroRequest({ matchId: "m1", senderId: "u1", type: "CHAT" }), "NOT_ALLOWED");
  });

  it("no family request while the admin is arranging the visit", async () => {
    db.mutualMatch.findUnique.mockResolvedValue(match({ visitRequest: { id: "v1", status: "SCHEDULED" } }));
    await expectCode(sendIntroRequest({ matchId: "m1", senderId: "u1", type: "FAMILY" }), "NOT_ALLOWED");
  });

  it("tells the sender when the last credit is spent", async () => {
    db.user.findUnique.mockResolvedValue({ matchCredits: 0, firstName: "يزن" });
    await sendIntroRequest({ matchId: "m1", senderId: "u1", type: "CHAT" });
    expect(credits.notifyRequestCreditsExhausted).toHaveBeenCalledWith("u1");
  });

  it("is free when credit_on_interest is on (no charge, no ledger, no exhausted notice)", async () => {
    settings.getCycleFlags.mockResolvedValue({ introRequests: true, chat: true, mutualSuggestions: true, creditOnInterest: true });
    db.user.findUnique.mockResolvedValue({ matchCredits: 0, firstName: "يزن" });
    for (const type of ["CHAT", "FAMILY"] as const) {
      const res = await sendIntroRequest({ matchId: "m1", senderId: "u1", type });
      expect(res.requestId).toBe("new");
    }
    expect(db.introRequest.create).toHaveBeenCalledTimes(2);
    expect(credits.reserveCredits).not.toHaveBeenCalled();
    expect(credits.recordCredit).not.toHaveBeenCalled();
    expect(credits.notifyRequestCreditsExhausted).not.toHaveBeenCalled();
    expect(notifyMod.notify).toHaveBeenCalledTimes(2);
  });

  it("is paid when credit_on_interest is off", async () => {
    settings.getCycleFlags.mockResolvedValue({ introRequests: true, chat: true, mutualSuggestions: true, creditOnInterest: false });
    await sendIntroRequest({ matchId: "m1", senderId: "u1", type: "FAMILY" });
    expect(credits.reserveCredits).toHaveBeenCalledWith("u1", 1, expect.anything());
    expect(credits.recordCredit).toHaveBeenCalledWith({ userId: "u1", delta: -1, reason: "REQUEST", refId: "new" });
  });
});

describe("respondToIntroRequest", () => {
  it("only the receiver can answer", async () => {
    db.introRequest.findUnique.mockResolvedValue(pending());
    await expectCode(respondToIntroRequest({ requestId: "r1", userId: "u1", accept: true }), "NOT_FOUND");
  });

  it("accepting a chat request opens a 14-day conversation", async () => {
    db.introRequest.findUnique.mockResolvedValue(pending());
    const res = await respondToIntroRequest({ requestId: "r1", userId: "f1", accept: true });
    expect(res).toEqual({ status: "ACCEPTED", conversationId: "c1" });
    const { data } = db.conversation.create.mock.calls[0][0];
    expect(data.matchId).toBe("m1");
    expect(data.expiresAt.getTime() - Date.now()).toBeGreaterThan(13.9 * DAY);
    expect(notifyMod.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", url: "/dashboard/chats/c1" }));
  });

  it("accepting a family request records consent and closes the waiting admin visit", async () => {
    db.introRequest.findUnique.mockResolvedValue(pending({
      type: "FAMILY", match: match({ visitRequest: { id: "v1", status: "REQUESTED" } }),
    }));
    db.parentInfo.findUnique.mockImplementation(async ({ where }: { where: { userId: string } }) =>
      guardian(where.userId !== "f1")
    );
    await respondToIntroRequest({ requestId: "r1", userId: "f1", accept: true, consent: true });
    expect(db.parentInfo.update).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "f1" } }));
    expect(db.visitRequest.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "v1" }, data: expect.objectContaining({ status: "CANCELLED" }),
    }));
  });

  it("accepting a family request without consent is refused", async () => {
    db.introRequest.findUnique.mockResolvedValue(pending({ type: "FAMILY" }));
    db.parentInfo.findUnique.mockResolvedValue(guardian(false));
    await expectCode(respondToIntroRequest({ requestId: "r1", userId: "f1", accept: true }), "CONSENT_REQUIRED");
  });

  it("declining never refunds the sender", async () => {
    db.introRequest.findUnique.mockResolvedValue(pending());
    const res = await respondToIntroRequest({ requestId: "r1", userId: "f1", accept: false });
    expect(res.status).toBe("DECLINED");
    expect(credits.refundCredits).not.toHaveBeenCalled();
    expect(notifyMod.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", title: "لم يتم قبول الطلب حالياً" }));
  });

  it("an expired request can't be accepted", async () => {
    db.introRequest.findUnique.mockResolvedValue(pending({ expiresAt: new Date(Date.now() - 1000) }));
    await expectCode(respondToIntroRequest({ requestId: "r1", userId: "f1", accept: true }), "EXPIRED");
    expect(db.introRequest.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "EXPIRED" } }));
  });
});

describe("respondToIntroRequest edge cases", () => {
  it("a second answer to the same request is refused (double tap / race)", async () => {
    db.introRequest.findUnique.mockResolvedValue(pending());
    db.introRequest.updateMany.mockResolvedValue({ count: 0 });
    await expectCode(respondToIntroRequest({ requestId: "r1", userId: "f1", accept: true }), "NOT_ALLOWED");
    expect(notifyMod.notify).not.toHaveBeenCalled();
  });

  it("a request can't be accepted when either side is suspended", async () => {
    db.introRequest.findUnique.mockResolvedValue(pending());
    db.user.count.mockResolvedValue(1);
    await expectCode(respondToIntroRequest({ requestId: "r1", userId: "f1", accept: true }), "NOT_ALLOWED");
    expect(db.conversation.create).not.toHaveBeenCalled();
  });

  it("chat requests can't be accepted while chat is off", async () => {
    settings.getCycleFlags.mockResolvedValue({ introRequests: true, chat: false });
    db.introRequest.findUnique.mockResolvedValue(pending());
    await expectCode(respondToIntroRequest({ requestId: "r1", userId: "f1", accept: true }), "DISABLED");
    expect(db.conversation.create).not.toHaveBeenCalled();
  });

  it("family acceptance needs the sender to still be sharing", async () => {
    db.introRequest.findUnique.mockResolvedValue(pending({ type: "FAMILY" }));
    db.parentInfo.findUnique.mockImplementation(async ({ where }: { where: { userId: string } }) =>
      guardian(where.userId === "f1")
    );
    await expectCode(respondToIntroRequest({ requestId: "r1", userId: "f1", accept: true }), "NOT_ALLOWED");
  });
});

describe("sendIntroRequest edge cases", () => {
  it("doesn't charge for a deactivated partner", async () => {
    db.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === "f1" ? { isDeactivated: true } : { matchCredits: 2, firstName: "يزن" }
    );
    await expectCode(sendIntroRequest({ matchId: "m1", senderId: "u1", type: "CHAT" }), "NOT_ALLOWED");
    expect(credits.reserveCredits).not.toHaveBeenCalled();
  });
});

describe("getMatchIntroState", () => {
  it("rejects users who are not part of the match", async () => {
    await expectCode(getMatchIntroState("m1", "stranger"), "NOT_FOUND");
  });

  it("expires stale requests before reading", async () => {
    await getMatchIntroState("m1", "u1");
    expect(db.introRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ matchId: "m1", status: "PENDING" }), data: { status: "EXPIRED" },
    }));
  });

  it("legacy admin visit hides the family option but keeps chat", async () => {
    db.mutualMatch.findUnique.mockResolvedValue(match({ visitRequest: { id: "v1", status: "SCHEDULED" } }));
    const state = await getMatchIntroState("m1", "u1");
    expect(state.family.status).toBe("legacy_admin");
    expect(state.chat.status).toBe("none");
  });

  it("shows the partner's guardian only after acceptance and with their consent", async () => {
    db.introRequest.findMany.mockResolvedValue([pending({ type: "FAMILY", status: "ACCEPTED" })]);
    db.parentInfo.findUnique.mockImplementation(async ({ where }: { where: { userId: string } }) =>
      where.userId === "f1" ? guardian(true) : guardian(true)
    );
    const state = await getMatchIntroState("m1", "u1");
    expect(state.family.status).toBe("accepted");
    expect(state.family.contacts).toEqual({ name: "أبو يزن", relationship: "father", phone: "962790000000" });

    db.parentInfo.findUnique.mockResolvedValue(guardian(false));
    const hidden = await getMatchIntroState("m1", "u1");
    expect(hidden.family.contacts).toBeUndefined();
  });

  it("reports pending requests from each side", async () => {
    db.introRequest.findMany.mockResolvedValue([pending({ type: "CHAT", senderId: "f1", receiverId: "u1" })]);
    const state = await getMatchIntroState("m1", "u1");
    expect(state.chat).toMatchObject({ status: "pending_received", requestId: "r1" });
  });

  it("chat shows disabled while the switch is off and nothing was opened", async () => {
    settings.getCycleFlags.mockResolvedValue({ introRequests: true, chat: false });
    const state = await getMatchIntroState("m1", "u1");
    expect(state.chat.status).toBe("disabled");
  });
});

const cancelledPendingCall = () =>
  db.introRequest.updateMany.mock.calls.find((c) => c[0].data?.status === "CANCELLED");
const endedChat = (over: object = {}) => ({
  id: "c1", status: "ENDED", expiresAt: new Date(Date.now() + DAY), endedById: "f1", ...over,
});

describe("block closes the match", () => {
  it("the blocked person no longer sees the match at all", async () => {
    db.block.findMany.mockResolvedValue([{ id: "b1", blockerId: "f1" }]);
    await expectCode(getMatchIntroState("m1", "u1"), "NOT_FOUND");
  });

  it("the blocker gets a closed state without guardian contact, and pending requests are cancelled", async () => {
    db.block.findMany.mockResolvedValue([{ id: "b1", blockerId: "u1" }]);
    db.introRequest.findMany.mockResolvedValue([pending({ type: "FAMILY", status: "ACCEPTED" })]);
    const state = await getMatchIntroState("m1", "u1");
    expect(state.closed).toBe("blocked");
    expect(state.family).toEqual({ status: "none" });
    expect(state.family.contacts).toBeUndefined();
    expect(cancelledPendingCall()?.[0].where).toMatchObject({
      status: "PENDING",
      OR: [{ senderId: "u1", receiverId: "f1" }, { senderId: "f1", receiverId: "u1" }],
    });
  });

  it("a request can't be answered once either side blocked (and is cancelled, no refund)", async () => {
    db.introRequest.findUnique.mockResolvedValue(pending());
    db.block.findFirst.mockResolvedValue({ id: "b1" });
    await expectCode(respondToIntroRequest({ requestId: "r1", userId: "f1", accept: false }), "BLOCKED");
    expect(cancelledPendingCall()).toBeTruthy();
    expect(credits.refundCredits).not.toHaveBeenCalled();
    expect(notifyMod.notify).not.toHaveBeenCalled();
  });
});

describe("unavailable partner", () => {
  const partnerIs = (u: object) =>
    db.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === "f1" ? u : { matchCredits: 2, firstName: "يزن" }
    );

  it("intro state is closed as inactive and the guardian contact is withheld", async () => {
    partnerIs({ isDeactivated: true, status: "VERIFIED" });
    db.introRequest.findMany.mockResolvedValue([pending({ type: "FAMILY", status: "ACCEPTED" })]);
    const state = await getMatchIntroState("m1", "u1");
    expect(state.closed).toBe("inactive");
    expect(state.family.contacts).toBeUndefined();
    expect(cancelledPendingCall()).toBeTruthy();
  });

  it("a suspended partner counts as inactive too", async () => {
    partnerIs({ isDeactivated: false, status: "SUSPENDED" });
    expect((await getMatchIntroState("m1", "u1")).closed).toBe("inactive");
  });

  it("sending to a deactivated partner is refused with a clear message and cancels what is pending", async () => {
    partnerIs({ isDeactivated: true });
    const err = await sendIntroRequest({ matchId: "m1", senderId: "u1", type: "FAMILY" }).catch((e) => e);
    expect(err).toBeInstanceOf(IntroError);
    expect(err.code).toBe("NOT_ALLOWED");
    expect(err.message).toBe("هذا الحساب غير نشط حالياً");
    expect(cancelledPendingCall()).toBeTruthy();
    expect(credits.reserveCredits).not.toHaveBeenCalled();
  });

  it("a request from a deactivated sender can't be accepted and becomes CANCELLED", async () => {
    db.introRequest.findUnique.mockResolvedValue(pending());
    db.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === "u1" ? { isDeactivated: true } : { matchCredits: 2 }
    );
    await expectCode(respondToIntroRequest({ requestId: "r1", userId: "f1", accept: true }), "NOT_ALLOWED");
    expect(cancelledPendingCall()).toBeTruthy();
    expect(db.conversation.create).not.toHaveBeenCalled();
  });
});

describe("ended chat and finished matches", () => {
  it("a chat ended by a user closes the family path (not free, can't be sent)", async () => {
    db.mutualMatch.findUnique.mockResolvedValue(match({ conversation: endedChat() }));
    const state = await getMatchIntroState("m1", "u1");
    expect(state.family.status).toBe("closed");
    expect(state.family.free).toBeUndefined();
    expect(state.closed).toBe("finished");
    await expectCode(sendIntroRequest({ matchId: "m1", senderId: "u1", type: "FAMILY" }), "NOT_ALLOWED");
    expect(credits.reserveCredits).not.toHaveBeenCalled();
    expect(db.introRequest.create).not.toHaveBeenCalled();
  });

  it("a chat that expired keeps the free family move", async () => {
    db.mutualMatch.findUnique.mockResolvedValue(
      match({ conversation: { id: "c1", status: "EXPIRED", expiresAt: new Date(Date.now() - DAY), endedById: null } })
    );
    const state = await getMatchIntroState("m1", "u1");
    expect(state.family).toMatchObject({ status: "none", free: true });
    expect(state.closed).toBeNull();
  });

  it("a chat ended by an admin doesn't close the family path", async () => {
    db.mutualMatch.findUnique.mockResolvedValue(match({ conversation: endedChat({ endedById: null }) }));
    const state = await getMatchIntroState("m1", "u1");
    expect(state.family.status).toBe("none");
    expect(state.closed).toBeNull();
  });

  it("a family request can't be accepted after the chat was ended by a user", async () => {
    db.introRequest.findUnique.mockResolvedValue(pending({ type: "FAMILY", match: match({ conversation: endedChat() }) }));
    await expectCode(respondToIntroRequest({ requestId: "r1", userId: "f1", accept: true, consent: true }), "NOT_ALLOWED");
    expect(cancelledPendingCall()).toBeTruthy();
  });

  it("both requests declined → finished", async () => {
    db.introRequest.findMany.mockResolvedValue([
      pending({ id: "a", type: "FAMILY", status: "DECLINED" }),
      pending({ id: "b", type: "CHAT", status: "DECLINED" }),
    ]);
    expect((await getMatchIntroState("m1", "u1")).closed).toBe("finished");
  });

  it("one declined, the other still possible → not finished", async () => {
    db.introRequest.findMany.mockResolvedValue([pending({ type: "FAMILY", status: "DECLINED" })]);
    expect((await getMatchIntroState("m1", "u1")).closed).toBeNull();
  });
});

describe("cancelIntroRequest", () => {
  it("only the sender can cancel", async () => {
    db.introRequest.findUnique.mockResolvedValue(pending());
    await expectCode(cancelIntroRequest({ requestId: "r1", userId: "f1" }), "NOT_FOUND");
  });

  it("cancels a pending request without refund, clears the receiver's badge and tells them it was withdrawn", async () => {
    db.introRequest.findUnique.mockResolvedValue(pending());
    const res = await cancelIntroRequest({ requestId: "r1", userId: "u1" });
    expect(res).toEqual({ status: "CANCELLED" });
    expect(db.introRequest.updateMany).toHaveBeenCalledWith({
      where: { id: "r1", status: "PENDING" }, data: { status: "CANCELLED" },
    });
    expect(credits.refundCredits).not.toHaveBeenCalled();
    expect(credits.recordCredit).not.toHaveBeenCalled();
    expect(notifyMod.notify).toHaveBeenCalledTimes(1);
    expect(notifyMod.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: "f1", type: "INTRO_REQUEST" }));
    expect(db.notification.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: "f1", type: "INTRO_REQUEST", isRead: false }),
      data: { isRead: true },
    }));
  });

  it("an answered request can't be cancelled", async () => {
    db.introRequest.findUnique.mockResolvedValue(pending({ status: "ACCEPTED" }));
    await expectCode(cancelIntroRequest({ requestId: "r1", userId: "u1" }), "NOT_ALLOWED");
  });

  it("a race with the receiver's answer loses cleanly", async () => {
    db.introRequest.findUnique.mockResolvedValue(pending());
    db.introRequest.updateMany.mockResolvedValue({ count: 0 });
    await expectCode(cancelIntroRequest({ requestId: "r1", userId: "u1" }), "NOT_ALLOWED");
    expect(db.notification.updateMany).not.toHaveBeenCalled();
  });

  it("an expired request is marked expired instead", async () => {
    db.introRequest.findUnique.mockResolvedValue(pending({ expiresAt: new Date(Date.now() - 1000) }));
    await expectCode(cancelIntroRequest({ requestId: "r1", userId: "u1" }), "EXPIRED");
  });
});

// credit_on_interest: matches with openedAt use a per-match guardian share stamp
const OPENED = new Date(Date.now() - DAY);
const opened = (over: object = {}) =>
  match({ openedAt: OPENED, suggestionId: "s1", femaleGuardianShareAt: null, maleGuardianShareAt: null, ...over });
/** The auto-accepted row applyIntroOutcome creates (respondedAt === expiresAt) */
const outcomeRow = (type: "CHAT" | "FAMILY") => ({
  id: `o-${type}`, matchId: "m1", type, senderId: "f1", receiverId: "u1", status: "ACCEPTED",
  respondedAt: OPENED, expiresAt: OPENED, createdAt: OPENED,
});
const CONTACT = { name: "أبو يزن", relationship: "father", phone: "962790000000" };

describe("per-match guardian consent (openedAt matches)", () => {
  it("mixed: CHAT side's guardian hidden until per-match share", async () => {
    // f1 chose FAMILY (stamped at creation), u1 chose CHAT (not stamped); both consented globally
    db.mutualMatch.findUnique.mockResolvedValue(opened({ femaleGuardianShareAt: OPENED }));
    db.introRequest.findMany.mockResolvedValue([outcomeRow("FAMILY")]);
    const forFemale = await getMatchIntroState("m1", "f1");
    expect(forFemale.outcome).toBe("FAMILY");
    expect(forFemale.family.status).toBe("accepted");
    expect(forFemale.family.contacts).toBeUndefined();
    const forMale = await getMatchIntroState("m1", "u1");
    expect(forMale.family.contacts).toEqual(CONTACT);

    db.mutualMatch.findUnique.mockResolvedValue(opened({ femaleGuardianShareAt: OPENED, maleGuardianShareAt: new Date() }));
    expect((await getMatchIntroState("m1", "f1")).family.contacts).toEqual(CONTACT);
  });

  it("askShare true for the unstamped side of an accepted family intro", async () => {
    db.mutualMatch.findUnique.mockResolvedValue(opened({ femaleGuardianShareAt: OPENED }));
    db.introRequest.findMany.mockResolvedValue([outcomeRow("FAMILY")]);
    const male = await getMatchIntroState("m1", "u1");
    expect(male.myGuardian).toMatchObject({ exists: true, consented: true, sharedForMatch: false, askShare: true });
    const female = await getMatchIntroState("m1", "f1");
    expect(female.myGuardian).toMatchObject({ sharedForMatch: true, askShare: false });

    // No accepted family intro yet (chat outcome): nothing to ask
    db.mutualMatch.findUnique.mockResolvedValue(opened({ conversation: { id: "c1", status: "ACTIVE", expiresAt: new Date(Date.now() + DAY), endedById: null } }));
    db.introRequest.findMany.mockResolvedValue([outcomeRow("CHAT")]);
    const chat = await getMatchIntroState("m1", "u1");
    expect(chat.outcome).toBe("CHAT");
    expect(chat.myGuardian.askShare).toBe(false);
  });

  it("pre-flag match keeps the global-consent rule", async () => {
    db.introRequest.findMany.mockResolvedValue([pending({ type: "FAMILY", status: "ACCEPTED" })]);
    const state = await getMatchIntroState("m1", "u1");
    expect(state.family.contacts).toEqual(CONTACT);
    expect(state.outcome).toBeUndefined();
    expect(state.myGuardian).toMatchObject({ sharedForMatch: false, askShare: false });
    expect(outcomeMod.applyIntroOutcome).not.toHaveBeenCalled();
  });

  it("withdrawn global consent hides contacts even when stamped", async () => {
    db.mutualMatch.findUnique.mockResolvedValue(opened({ femaleGuardianShareAt: OPENED, maleGuardianShareAt: OPENED }));
    db.introRequest.findMany.mockResolvedValue([outcomeRow("FAMILY")]);
    db.parentInfo.findUnique.mockImplementation(async ({ where }: { where: { userId: string } }) =>
      guardian(where.userId !== "f1")
    );
    expect((await getMatchIntroState("m1", "u1")).family.contacts).toBeUndefined();
  });

  it("later family request on an openedAt match stamps both on accept", async () => {
    db.introRequest.findUnique.mockResolvedValue(pending({ type: "FAMILY", match: opened() }));
    db.parentInfo.findUnique.mockImplementation(async ({ where }: { where: { userId: string } }) =>
      guardian(where.userId !== "f1")
    );
    await respondToIntroRequest({ requestId: "r1", userId: "f1", accept: true, consent: true });
    expect(db.parentInfo.update).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "f1" } }));
    expect(db.mutualMatch.update).toHaveBeenCalledWith({
      where: { id: "m1" },
      data: { femaleGuardianShareAt: expect.any(Date), maleGuardianShareAt: expect.any(Date) },
    });
  });

  it("an accepted family request on a pre-flag match stamps nothing", async () => {
    db.introRequest.findUnique.mockResolvedValue(pending({ type: "FAMILY" }));
    await respondToIntroRequest({ requestId: "r1", userId: "f1", accept: true });
    expect(db.mutualMatch.update).not.toHaveBeenCalled();
  });

  it("chat→family move still free after an auto-opened chat", async () => {
    settings.getCycleFlags.mockResolvedValue({ introRequests: true, chat: true, mutualSuggestions: true, creditOnInterest: false });
    db.mutualMatch.findUnique.mockResolvedValue(opened({ conversation: { id: "c1", status: "ACTIVE", expiresAt: new Date(Date.now() + DAY), endedById: null } }));
    db.introRequest.findMany.mockResolvedValue([outcomeRow("CHAT")]);
    const state = await getMatchIntroState("m1", "u1");
    expect(state.family).toMatchObject({ status: "none", free: true });
    await sendIntroRequest({ matchId: "m1", senderId: "u1", type: "FAMILY" });
    expect(credits.reserveCredits).not.toHaveBeenCalled();
    expect(db.introRequest.create).toHaveBeenCalled();
  });

  it("lazily applies a missing outcome for an openedAt match", async () => {
    db.mutualMatch.findUnique
      .mockResolvedValueOnce(opened())
      .mockResolvedValue(opened({ femaleGuardianShareAt: OPENED, maleGuardianShareAt: OPENED }));
    db.introRequest.findMany.mockResolvedValueOnce([]).mockResolvedValue([outcomeRow("FAMILY")]);
    outcomeMod.applyIntroOutcome.mockResolvedValue("FAMILY");
    const state = await getMatchIntroState("m1", "u1");
    expect(outcomeMod.applyIntroOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ id: "m1", femaleId: "f1", maleId: "u1", suggestionId: "s1" }),
      expect.objectContaining({ introRequests: true })
    );
    expect(state.outcome).toBe("FAMILY");
    expect(state.family.contacts).toEqual(CONTACT);
    expect(notifyMod.notify).not.toHaveBeenCalled();

    // Already has its outcome: not applied again
    outcomeMod.applyIntroOutcome.mockClear();
    await getMatchIntroState("m1", "u1");
    expect(outcomeMod.applyIntroOutcome).not.toHaveBeenCalled();
  });

  it("never lazily applies an outcome over a pending manual request", async () => {
    db.mutualMatch.findUnique.mockResolvedValue(opened());
    db.introRequest.findMany.mockResolvedValue([pending({ type: "FAMILY" })]);
    const state = await getMatchIntroState("m1", "u1");
    expect(outcomeMod.applyIntroOutcome).not.toHaveBeenCalled();
    expect(state.family.status).toBe("pending_sent");
  });
});
