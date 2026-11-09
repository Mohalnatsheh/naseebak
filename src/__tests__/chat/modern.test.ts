/**
 * Modern chat (server): reply to a message, reactions, typing and conversation starters.
 * Review focus 1, 2, 4 and 5 of docs/superpowers/plans/2026-11-10-modern-chat.md.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  conversation: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  message: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
  messageReaction: { findUnique: vi.fn(), findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
  block: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
  report: { upsert: vi.fn() },
  introRequest: { updateMany: vi.fn(), findFirst: vi.fn() },
  visitRequest: { findUnique: vi.fn() },
  proSubscription: { findFirst: vi.fn(), findMany: vi.fn() },
}));
const ably = vi.hoisted(() => ({ publishChatEvent: vi.fn() }));
const notifyMod = vi.hoisted(() => ({ notify: vi.fn(), notifyMany: vi.fn() }));
const settings = vi.hoisted(() => ({ getCycleFlags: vi.fn() }));
const rl = vi.hoisted(() => ({ rateLimit: vi.fn() }));
const auth = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/ably", () => ably);
vi.mock("@/lib/notify", () => notifyMod);
vi.mock("@/lib/chat/bell", () => ({ upsertChatBell: vi.fn(), clearChatBell: vi.fn() }));
vi.mock("@/lib/settings", () => settings);
vi.mock("@/lib/rate-limit", () => rl);
vi.mock("@/lib/reports", () => ({ fileReport: vi.fn() }));
vi.mock("@/lib/auth", () => auth);

import { endConversation, getConversation, listConversations, sendMessage, setReaction, signalTyping } from "@/lib/chat/service";
import * as chatService from "@/lib/chat/service";
import { fileReport } from "@/lib/reports";
import { POST as endRoute } from "@/app/api/chats/[id]/end/route";
import { GET as chatRoute } from "@/app/api/chats/[id]/route";
import { IntroError } from "@/lib/intro/errors";
import { REACTION_EMOJI } from "@/lib/chat/reactions";
import { TYPING_SHOW_MS } from "@/lib/chat/typing";
import { chatStarters } from "@/lib/chat/starters";
import { REPLY_SNIPPET_MAX, replySnippet } from "@/lib/chat/reply";
import { IMAGE_PREVIEW, VOICE_PREVIEW } from "@/lib/chat/media";
import { checkMessage } from "@/lib/chat/filter";
import { POST as reactionRoute } from "@/app/api/chats/[id]/messages/[messageId]/reaction/route";
import { POST as typingRoute } from "@/app/api/chats/[id]/typing/route";
import { POST as messagesRoute } from "@/app/api/chats/[id]/messages/route";

const DAY = 24 * 60 * 60 * 1000;
let seq = 0;
const conv = (over: object = {}) => ({
  id: `mc${++seq}`,
  matchId: "m1",
  status: "ACTIVE",
  expiresAt: new Date(Date.now() + 10 * DAY),
  createdAt: new Date(Date.now() - 4 * DAY),
  extended: false,
  expiryWarnedAt: new Date(),
  familyNudgeAt: new Date(),
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
  db.message.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "new", ...data, createdAt: new Date(), readAt: null, reactions: [], replyTo: data.replyToId ? replied : null,
  }));
  db.message.findMany.mockResolvedValue([]);
  db.message.findFirst.mockResolvedValue(null);
  db.message.count.mockResolvedValue(0);
  db.conversation.updateMany.mockResolvedValue({ count: 1 });
  db.messageReaction.findMany.mockResolvedValue([]);
  db.messageReaction.findUnique.mockResolvedValue(null);
  db.proSubscription.findFirst.mockResolvedValue(null);
  auth.requireUser.mockResolvedValue({ session: { user: { id: "u1" } } });
});

let replied: Record<string, unknown> | null = null;

describe("reply to a message", () => {
  it("a reply to a message of this chat is saved with replyToId and returns the quote", async () => {
    const c = conv();
    db.conversation.findUnique.mockResolvedValue(c);
    db.message.findUnique.mockResolvedValue({ id: "orig", conversationId: c.id });
    replied = { id: "orig", conversationId: c.id, senderId: "f1", kind: "TEXT", body: "ما رأيك في السفر؟" };
    const msg = await sendMessage({ conversationId: c.id, senderId: "u1", body: "أحبه كثيراً", replyToId: "orig" });
    expect(db.message.create.mock.calls[0][0].data.replyToId).toBe("orig");
    expect(msg.replyTo).toEqual({ id: "orig", mine: false, kind: "TEXT", snippet: "ما رأيك في السفر؟" });
    // The live event carries the quote with its sender, so each side works out `mine`
    expect(ably.publishChatEvent).toHaveBeenCalledWith(c.id, "message", expect.objectContaining({
      replyTo: { id: "orig", senderId: "f1", kind: "TEXT", snippet: "ما رأيك في السفر؟" },
    }));
  });

  it("a reply to a message of another chat is refused with 400 and nothing of it leaks", async () => {
    const c = conv();
    db.conversation.findUnique.mockResolvedValue(c);
    db.message.findUnique.mockResolvedValue({ id: "other", conversationId: "someone-elses-chat" });
    const err = await sendMessage({ conversationId: c.id, senderId: "u1", body: "رد", replyToId: "other" }).catch((e) => e);
    expect(err).toBeInstanceOf(IntroError);
    expect(err.status).toBe(400);
    expect(db.message.create).not.toHaveBeenCalled();
    expect(ably.publishChatEvent).not.toHaveBeenCalled();
  });

  it("a reply to a message that no longer exists is refused with 400", async () => {
    db.conversation.findUnique.mockResolvedValue(conv());
    db.message.findUnique.mockResolvedValue(null);
    const err = await sendMessage({ conversationId: "c", senderId: "u1", body: "رد", replyToId: "gone" }).catch((e) => e);
    expect(err.status).toBe(400);
    expect(db.message.create).not.toHaveBeenCalled();
  });

  it("the reply text itself still goes through the full filter", async () => {
    const c = conv();
    db.conversation.findUnique.mockResolvedValue(c);
    db.message.findUnique.mockResolvedValue({ id: "orig", conversationId: c.id });
    await expectCode(sendMessage({ conversationId: c.id, senderId: "u1", body: "رقمي 0791234567", replyToId: "orig" }), "FILTERED");
    expect(db.message.create).not.toHaveBeenCalled();
  });

  it("the route refuses a reply to another chat with 400 (JSON `replyToId`)", async () => {
    const c = conv();
    db.conversation.findUnique.mockResolvedValue(c);
    db.message.findUnique.mockResolvedValue({ id: "other", conversationId: "x" });
    const res = await messagesRoute(
      new Request("http://x", { method: "POST", body: JSON.stringify({ body: "رد", replyToId: "other" }) }),
      { params: Promise.resolve({ id: c.id }) },
    );
    expect(res.status).toBe(400);
  });

  it("a quoted message deleted later (replyToId set to null) reads as no quote", async () => {
    const c = conv();
    db.conversation.findUnique.mockResolvedValue(c);
    db.message.findMany.mockResolvedValue([
      { id: "r", conversationId: c.id, senderId: "u1", body: "رد", createdAt: new Date(), readAt: null, kind: "TEXT", replyToId: null, replyTo: null, reactions: [] },
    ]);
    const res = await getConversation(c.id, "u1");
    expect(res.messages[0].replyTo).toBeNull();
  });

  it("a quote from another chat in a stored row is never shown (defence in depth)", async () => {
    const c = conv();
    db.conversation.findUnique.mockResolvedValue(c);
    db.message.findMany.mockResolvedValue([
      {
        id: "r", conversationId: c.id, senderId: "u1", body: "رد", createdAt: new Date(), readAt: null, kind: "TEXT",
        replyToId: "x", replyTo: { id: "x", conversationId: "other", senderId: "f9", kind: "TEXT", body: "سر" }, reactions: [],
      },
    ]);
    const res = await getConversation(c.id, "u1");
    expect(res.messages[0].replyTo).toBeNull();
    expect(JSON.stringify(res)).not.toContain("سر");
  });

  it("snippets: at most 80 characters of text, labels for a photo or a voice note", () => {
    expect(replySnippet({ kind: "IMAGE", body: "📷 صورة — حدّث التطبيق لعرضها" })).toBe(IMAGE_PREVIEW);
    expect(replySnippet({ kind: "VOICE", body: "x" })).toBe(VOICE_PREVIEW);
    const long = "كلمة ".repeat(40);
    const s = replySnippet({ kind: "TEXT", body: long });
    expect(Array.from(s).length).toBeLessThanOrEqual(REPLY_SNIPPET_MAX);
    expect(s.endsWith("…")).toBe(true);
    // One line, and an emoji is never cut in half
    expect(replySnippet({ kind: "TEXT", body: "سطر\nثانٍ" })).toBe("سطر ثانٍ");
    expect(Array.from(replySnippet({ kind: "TEXT", body: "😊".repeat(100) })).every((ch) => ch === "😊" || ch === "…")).toBe(true);
  });
});

describe("message JSON shape (old app 1.0.x keeps reading it)", () => {
  it("keeps every old field and adds replyTo and reactions", async () => {
    const c = conv();
    db.conversation.findUnique.mockResolvedValue(c);
    const at = new Date("2026-11-10T10:00:00.000Z");
    db.message.findMany.mockResolvedValue([
      {
        id: "a", conversationId: c.id, senderId: "f1", body: "السلام عليكم", createdAt: at, readAt: at, kind: "TEXT",
        replyToId: null, replyTo: null, reactions: [{ emoji: "❤️", userId: "u1" }, { emoji: "👍", userId: "f1" }],
      },
    ]);
    const res = await getConversation(c.id, "u1");
    const m = JSON.parse(JSON.stringify(res.messages[0]));
    expect(Object.keys(m).sort()).toEqual(["body", "createdAt", "id", "kind", "media", "mine", "reactions", "readAt", "replyTo"].sort());
    expect(m).toMatchObject({ id: "a", body: "السلام عليكم", createdAt: at.toISOString(), mine: false, readAt: at.toISOString(), kind: "TEXT", media: null });
    expect(m.reactions).toEqual([{ emoji: "❤️", mine: true }, { emoji: "👍", mine: false }]);
    // Who reacted is never sent: only `mine`
    expect(JSON.stringify(m.reactions)).not.toContain("f1");
    // The old top-level keys stay, and the new ones are additive
    for (const key of ["conversation", "messages", "hasMore", "partnerTyping", "starters"]) expect(res).toHaveProperty(key);
    for (const key of ["id", "matchId", "partner", "status", "expiresAt", "canExtend", "endedByMe", "blocked", "matchHidden", "lastMessage", "unread"]) {
      expect(res.conversation).toHaveProperty(key);
    }
  });
});

describe("reactions", () => {
  const msgOf = (cid: string) => ({ id: "msg1", conversationId: cid });

  it("sets one of the four emoji, returns `{emoji, mine}` and broadcasts without push or unread", async () => {
    const c = conv();
    db.conversation.findUnique.mockResolvedValue(c);
    db.message.findUnique.mockResolvedValue(msgOf(c.id));
    db.messageReaction.findMany.mockResolvedValue([{ emoji: "❤️", userId: "u1" }]);
    const out = await setReaction({ conversationId: c.id, messageId: "msg1", userId: "u1", emoji: "❤️" });
    expect(db.messageReaction.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { messageId_userId: { messageId: "msg1", userId: "u1" } },
      create: { messageId: "msg1", userId: "u1", emoji: "❤️" },
      update: { emoji: "❤️" },
    }));
    expect(out).toEqual({ reactions: [{ emoji: "❤️", mine: true }] });
    expect(ably.publishChatEvent).toHaveBeenCalledWith(c.id, "reaction", { messageId: "msg1", reactions: [{ emoji: "❤️", userId: "u1" }] });
    expect(notifyMod.notify).not.toHaveBeenCalled();
    // Only the message's reaction stamp moves (polling clients pick it up), never its read state
    expect(db.message.updateMany).toHaveBeenCalledTimes(1);
    expect(db.message.updateMany).toHaveBeenCalledWith({ where: { id: "msg1" }, data: { reactedAt: expect.any(Date) } });
  });

  it("two first taps at once: the losing create (P2002) becomes an update instead of a 500", async () => {
    const c = conv();
    db.conversation.findUnique.mockResolvedValue(c);
    db.message.findUnique.mockResolvedValue(msgOf(c.id));
    const { Prisma } = await import("@prisma/client");
    db.messageReaction.upsert.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "7" }),
    );
    (db.messageReaction as Record<string, ReturnType<typeof vi.fn>>).update = vi.fn().mockResolvedValue({});
    db.messageReaction.findMany.mockResolvedValue([{ emoji: "👍", userId: "u1" }]);
    const out = await setReaction({ conversationId: c.id, messageId: "msg1", userId: "u1", emoji: "👍" });
    expect((db.messageReaction as Record<string, ReturnType<typeof vi.fn>>).update).toHaveBeenCalledWith({
      where: { messageId_userId: { messageId: "msg1", userId: "u1" } },
      data: { emoji: "👍" },
    });
    expect(out).toEqual({ reactions: [{ emoji: "👍", mine: true }] });
  });

  it("one per member: a different emoji replaces mine (upsert on messageId + userId)", async () => {
    const c = conv();
    db.conversation.findUnique.mockResolvedValue(c);
    db.message.findUnique.mockResolvedValue(msgOf(c.id));
    db.messageReaction.findUnique.mockResolvedValue({ emoji: "❤️" });
    await setReaction({ conversationId: c.id, messageId: "msg1", userId: "u1", emoji: "👍" });
    expect(db.messageReaction.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { emoji: "👍" } }));
    expect(db.messageReaction.deleteMany).not.toHaveBeenCalled();
  });

  it("toggle: the same emoji again removes it, and null removes it", async () => {
    const c = conv();
    db.conversation.findUnique.mockResolvedValue(c);
    db.message.findUnique.mockResolvedValue(msgOf(c.id));
    db.messageReaction.findUnique.mockResolvedValue({ emoji: "🤲" });
    await setReaction({ conversationId: c.id, messageId: "msg1", userId: "u1", emoji: "🤲" });
    expect(db.messageReaction.deleteMany).toHaveBeenCalledWith({ where: { messageId: "msg1", userId: "u1" } });
    expect(db.messageReaction.upsert).not.toHaveBeenCalled();
    db.messageReaction.deleteMany.mockClear();
    await setReaction({ conversationId: c.id, messageId: "msg1", userId: "u1", emoji: null });
    expect(db.messageReaction.deleteMany).toHaveBeenCalledWith({ where: { messageId: "msg1", userId: "u1" } });
  });

  it("refused in an ENDED or EXPIRED chat, nothing saved or broadcast", async () => {
    for (const status of ["ENDED", "EXPIRED"]) {
      vi.clearAllMocks();
      const c = conv({ status });
      db.conversation.findUnique.mockResolvedValue(c);
      db.message.findUnique.mockResolvedValue(msgOf(c.id));
      await expect(setReaction({ conversationId: c.id, messageId: "msg1", userId: "u1", emoji: "👍" })).rejects.toBeInstanceOf(IntroError);
      expect(db.messageReaction.upsert).not.toHaveBeenCalled();
      expect(ably.publishChatEvent).not.toHaveBeenCalledWith(c.id, "reaction", expect.anything());
    }
  });

  it("refused across a block (either way) and for a stranger", async () => {
    const c = conv();
    db.conversation.findUnique.mockResolvedValue(c);
    db.message.findUnique.mockResolvedValue(msgOf(c.id));
    db.block.findFirst.mockResolvedValue({ id: "b" });
    await expectCode(setReaction({ conversationId: c.id, messageId: "msg1", userId: "u1", emoji: "👍" }), "NOT_FOUND");
    db.block.findFirst.mockImplementation(async ({ where }: { where: { OR?: unknown } }) => (where.OR ? { id: "b" } : null));
    await expectCode(setReaction({ conversationId: c.id, messageId: "msg1", userId: "u1", emoji: "👍" }), "BLOCKED");
    db.block.findFirst.mockResolvedValue(null);
    await expectCode(setReaction({ conversationId: c.id, messageId: "msg1", userId: "stranger", emoji: "👍" }), "NOT_FOUND");
    expect(db.messageReaction.upsert).not.toHaveBeenCalled();
    expect(ably.publishChatEvent).not.toHaveBeenCalled();
  });

  it("a message of another chat is not found", async () => {
    const c = conv();
    db.conversation.findUnique.mockResolvedValue(c);
    db.message.findUnique.mockResolvedValue({ id: "msg1", conversationId: "other" });
    await expectCode(setReaction({ conversationId: c.id, messageId: "msg1", userId: "u1", emoji: "👍" }), "NOT_FOUND");
    expect(db.messageReaction.upsert).not.toHaveBeenCalled();
  });

  it("the route accepts only the four emoji or null", async () => {
    expect([...REACTION_EMOJI]).toEqual(["❤️", "👍", "😊", "🤲"]);
    const c = conv();
    db.conversation.findUnique.mockResolvedValue(c);
    db.message.findUnique.mockResolvedValue(msgOf(c.id));
    const call = (body: unknown) =>
      reactionRoute(new Request("http://x", { method: "POST", body: JSON.stringify(body) }), {
        params: Promise.resolve({ id: c.id, messageId: "msg1" }),
      });
    expect((await call({ emoji: "😡" })).status).toBe(400);
    expect((await call({})).status).toBe(400);
    const ok = await call({ emoji: "😊" });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toHaveProperty("reactions");
    expect((await call({ emoji: null })).status).toBe(200);
  });
});

describe("typing", () => {
  it("signals the partner live (Ably `typing`) and the poll reads partnerTyping for 5 s", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const c = conv();
      db.conversation.findUnique.mockResolvedValue(c);
      await signalTyping(c.id, "f1");
      expect(ably.publishChatEvent).toHaveBeenCalledWith(c.id, "typing", { userId: "f1" });
      expect((await getConversation(c.id, "u1")).partnerTyping).toBe(true);
      // My own typing is never "partner typing"
      expect((await getConversation(c.id, "f1")).partnerTyping).toBe(false);
      vi.setSystemTime(Date.now() + TYPING_SHOW_MS + 1);
      expect((await getConversation(c.id, "u1")).partnerTyping).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a burst of signals publishes once every 2 s at most", async () => {
    const c = conv();
    db.conversation.findUnique.mockResolvedValue(c);
    await signalTyping(c.id, "f1");
    await signalTyping(c.id, "f1");
    expect(ably.publishChatEvent.mock.calls.filter((call) => call[1] === "typing")).toHaveLength(1);
  });

  it("refused in an ended chat, across a block and for a stranger: nothing broadcast", async () => {
    const ended = conv({ status: "ENDED" });
    db.conversation.findUnique.mockResolvedValue(ended);
    await expect(signalTyping(ended.id, "f1")).rejects.toBeInstanceOf(IntroError);
    const c = conv();
    db.conversation.findUnique.mockResolvedValue(c);
    db.block.findFirst.mockResolvedValue({ id: "b" });
    await expect(signalTyping(c.id, "f1")).rejects.toBeInstanceOf(IntroError);
    db.block.findFirst.mockResolvedValue(null);
    await expectCode(signalTyping(c.id, "stranger"), "NOT_FOUND");
    expect(ably.publishChatEvent).not.toHaveBeenCalled();
  });

  it("partnerTyping is false once the chat is ended or blocked, even right after a signal", async () => {
    const c = conv();
    db.conversation.findUnique.mockResolvedValue(c);
    await signalTyping(c.id, "f1");
    db.conversation.findUnique.mockResolvedValue({ ...c, status: "ENDED" });
    expect((await getConversation(c.id, "u1")).partnerTyping).toBe(false);
    db.conversation.findUnique.mockResolvedValue(c);
    db.block.findFirst.mockResolvedValue({ id: "b" });
    expect((await getConversation(c.id, "u1")).partnerTyping).toBe(false);
  });

  it("a sent message clears the sender's typing", async () => {
    const c = conv();
    db.conversation.findUnique.mockResolvedValue(c);
    await signalTyping(c.id, "f1");
    await sendMessage({ conversationId: c.id, senderId: "f1", body: "مرحباً" });
    expect((await getConversation(c.id, "u1")).partnerTyping).toBe(false);
  });

  it("the route answers 204 and refuses a closed chat", async () => {
    const c = conv();
    db.conversation.findUnique.mockResolvedValue(c);
    const call = () => typingRoute(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ id: c.id }) });
    expect((await call()).status).toBe(204);
    db.conversation.findUnique.mockResolvedValue({ ...c, status: "EXPIRED" });
    expect((await call()).status).toBeGreaterThanOrEqual(400);
  });
});

describe("conversation starters", () => {
  it("each starter passes the contact filter, for both genders", () => {
    for (const g of ["MALE", "FEMALE"]) {
      const list = chatStarters(g);
      expect(list).toHaveLength(4);
      for (const s of list) expect(checkMessage(s)).toEqual({ ok: true, text: s });
    }
  });

  it("an edited starter is filtered like any message", () => {
    const edited = `${chatStarters("MALE")[3]} رقمي 0791234567`;
    expect(checkMessage(edited).ok).toBe(false);
  });

  it("gendered: a man's starters address a woman, and the other way round", () => {
    const toHer = chatStarters("MALE").join(" ");
    const toHim = chatStarters("FEMALE").join(" ");
    expect(toHer).toContain("تبحثين");
    expect(toHer).toContain("شريك حياتك");
    expect(toHim).toContain("تبحث عنه");
    expect(toHim).toContain("شريكة حياتك");
    expect(toHer).not.toEqual(toHim);
  });

  it("GET sends the starters while I haven't written, none once I have", async () => {
    const c = conv();
    db.conversation.findUnique.mockResolvedValue(c);
    db.message.count.mockResolvedValue(0);
    expect((await getConversation(c.id, "u1")).starters).toEqual(chatStarters("MALE"));
    expect((await getConversation(c.id, "f1")).starters).toEqual(chatStarters("FEMALE"));
    db.message.count.mockImplementation(async ({ where }: { where: { senderId?: unknown } }) => (where.senderId === "u1" ? 1 : 0));
    expect((await getConversation(c.id, "u1")).starters).toEqual([]);
  });

  it("no starters in a chat that is not open", async () => {
    db.conversation.findUnique.mockResolvedValue(conv({ status: "EXPIRED" }));
    expect((await getConversation("c", "u1")).starters).toEqual([]);
  });
});

describe("partner activity label in the chat header", () => {
  const withActivity = (at: Date | null) => {
    const c = conv();
    return { ...c, match: { ...c.match, female: { ...c.match.female, lastActiveAt: at }, male: { ...c.match.male, lastActiveAt: at } } };
  };

  it("the chat GET says «نشطة اليوم» / «نشط هذا الأسبوع» for the partner, never a time", async () => {
    const today = new Date(Date.now() - 60 * 60 * 1000);
    db.conversation.findUnique.mockResolvedValue(withActivity(today));
    const res = await getConversation("c", "u1");
    expect(res.conversation.partner.activityLabel).toBe("نشطة اليوم");
    expect(JSON.stringify(res)).not.toContain("lastActiveAt");
    expect(JSON.stringify(res)).not.toContain(today.toISOString());
    db.conversation.findUnique.mockResolvedValue(withActivity(new Date(Date.now() - 3 * DAY)));
    expect((await getConversation("c", "f1")).conversation.partner.activityLabel).toBe("نشط هذا الأسبوع");
    db.conversation.findUnique.mockResolvedValue(withActivity(new Date(Date.now() - 20 * DAY)));
    expect((await getConversation("c", "u1")).conversation.partner.activityLabel).toBeNull();
    db.conversation.findUnique.mockResolvedValue(withActivity(null));
    expect((await getConversation("c", "u1")).conversation.partner.activityLabel).toBeNull();
  });

  it("no activity across a block", async () => {
    db.conversation.findUnique.mockResolvedValue(withActivity(new Date()));
    db.block.findFirst.mockResolvedValue({ id: "b" });
    expect((await getConversation("c", "u1")).conversation.partner.activityLabel).toBeNull();
  });

  it("the chats list carries it too, without lastActiveAt", async () => {
    db.conversation.findMany.mockResolvedValue([{ ...withActivity(new Date()), messages: [], _count: { messages: 0 } }]);
    db.block.findMany.mockResolvedValue([]);
    db.proSubscription.findMany.mockResolvedValue([]);
    const list = await listConversations("u1");
    expect(list[0].partner.activityLabel).toBe("نشطة اليوم");
    expect(JSON.stringify(list)).not.toContain("lastActiveAt");
  });
});

describe("activity label only in an open chat", () => {
  it("null once the chat is ENDED or EXPIRED, and for a partner who is not active", async () => {
    const recent = new Date(Date.now() - 60 * 60 * 1000);
    const withPartner = (over: object, partner: object = {}) => {
      const c = conv(over);
      return { ...c, match: { ...c.match, female: { ...c.match.female, lastActiveAt: recent, ...partner } } };
    };
    for (const status of ["ENDED", "EXPIRED"]) {
      db.conversation.findUnique.mockResolvedValue(withPartner({ status }));
      expect((await getConversation("c", "u1")).conversation.partner.activityLabel).toBeNull();
    }
    db.conversation.findUnique.mockResolvedValue(withPartner({}, { isDeactivated: true }));
    expect((await getConversation("c", "u1")).conversation.partner.activityLabel).toBeNull();
    db.conversation.findUnique.mockResolvedValue(withPartner({}, { status: "SUSPENDED" }));
    expect((await getConversation("c", "u1")).conversation.partner.activityLabel).toBeNull();
    db.conversation.findUnique.mockResolvedValue(withPartner({}));
    expect((await getConversation("c", "u1")).conversation.partner.activityLabel).toBe("نشطة اليوم");
  });
});

describe("dead surface", () => {
  it("service.ts no longer re-exports TYPING_SHOW_MS (import it from typing.ts)", () => {
    expect("TYPING_SHOW_MS" in chatService).toBe(false);
  });
});

describe("report a message (Report.messageId)", () => {
  beforeEach(() => {
    db.introRequest.updateMany.mockResolvedValue({ count: 0 });
  });

  it("a message of this chat goes with the report", async () => {
    const c = conv();
    db.conversation.findUnique.mockResolvedValue(c);
    db.message.findUnique.mockResolvedValue({ id: "bad", conversationId: c.id });
    await endConversation({ conversationId: c.id, userId: "u1", report: { reason: "HARASSMENT", messageId: "bad" } });
    expect(fileReport).toHaveBeenCalledWith(expect.objectContaining({ conversationId: c.id, messageId: "bad", reportedId: "f1" }));
  });

  it("a message of another chat (or one that is gone) is refused with 400 before anything is ended", async () => {
    const c = conv();
    db.conversation.findUnique.mockResolvedValue(c);
    for (const found of [{ id: "x", conversationId: "someone-elses" }, null]) {
      vi.mocked(fileReport).mockClear();
      db.conversation.update.mockClear();
      db.message.findUnique.mockResolvedValue(found);
      const err = await endConversation({ conversationId: c.id, userId: "u1", report: { reason: "SPAM", messageId: "x" } }).catch((e) => e);
      expect(err).toBeInstanceOf(IntroError);
      expect(err.status).toBe(400);
      expect(db.conversation.update).not.toHaveBeenCalled();
      expect(fileReport).not.toHaveBeenCalled();
    }
  });

  it("without messageId (app 1.0.x) a report works as before", async () => {
    const c = conv();
    db.conversation.findUnique.mockResolvedValue(c);
    await endConversation({ conversationId: c.id, userId: "u1", report: { reason: "SPAM" } });
    expect(db.message.findUnique).not.toHaveBeenCalled();
    expect(vi.mocked(fileReport).mock.calls[0][0]).not.toHaveProperty("messageId", expect.anything());
  });

  it("the end route takes report.messageId (optional, a short string)", async () => {
    const c = conv();
    db.conversation.findUnique.mockResolvedValue(c);
    db.message.findUnique.mockResolvedValue({ id: "bad", conversationId: c.id });
    const call = (body: unknown) =>
      endRoute(new Request("http://x", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id: c.id }) });
    expect((await call({ report: { reason: "HARASSMENT", messageId: "bad" } })).status).toBe(200);
    expect(fileReport).toHaveBeenCalledWith(expect.objectContaining({ messageId: "bad" }));
    expect((await call({ report: { reason: "HARASSMENT", messageId: "x".repeat(200) } })).status).toBe(400);
    expect((await call({ report: { reason: "HARASSMENT" } })).status).toBe(200);
  });
});

describe("polling: reactions on older messages (?after= with reactionsSince)", () => {
  it("every GET says when the server answered (polledAt)", async () => {
    db.conversation.findUnique.mockResolvedValue(conv());
    const before = Date.now();
    const res = await getConversation("c", "u1");
    expect(Date.parse(res.polledAt)).toBeGreaterThanOrEqual(before);
  });

  it("a poll with reactionsSince returns the reactions of messages whose reactions changed since then", async () => {
    const c = conv();
    db.conversation.findUnique.mockResolvedValue(c);
    const since = new Date(Date.now() - 10_000).toISOString();
    db.message.findMany.mockImplementation(async (args: { where: { reactedAt?: unknown } }) =>
      args.where.reactedAt
        ? [{ id: "old", reactions: [{ emoji: "❤️", userId: "f1" }] }, { id: "old2", reactions: [] }]
        : [],
    );
    const res = await getConversation(c.id, "u1", { after: new Date().toISOString(), reactionsSince: since });
    expect(res.reactionUpdates).toEqual([
      { messageId: "old", reactions: [{ emoji: "❤️", mine: false }] },
      // All reactions removed: an empty list, so the chip goes away
      { messageId: "old2", reactions: [] },
    ]);
    const query = db.message.findMany.mock.calls.find((call) => call[0].where.reactedAt)![0];
    expect(query.where).toEqual({ conversationId: c.id, reactedAt: { gte: new Date(since) } });
    expect(JSON.stringify(res.reactionUpdates)).not.toContain("f1");
  });

  it("no reactionsSince (old clients, first load): no reactionUpdates and no extra query", async () => {
    db.conversation.findUnique.mockResolvedValue(conv());
    const res = await getConversation("c", "u1", { after: new Date().toISOString() });
    expect(res).not.toHaveProperty("reactionUpdates");
    expect(db.message.findMany.mock.calls.some((call) => call[0].where.reactedAt)).toBe(false);
  });

  it("the GET route passes a valid reactionsSince through and ignores a bad one", async () => {
    const c = conv();
    db.conversation.findUnique.mockResolvedValue(c);
    const since = new Date(Date.now() - 5000).toISOString();
    const res = await chatRoute(new Request(`http://x/api/chats/${c.id}?after=${encodeURIComponent(since)}&reactionsSince=${encodeURIComponent(since)}`), {
      params: Promise.resolve({ id: c.id }),
    });
    expect((await res.json()).reactionUpdates).toEqual([]);
    const bad = await chatRoute(new Request(`http://x/api/chats/${c.id}?after=${encodeURIComponent(since)}&reactionsSince=nope`), {
      params: Promise.resolve({ id: c.id }),
    });
    expect(await bad.json()).not.toHaveProperty("reactionUpdates");
  });
});
