/**
 * Chat delete (Pro), task 4: delete a message or clear the chat, for me or for everyone. Nothing is erased, only hidden
 * from members; silent (no notice, no SMS); the chat stays open. Unread copies that leave a member's view are stamped
 * read so counts, the unread SMS and nudges follow what each member sees.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  conversation: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  conversationClear: { findUnique: vi.fn(), findMany: vi.fn(), upsert: vi.fn() },
  message: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
  messageHide: { findMany: vi.fn(), createMany: vi.fn() },
  messageReaction: { findUnique: vi.fn(), findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
  block: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
  introRequest: { updateMany: vi.fn(), findFirst: vi.fn() },
  visitRequest: { findUnique: vi.fn() },
}));
const settings = vi.hoisted(() => ({ getCycleFlags: vi.fn(), getChatDeleteEnabled: vi.fn() }));
const pro = vi.hoisted(() => ({ isPro: vi.fn(), proUserIds: vi.fn(async () => new Set()) }));
const ably = vi.hoisted(() => ({ publishChatEvent: vi.fn() }));
const notifyMod = vi.hoisted(() => ({ notify: vi.fn(), notifyMany: vi.fn() }));
const bell = vi.hoisted(() => ({ upsertChatBell: vi.fn(), clearChatBell: vi.fn() }));
const auth = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/ably", () => ably);
vi.mock("@/lib/notify", () => notifyMod);
vi.mock("@/lib/chat/bell", () => bell);
vi.mock("@/lib/settings", () => settings);
vi.mock("@/lib/pro/status", () => pro);
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(() => ({ success: true })) }));
const reports = vi.hoisted(() => ({ fileReport: vi.fn() }));
vi.mock("@/lib/reports", () => reports);
vi.mock("@/lib/auth", () => auth);

import { clearChat, deleteMessage } from "@/lib/chat/delete";
import { endConversation, getConversation, setReaction } from "@/lib/chat/service";
import { DELETED_TRACE, visibleMessageWhere } from "@/lib/chat/visibility";
import { IntroError } from "@/lib/intro/errors";
import { POST as deleteRoute } from "@/app/api/chats/[id]/messages/[messageId]/delete/route";
import { POST as clearRoute } from "@/app/api/chats/[id]/clear/route";

const DAY = 24 * 60 * 60 * 1000;
const conv = (over: object = {}) => ({
  id: "c1",
  matchId: "m1",
  status: "ACTIVE",
  expiresAt: new Date(Date.now() + 10 * DAY),
  createdAt: new Date(Date.now() - 4 * DAY),
  extended: false,
  expiryWarnedAt: new Date(),
  familyNudgeAt: new Date(),
  endedById: null,
  clearedAt: null,
  clearedById: null,
  match: {
    id: "m1", femaleId: "f1", maleId: "u1",
    female: { id: "f1", firstName: "هديل", isVerified: true, status: "ACTIVE" },
    male: { id: "u1", firstName: "يزن", isVerified: true, status: "ACTIVE" },
  },
  ...over,
});
const msg = (over: object = {}) => ({ id: "msg1", conversationId: "c1", senderId: "u1", deletedAt: null, readAt: null, ...over });

async function expectCode(p: Promise<unknown>, code: string, message?: string) {
  const err = await p.catch((e) => e);
  expect(err).toBeInstanceOf(IntroError);
  expect((err as IntroError).code).toBe(code);
  if (message) expect((err as IntroError).message).toBe(message);
}

const writes = () => [
  db.message.updateMany, db.messageHide.createMany, db.conversationClear.upsert, db.conversation.update,
].flatMap((f) => f.mock.calls);

beforeEach(() => {
  vi.clearAllMocks();
  settings.getCycleFlags.mockResolvedValue({ introRequests: true, chat: true });
  settings.getChatDeleteEnabled.mockResolvedValue(true);
  pro.isPro.mockResolvedValue(true);
  auth.requireUser.mockResolvedValue({ session: { user: { id: "u1" } } });
  db.conversation.findUnique.mockResolvedValue(conv());
  db.conversation.updateMany.mockResolvedValue({ count: 1 });
  db.conversation.update.mockResolvedValue({});
  db.conversationClear.findUnique.mockResolvedValue(null);
  db.conversationClear.upsert.mockResolvedValue({});
  db.block.findFirst.mockResolvedValue(null);
  db.message.findUnique.mockResolvedValue(msg());
  db.message.updateMany.mockResolvedValue({ count: 1 });
  db.message.count.mockResolvedValue(0);
  db.message.findMany.mockResolvedValue([]);
  db.message.findFirst.mockResolvedValue(null);
  db.messageHide.createMany.mockResolvedValue({ count: 1 });
  db.messageHide.findMany.mockResolvedValue([]);
});

describe("gates", () => {
  it("switch off: DISABLED, no write", async () => {
    settings.getChatDeleteEnabled.mockResolvedValue(false);
    await expectCode(deleteMessage({ conversationId: "c1", messageId: "msg1", userId: "u1", scope: "everyone" }), "DISABLED");
    await expectCode(deleteMessage({ conversationId: "c1", messageId: "msg1", userId: "u1", scope: "me" }), "DISABLED");
    await expectCode(clearChat({ conversationId: "c1", userId: "u1", scope: "me" }), "DISABLED");
    await expectCode(clearChat({ conversationId: "c1", userId: "u1", scope: "everyone" }), "DISABLED");
    expect(writes()).toHaveLength(0);
    expect(ably.publishChatEvent).not.toHaveBeenCalled();
  });

  it("not Pro: PRO_REQUIRED with the delete wording, no write", async () => {
    pro.isPro.mockResolvedValue(false);
    const wording = "حذف الرسائل ومسح المحادثة متاح لأعضاء Pro";
    await expectCode(deleteMessage({ conversationId: "c1", messageId: "msg1", userId: "u1", scope: "everyone" }), "PRO_REQUIRED", wording);
    await expectCode(deleteMessage({ conversationId: "c1", messageId: "msg1", userId: "u1", scope: "me" }), "PRO_REQUIRED", wording);
    await expectCode(clearChat({ conversationId: "c1", userId: "u1", scope: "me" }), "PRO_REQUIRED", wording);
    await expectCode(clearChat({ conversationId: "c1", userId: "u1", scope: "everyone" }), "PRO_REQUIRED", wording);
    expect(writes()).toHaveLength(0);
    expect(ably.publishChatEvent).not.toHaveBeenCalled();
  });

  it("not a member of the chat: NOT_FOUND", async () => {
    await expectCode(deleteMessage({ conversationId: "c1", messageId: "msg1", userId: "x9", scope: "me" }), "NOT_FOUND");
    await expectCode(clearChat({ conversationId: "c1", userId: "x9", scope: "me" }), "NOT_FOUND");
    expect(writes()).toHaveLength(0);
  });
});

describe("delete a message for everyone", () => {
  it("my message in an open chat: marked deleted, an unread copy stamped read, a `deleted` event", async () => {
    const out = await deleteMessage({ conversationId: "c1", messageId: "msg1", userId: "u1", scope: "everyone" });
    expect(out).toEqual({ ok: true });
    const [mark, stamp] = db.message.updateMany.mock.calls.map((c) => c[0]);
    expect(mark.where).toEqual({ id: "msg1", senderId: "u1", deletedAt: null });
    expect(mark.data.deletedAt).toBeInstanceOf(Date);
    expect(stamp.where).toEqual({ id: "msg1", readAt: null });
    expect(stamp.data.readAt).toEqual(mark.data.deletedAt);
    // The partner had nothing else unread: their bell entry for this chat is done
    expect(bell.clearChatBell).toHaveBeenCalledWith("f1", "c1");
    expect(ably.publishChatEvent).toHaveBeenCalledWith("c1", "deleted", { messageId: "msg1" });
    expect(ably.publishChatEvent).not.toHaveBeenCalledWith("c1", "read", expect.anything());
  });

  it("the partner still has other unread messages: the bell stays", async () => {
    db.message.count.mockResolvedValue(2);
    await deleteMessage({ conversationId: "c1", messageId: "msg1", userId: "u1", scope: "everyone" });
    expect(bell.clearChatBell).not.toHaveBeenCalled();
  });

  it("the partner's message: NOT_ALLOWED, nothing written", async () => {
    db.message.findUnique.mockResolvedValue(msg({ senderId: "f1" }));
    await expectCode(deleteMessage({ conversationId: "c1", messageId: "msg1", userId: "u1", scope: "everyone" }), "NOT_ALLOWED");
    expect(writes()).toHaveLength(0);
  });

  it("refused in a blocked or ended chat (assertCanSend)", async () => {
    db.block.findFirst.mockResolvedValue({ id: "b1" });
    await expectCode(deleteMessage({ conversationId: "c1", messageId: "msg1", userId: "u1", scope: "everyone" }), "NOT_FOUND");
    db.block.findFirst.mockImplementation(async ({ where }: { where: { blockerId?: string } }) =>
      where.blockerId === "f1" ? null : { id: "b1" });
    await expectCode(deleteMessage({ conversationId: "c1", messageId: "msg1", userId: "u1", scope: "everyone" }), "BLOCKED");
    db.block.findFirst.mockResolvedValue(null);
    db.conversation.findUnique.mockResolvedValue(conv({ status: "ENDED" }));
    await expectCode(deleteMessage({ conversationId: "c1", messageId: "msg1", userId: "u1", scope: "everyone" }), "NOT_ALLOWED");
    db.conversation.findUnique.mockResolvedValue(conv({ status: "EXPIRED" }));
    await expectCode(deleteMessage({ conversationId: "c1", messageId: "msg1", userId: "u1", scope: "everyone" }), "EXPIRED");
    expect(writes()).toHaveLength(0);
  });

  it("already deleted: ok, no second write or event", async () => {
    db.message.findUnique.mockResolvedValue(msg({ deletedAt: new Date() }));
    expect(await deleteMessage({ conversationId: "c1", messageId: "msg1", userId: "u1", scope: "everyone" })).toEqual({ ok: true });
    expect(db.message.updateMany).not.toHaveBeenCalled();
    expect(ably.publishChatEvent).not.toHaveBeenCalled();
  });

  it("two deletes at once: the loser of the conditional write publishes nothing", async () => {
    db.message.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await deleteMessage({ conversationId: "c1", messageId: "msg1", userId: "u1", scope: "everyone" })).toEqual({ ok: true });
    expect(db.message.updateMany).toHaveBeenCalledTimes(1);
    expect(ably.publishChatEvent).not.toHaveBeenCalled();
  });

  it("a message from another chat: NOT_FOUND", async () => {
    db.message.findUnique.mockResolvedValue(msg({ conversationId: "other" }));
    await expectCode(deleteMessage({ conversationId: "c1", messageId: "msg1", userId: "u1", scope: "everyone" }), "NOT_FOUND");
    db.message.findUnique.mockResolvedValue(null);
    await expectCode(deleteMessage({ conversationId: "c1", messageId: "msg1", userId: "u1", scope: "everyone" }), "NOT_FOUND");
    expect(writes()).toHaveLength(0);
  });
});

describe("delete a message for me", () => {
  it("adds my hide; the partner's unread message is stamped read; no event", async () => {
    db.message.findUnique.mockResolvedValue(msg({ senderId: "f1" }));
    expect(await deleteMessage({ conversationId: "c1", messageId: "msg1", userId: "u1", scope: "me" })).toEqual({ ok: true });
    expect(db.messageHide.createMany).toHaveBeenCalledWith({ data: [{ messageId: "msg1", userId: "u1" }], skipDuplicates: true });
    const stamp = db.message.updateMany.mock.calls[0][0];
    expect(stamp.where).toEqual({ id: "msg1", readAt: null });
    expect(stamp.data.readAt).toBeInstanceOf(Date);
    expect(bell.clearChatBell).toHaveBeenCalledWith("u1", "c1");
    expect(ably.publishChatEvent).not.toHaveBeenCalled();
  });

  it("my own message: hidden for me only, the partner's unread state untouched", async () => {
    await deleteMessage({ conversationId: "c1", messageId: "msg1", userId: "u1", scope: "me" });
    expect(db.messageHide.createMany).toHaveBeenCalled();
    expect(db.message.updateMany).not.toHaveBeenCalled();
    expect(bell.clearChatBell).not.toHaveBeenCalled();
  });

  it("allowed in an ENDED chat, and when the partner blocked me (read-only access)", async () => {
    db.message.findUnique.mockResolvedValue(msg({ senderId: "f1" }));
    db.conversation.findUnique.mockResolvedValue(conv({ status: "ENDED" }));
    db.block.findFirst.mockResolvedValue({ id: "b1" });
    expect(await deleteMessage({ conversationId: "c1", messageId: "msg1", userId: "u1", scope: "me" })).toEqual({ ok: true });
    expect(db.messageHide.createMany).toHaveBeenCalled();
  });

  it("a message from another chat: NOT_FOUND", async () => {
    db.message.findUnique.mockResolvedValue(msg({ conversationId: "other" }));
    await expectCode(deleteMessage({ conversationId: "c1", messageId: "msg1", userId: "u1", scope: "me" }), "NOT_FOUND");
    expect(writes()).toHaveLength(0);
  });
});

describe("clear the chat", () => {
  it("for me: my clear point moves to now, the partner's unread messages up to now stamped read, no event", async () => {
    const out = await clearChat({ conversationId: "c1", userId: "u1", scope: "me" });
    const up = db.conversationClear.upsert.mock.calls[0][0];
    const now: Date = up.create.clearedAt;
    expect(up).toEqual({
      where: { conversationId_userId: { conversationId: "c1", userId: "u1" } },
      create: { conversationId: "c1", userId: "u1", clearedAt: now },
      update: { clearedAt: now },
    });
    expect(out).toEqual({ clearedBefore: now.toISOString() });
    expect(db.message.updateMany).toHaveBeenCalledWith({
      where: { conversationId: "c1", senderId: { not: "u1" }, readAt: null, createdAt: { lte: now } },
      data: { readAt: now },
    });
    expect(bell.clearChatBell).toHaveBeenCalledWith("u1", "c1");
    expect(db.conversation.update).not.toHaveBeenCalled();
    expect(ably.publishChatEvent).not.toHaveBeenCalled();
  });

  it("for me works in an expired chat", async () => {
    db.conversation.findUnique.mockResolvedValue(conv({ status: "EXPIRED" }));
    await clearChat({ conversationId: "c1", userId: "u1", scope: "me" });
    expect(db.conversationClear.upsert).toHaveBeenCalled();
  });

  it("for everyone: the chat-wide clear point, every unread message up to now stamped read, a `cleared` event", async () => {
    const out = await clearChat({ conversationId: "c1", userId: "u1", scope: "everyone" });
    const upd = db.conversation.update.mock.calls[0][0];
    const now: Date = upd.data.clearedAt;
    expect(upd).toEqual({ where: { id: "c1" }, data: { clearedAt: now, clearedById: "u1" } });
    expect(out).toEqual({ clearedBefore: now.toISOString() });
    expect(db.message.updateMany).toHaveBeenCalledWith({
      where: { conversationId: "c1", readAt: null, createdAt: { lte: now } },
      data: { readAt: now },
    });
    expect(bell.clearChatBell).toHaveBeenCalledWith("u1", "c1");
    expect(bell.clearChatBell).toHaveBeenCalledWith("f1", "c1");
    expect(ably.publishChatEvent).toHaveBeenCalledWith("c1", "cleared", { before: now.toISOString() });
    expect(ably.publishChatEvent).toHaveBeenCalledTimes(1);
    expect(db.conversationClear.upsert).not.toHaveBeenCalled();
  });

  it("for everyone is refused after a block and in an ended chat", async () => {
    db.block.findFirst.mockImplementation(async ({ where }: { where: { blockerId?: string } }) =>
      where.blockerId === "f1" ? null : { id: "b1" });
    await expectCode(clearChat({ conversationId: "c1", userId: "u1", scope: "everyone" }), "BLOCKED");
    db.block.findFirst.mockResolvedValue(null);
    db.conversation.findUnique.mockResolvedValue(conv({ status: "ENDED" }));
    await expectCode(clearChat({ conversationId: "c1", userId: "u1", scope: "everyone" }), "NOT_ALLOWED");
    expect(writes()).toHaveLength(0);
    expect(ably.publishChatEvent).not.toHaveBeenCalled();
  });
});

describe("silent", () => {
  it("no notice in any case", async () => {
    db.message.findUnique.mockResolvedValue(msg({ senderId: "f1" }));
    await deleteMessage({ conversationId: "c1", messageId: "msg1", userId: "u1", scope: "me" });
    db.message.findUnique.mockResolvedValue(msg());
    await deleteMessage({ conversationId: "c1", messageId: "msg1", userId: "u1", scope: "everyone" });
    await clearChat({ conversationId: "c1", userId: "u1", scope: "me" });
    await clearChat({ conversationId: "c1", userId: "u1", scope: "everyone" });
    expect(notifyMod.notify).not.toHaveBeenCalled();
    expect(notifyMod.notifyMany).not.toHaveBeenCalled();
    expect(bell.upsertChatBell).not.toHaveBeenCalled();
  });
});

describe("routes", () => {
  const del = (body: unknown) =>
    deleteRoute(new Request("http://x", { method: "POST", body: JSON.stringify(body) }), {
      params: Promise.resolve({ id: "c1", messageId: "msg1" }),
    });
  const clr = (body: unknown) =>
    clearRoute(new Request("http://x", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id: "c1" }) });

  it("delete: a bad scope is 400, a good one returns { ok: true }", async () => {
    const bad = await del({ scope: "all" });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: "بيانات غير صالحة" });
    const ok = await del({ scope: "everyone" });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true });
  });

  it("clear: a bad scope is 400, a good one returns clearedBefore", async () => {
    expect((await clr({})).status).toBe(400);
    const ok = await clr({ scope: "me" });
    expect(ok.status).toBe(200);
    expect(typeof (await ok.json()).clearedBefore).toBe("string");
  });

  it("signed out: 401", async () => {
    const { NextResponse } = await import("next/server");
    auth.requireUser.mockResolvedValue({ error: NextResponse.json({ error: "غير مصرح" }, { status: 401 }) });
    expect((await del({ scope: "me" })).status).toBe(401);
    expect((await clr({ scope: "me" })).status).toBe(401);
    expect(writes()).toHaveLength(0);
  });

  it("errors go through introErrorResponse (code and status)", async () => {
    pro.isPro.mockResolvedValue(false);
    const res = await clr({ scope: "everyone" });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "PRO_REQUIRED", error: "حذف الرسائل ومسح المحادثة متاح لأعضاء Pro" });
  });
});

describe("readers around a delete (rulings)", () => {
  it("a reaction on a message deleted for everyone: NOT_FOUND", async () => {
    db.message.findUnique.mockResolvedValue(msg({ deletedAt: new Date() }));
    await expectCode(setReaction({ conversationId: "c1", messageId: "msg1", userId: "u1", emoji: "❤️" }), "NOT_FOUND");
    expect(db.messageReaction.upsert).not.toHaveBeenCalled();
  });

  it("a poll never adds an older message deleted since `after` to `messages`: its id goes in `deletedIds` only", async () => {
    const after = "2026-11-10T10:00:00.000Z";
    const base = { conversationId: "c1", senderId: "f1", kind: "TEXT", readAt: null, reactions: [], hides: [], replyTo: null };
    const fresh = { ...base, id: "new", body: "جديدة", createdAt: new Date("2026-11-10T10:00:10.000Z"), deletedAt: null };
    db.message.findMany.mockImplementation(async (args: { where: Record<string, unknown>; select?: unknown }) =>
      // The deletedIds query (select id only, no AND) finds the older deleted message; the poll page only the new one
      "deletedAt" in args.where ? [{ id: "old" }] : [fresh]
    );
    const res = await getConversation("c1", "u1", { after, reactionsSince: after });
    expect(res.messages.map((m) => m.id)).toEqual(["new"]);
    expect(res.deletedIds).toEqual(["old"]);
    // The poll page asks only for rows from `after` on
    const pageQueries = db.message.findMany.mock.calls.map((c) => c[0]).filter((a) => "AND" in a.where);
    expect(pageQueries).toHaveLength(1);
    expect(pageQueries[0].where).toEqual({ AND: [visibleMessageWhere("c1", "u1", null), { createdAt: { gte: new Date(after) } }] });
    expect(res.conversation.lastMessage?.body).toBe("جديدة");
  });

  it("a row from `after` on that was deleted for everyone still comes back as the trace", async () => {
    const after = "2026-11-10T10:00:00.000Z";
    db.message.findMany.mockResolvedValue([
      { id: "d", conversationId: "c1", senderId: "f1", body: "سر", kind: "TEXT", readAt: null, reactions: [], hides: [], replyTo: null,
        createdAt: new Date("2026-11-10T10:00:10.000Z"), deletedAt: new Date("2026-11-10T10:00:20.000Z") },
    ]);
    const res = await getConversation("c1", "u1", { after });
    expect(res.messages[0]).toMatchObject({ id: "d", body: DELETED_TRACE, deleted: true, kind: "TEXT" });
    expect(JSON.stringify(res.messages)).not.toContain("سر");
  });

  it("a full page (no `after`) makes one message query", async () => {
    await getConversation("c1", "u1");
    expect(db.message.findMany).toHaveBeenCalledTimes(1);
  });

  it("deletedIds and hiddenIds are ordered newest first under the cap", async () => {
    const T = "2026-11-10T10:00:00.000Z";
    await getConversation("c1", "u1", { after: T, reactionsSince: T });
    const ids = db.message.findMany.mock.calls.map((c) => c[0]).find((a) => "deletedAt" in a.where)!;
    expect(ids).toMatchObject({ orderBy: { deletedAt: "desc" }, take: 200 });
    expect(db.messageHide.findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { createdAt: "desc" }, take: 200 }));
  });
});

describe("reports", () => {
  it("a deleted-for-everyone partner message can still be reported", async () => {
    db.message.findUnique.mockResolvedValue(msg({ id: "pm1", senderId: "f1", deletedAt: new Date() }));
    await endConversation({ conversationId: "c1", userId: "u1", end: false, report: { reason: "OTHER" as never, messageId: "pm1" } });
    expect(reports.fileReport).toHaveBeenCalledWith(expect.objectContaining({ conversationId: "c1", messageId: "pm1" }));
  });
});
