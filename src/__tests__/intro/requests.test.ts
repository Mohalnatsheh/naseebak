import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  mutualMatch: { findUnique: vi.fn() },
  block: { findFirst: vi.fn() },
  introRequest: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  parentInfo: { findUnique: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn(), count: vi.fn() },
  conversation: { create: vi.fn() },
  visitRequest: { update: vi.fn() },
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
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/credits", () => credits);
vi.mock("@/lib/notify", () => notifyMod);
vi.mock("@/lib/settings", () => settings);

import { getMatchIntroState, respondToIntroRequest, sendIntroRequest } from "@/lib/intro/requests";
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
