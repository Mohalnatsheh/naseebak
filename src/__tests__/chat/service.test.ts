import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  conversation: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  message: { create: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
  block: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
  report: { upsert: vi.fn() },
  introRequest: { updateMany: vi.fn(), findFirst: vi.fn() },
  visitRequest: { findUnique: vi.fn() },
}));
const ably = vi.hoisted(() => ({ publishChatEvent: vi.fn() }));
const notifyMod = vi.hoisted(() => ({ notify: vi.fn(), notifyMany: vi.fn() }));
const settings = vi.hoisted(() => ({ getCycleFlags: vi.fn() }));
const rl = vi.hoisted(() => ({ rateLimit: vi.fn() }));
const reports = vi.hoisted(() => ({ fileReport: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/ably", () => ably);
vi.mock("@/lib/notify", () => notifyMod);
vi.mock("@/lib/settings", () => settings);
vi.mock("@/lib/rate-limit", () => rl);
vi.mock("@/lib/reports", () => reports);

import { endConversation, extendConversation, getConversation, listConversations, sendMessage } from "@/lib/chat/service";
import { IntroError } from "@/lib/intro/errors";

const DAY = 24 * 60 * 60 * 1000;
let seq = 0;
const conv = (over: object = {}) => ({
  id: `c${++seq}`,
  matchId: "m1",
  status: "ACTIVE",
  expiresAt: new Date(Date.now() + 10 * DAY),
  createdAt: new Date(Date.now() - 4 * DAY),
  extended: false,
  expiryWarnedAt: null,
  familyNudgeAt: null,
  endedById: null,
  match: {
    id: "m1", femaleId: "f1", maleId: "u1",
    female: { id: "f1", firstName: "هديل", isVerified: true },
    male: { id: "u1", firstName: "يزن", isVerified: true },
  },
  ...over,
});

async function expectCode(p: Promise<unknown>, code: string) {
  const err = await p.catch((e) => e);
  expect(err).toBeInstanceOf(IntroError);
  expect((err as IntroError).code).toBe(code);
}

beforeEach(() => {
  vi.clearAllMocks();
  settings.getCycleFlags.mockResolvedValue({ introRequests: true, chat: true });
  rl.rateLimit.mockReturnValue({ success: true, remaining: 1, resetAt: 0 });
  db.block.findFirst.mockResolvedValue(null);
  db.message.create.mockImplementation(async ({ data }: { data: { body: string; senderId: string } }) => ({
    id: "msg", ...data, createdAt: new Date(), readAt: null,
  }));
  db.message.findMany.mockResolvedValue([]);
  db.message.count.mockResolvedValue(0);
  db.message.updateMany.mockResolvedValue({ count: 0 });
  db.conversation.updateMany.mockResolvedValue({ count: 1 });
  db.introRequest.updateMany.mockResolvedValue({ count: 0 });
  db.block.findMany.mockResolvedValue([]);
});

/** u1 blocked f1: the blocker keeps a read-only chat (a block the other way hides it, see listConversations) */
const blockedByMe = async ({ where }: { where: { blockerId?: string; OR?: unknown } }) =>
  where.OR || where.blockerId === "u1" ? { id: "b" } : null;

describe("sendMessage", () => {
  it("rejects users outside the conversation", async () => {
    db.conversation.findUnique.mockResolvedValue(conv());
    await expectCode(sendMessage({ conversationId: "c", senderId: "stranger", body: "مرحبا" }), "NOT_FOUND");
  });

  it("refuses when the partner or the sender is suspended", async () => {
    const base = conv();
    db.conversation.findUnique.mockResolvedValue({
      ...base, match: { ...base.match, female: { ...base.match.female, status: "SUSPENDED" } },
    });
    await expectCode(sendMessage({ conversationId: base.id, senderId: "u1", body: "مرحبا" }), "NOT_ALLOWED");
    db.conversation.findUnique.mockResolvedValue({
      ...base, match: { ...base.match, male: { ...base.match.male, status: "SUSPENDED" } },
    });
    await expectCode(sendMessage({ conversationId: base.id, senderId: "u1", body: "مرحبا" }), "NOT_ALLOWED");
    expect(db.message.create).not.toHaveBeenCalled();
  });

  it("refuses a deactivated partner with a clear message", async () => {
    const base = conv();
    db.conversation.findUnique.mockResolvedValue({
      ...base, match: { ...base.match, female: { ...base.match.female, isDeactivated: true } },
    });
    const err = await sendMessage({ conversationId: base.id, senderId: "u1", body: "مرحبا" }).catch((e) => e);
    expect(err).toBeInstanceOf(IntroError);
    expect(err.code).toBe("NOT_ALLOWED");
    expect(err.message).toContain("غير نشط");
    expect(db.message.create).not.toHaveBeenCalled();
  });

  it("saves, publishes and pushes a clean message", async () => {
    const c = conv();
    db.conversation.findUnique.mockResolvedValue(c);
    const msg = await sendMessage({ conversationId: c.id, senderId: "u1", body: "  السلام عليكم  " });
    expect(msg).toMatchObject({ body: "السلام عليكم", mine: true });
    expect(ably.publishChatEvent).toHaveBeenCalledWith(c.id, "message", expect.objectContaining({ body: "السلام عليكم" }));
    expect(notifyMod.notify).toHaveBeenCalledWith(expect.objectContaining({
      userId: "f1", type: "CHAT", pushOnly: true, url: `/dashboard/chats/${c.id}`,
    }));
  });

  it("pushes at most once per 3 minutes per conversation", async () => {
    const c = conv();
    db.conversation.findUnique.mockResolvedValue(c);
    await sendMessage({ conversationId: c.id, senderId: "u1", body: "١" });
    await sendMessage({ conversationId: c.id, senderId: "u1", body: "٢" });
    expect(notifyMod.notify).toHaveBeenCalledTimes(1);
    expect(ably.publishChatEvent).toHaveBeenCalledTimes(2);
  });

  it("blocks contact details without saving or using the sending allowance", async () => {
    db.conversation.findUnique.mockResolvedValue(conv());
    await expectCode(sendMessage({ conversationId: "c", senderId: "u1", body: "رقمي 0791234567" }), "FILTERED");
    expect(db.message.create).not.toHaveBeenCalled();
    expect(rl.rateLimit).not.toHaveBeenCalled();
  });

  it("is rate limited", async () => {
    db.conversation.findUnique.mockResolvedValue(conv());
    rl.rateLimit.mockReturnValue({ success: false, remaining: 0, resetAt: 0 });
    await expectCode(sendMessage({ conversationId: "c", senderId: "u1", body: "مرحبا" }), "RATE_LIMITED");
  });

  it("expires an overdue chat instead of sending", async () => {
    const c = conv({ expiresAt: new Date(Date.now() - 1000) });
    db.conversation.findUnique.mockResolvedValue(c);
    await expectCode(sendMessage({ conversationId: c.id, senderId: "u1", body: "مرحبا" }), "EXPIRED");
    expect(db.conversation.updateMany).toHaveBeenCalledWith({ where: { id: c.id, status: "ACTIVE" }, data: { status: "EXPIRED" } });
  });

  it("refuses ended chats and blocked users", async () => {
    db.conversation.findUnique.mockResolvedValue(conv({ status: "ENDED" }));
    await expectCode(sendMessage({ conversationId: "c", senderId: "u1", body: "مرحبا" }), "NOT_ALLOWED");
    db.conversation.findUnique.mockResolvedValue(conv());
    db.block.findFirst.mockImplementation(blockedByMe);
    await expectCode(sendMessage({ conversationId: "c", senderId: "u1", body: "مرحبا" }), "BLOCKED");
  });

  it("refuses the last piece of a phone number sent in parts", async () => {
    db.conversation.findUnique.mockResolvedValue(conv());
    db.message.findMany.mockResolvedValueOnce([
      { senderId: "u1", body: "صفر سبعة تسعة" },
      { senderId: "u1", body: "صفر صفر" },
    ]);
    await expectCode(sendMessage({ conversationId: "c", senderId: "u1", body: "تسعة تسعة" }), "FILTERED");
    expect(db.message.create).not.toHaveBeenCalled();
  });

  it("a partner's reply in between resets the pieces", async () => {
    db.conversation.findUnique.mockResolvedValue(conv());
    db.message.findMany.mockResolvedValueOnce([
      { senderId: "f1", body: "ماذا تقصد؟" },
      { senderId: "u1", body: "صفر سبعة تسعة صفر صفر" },
    ]);
    await sendMessage({ conversationId: "c", senderId: "u1", body: "تسعة تسعة" });
    expect(db.message.create).toHaveBeenCalled();
  });

  it("chat switch off: sending is disabled but reading still works", async () => {
    settings.getCycleFlags.mockResolvedValue({ introRequests: true, chat: false });
    db.conversation.findUnique.mockResolvedValue(conv());
    await expectCode(sendMessage({ conversationId: "c", senderId: "u1", body: "مرحبا" }), "DISABLED");
    const res = await getConversation("c", "u1");
    expect(res.conversation.status).toBe("ACTIVE");
  });
});

describe("expiry warning", () => {
  it("warns both users once when less than 2 days are left", async () => {
    const c = conv({ expiresAt: new Date(Date.now() + DAY) });
    db.conversation.findUnique.mockResolvedValue(c);
    await getConversation(c.id, "u1");
    expect(notifyMod.notifyMany).toHaveBeenCalledWith(["f1", "u1"], expect.objectContaining({ title: "تنتهي المحادثة قريباً" }));

    vi.clearAllMocks();
    db.message.findMany.mockResolvedValue([]);
    db.message.count.mockResolvedValue(0);
    db.conversation.findUnique.mockResolvedValue({ ...c, expiryWarnedAt: new Date() });
    await getConversation(c.id, "u1");
    expect(notifyMod.notifyMany).not.toHaveBeenCalled();
  });

  it("two parallel reads warn only once", async () => {
    const c = conv({ expiresAt: new Date(Date.now() + DAY) });
    db.conversation.findUnique.mockResolvedValue(c);
    db.conversation.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await Promise.all([getConversation(c.id, "u1"), getConversation(c.id, "f1")]);
    expect(notifyMod.notifyMany).toHaveBeenCalledTimes(1);
  });

  it("a blocked chat is reported as read-only", async () => {
    db.conversation.findUnique.mockResolvedValue(conv());
    db.block.findFirst.mockImplementation(blockedByMe);
    const res = await getConversation("c", "u1");
    expect(res.conversation.blocked).toBe(true);
  });
});

describe("extendConversation", () => {
  it("the blocker can't extend a blocked (read-only) chat", async () => {
    db.conversation.findUnique.mockResolvedValue(conv({ expiresAt: new Date(Date.now() + 2 * DAY) }));
    db.block.findFirst.mockImplementation(blockedByMe);
    await expectCode(extendConversation("c", "u1"), "BLOCKED");
    expect(db.conversation.update).not.toHaveBeenCalled();
  });

  it("only within the last 3 days", async () => {
    db.conversation.findUnique.mockResolvedValue(conv());
    await expectCode(extendConversation("c", "u1"), "NOT_ALLOWED");
  });

  it("adds 7 days once", async () => {
    const c = conv({ expiresAt: new Date(Date.now() + 2.5 * DAY), expiryWarnedAt: null });
    db.conversation.findUnique.mockResolvedValue(c);
    const res = await extendConversation(c.id, "u1");
    expect(new Date(res.expiresAt).getTime() - Date.now()).toBeGreaterThan(9 * DAY);
    expect(db.conversation.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ extended: true }),
    }));

    db.conversation.findUnique.mockResolvedValue({ ...c, extended: true });
    await expectCode(extendConversation(c.id, "u1"), "NOT_ALLOWED");
  });
});

describe("endConversation", () => {
  it("ends, notifies the other side, and with a report also blocks", async () => {
    const c = conv();
    db.conversation.findUnique.mockResolvedValue(c);
    await endConversation({ conversationId: c.id, userId: "u1", report: { reason: "HARASSMENT" } });
    expect(db.conversation.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "ENDED", endedById: "u1" }),
    }));
    expect(notifyMod.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: "f1", title: "انتهت المحادثة" }));
    // Shared report path: reopens a repeat report and counts toward the auto-flag
    expect(reports.fileReport).toHaveBeenCalledWith(
      expect.objectContaining({ reporterId: "u1", reportedId: "f1", reason: "HARASSMENT", conversationId: c.id })
    );
    expect(db.block.create).toHaveBeenCalledWith({ data: { blockerId: "u1", blockedId: "f1" } });
  });
});

describe("endConversation closes the family path", () => {
  it("ending a chat cancels a pending family request on that match (no refund)", async () => {
    const c = conv();
    db.conversation.findUnique.mockResolvedValue(c);
    await endConversation({ conversationId: c.id, userId: "u1" });
    expect(db.introRequest.updateMany).toHaveBeenCalledWith({
      where: { matchId: "m1", type: "FAMILY", status: "PENDING" },
      data: { status: "CANCELLED" },
    });
  });

  it("report + block also cancels everything pending between the two", async () => {
    const c = conv();
    db.conversation.findUnique.mockResolvedValue(c);
    await endConversation({ conversationId: c.id, userId: "u1", report: { reason: "SPAM" } });
    expect(db.introRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: "PENDING", OR: [{ senderId: "u1", receiverId: "f1" }, { senderId: "f1", receiverId: "u1" }] }),
      data: { status: "CANCELLED" },
    }));
  });
});

describe("listConversations", () => {
  it("marks chats with a partner I blocked as read-only, like the chat page", async () => {
    const c = { ...conv(), messages: [], _count: { messages: 0 } };
    db.conversation.findMany.mockResolvedValue([c]);
    db.block.findMany.mockResolvedValue([{ blockerId: "u1", blockedId: "f1" }]);
    const [summary] = await listConversations("u1");
    expect(summary.blocked).toBe(true);
  });

  it("keeps the chat, read-only, for the person who was blocked (match link hidden)", async () => {
    const c = { ...conv(), messages: [], _count: { messages: 0 } };
    db.conversation.findMany.mockResolvedValue([c]);
    db.block.findMany.mockResolvedValue([{ blockerId: "f1", blockedId: "u1" }]);
    const [chat] = await listConversations("u1");
    expect(chat).toMatchObject({ id: c.id, blocked: true, matchHidden: true });
  });

  it("the blocked person can still read the chat", async () => {
    const c = conv();
    db.conversation.findUnique.mockResolvedValue(c);
    db.message.findMany.mockResolvedValue([]);
    db.block.findFirst.mockResolvedValue({ id: "blk" });
    const { conversation } = await getConversation(c.id, "u1");
    expect(conversation).toMatchObject({ blocked: true, matchHidden: true });
  });

  it("the blocked person can't send", async () => {
    const c = conv();
    db.conversation.findUnique.mockResolvedValue(c);
    db.block.findFirst.mockResolvedValue({ id: "blk" });
    await expect(sendMessage({ conversationId: c.id, senderId: "u1", body: "مرحبا" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("the blocked person can still report the chat", async () => {
    const c = { ...conv(), status: "ENDED" };
    db.conversation.findUnique.mockResolvedValue(c);
    db.block.findFirst.mockResolvedValue({ id: "blk" });
    await endConversation({ conversationId: c.id, userId: "u1", report: { reason: "HARASSMENT", details: "تهديد" } });
    expect(reports.fileReport).toHaveBeenCalledWith(expect.objectContaining({ reporterId: "u1", reportedId: "f1", conversationId: c.id }));
    // Already ended: nobody is told again
    expect(notifyMod.notify).not.toHaveBeenCalled();
  });
});
