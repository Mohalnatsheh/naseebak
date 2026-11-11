/**
 * Chat delete (Pro), task 3: member reads apply the hides. Deleted-for-everyone messages come back as the trace
 * («تم حذف الرسالة») in a shape old apps show as plain text; hides and clears are applied in SQL; counts that drive
 * chat rules (bothWrote, starters) keep reading the real history.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  conversation: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  conversationClear: { findUnique: vi.fn(), findMany: vi.fn() },
  message: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
  messageHide: { findMany: vi.fn() },
  block: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
  introRequest: { updateMany: vi.fn(), findFirst: vi.fn() },
  visitRequest: { findUnique: vi.fn() },
}));
const settings = vi.hoisted(() => ({ getCycleFlags: vi.fn(), getChatDeleteEnabled: vi.fn() }));
const auth = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/ably", () => ({ publishChatEvent: vi.fn() }));
vi.mock("@/lib/notify", () => ({ notify: vi.fn(), notifyMany: vi.fn() }));
vi.mock("@/lib/chat/bell", () => ({ upsertChatBell: vi.fn(), clearChatBell: vi.fn() }));
vi.mock("@/lib/settings", () => settings);
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(() => ({ success: true })) }));
vi.mock("@/lib/reports", () => ({ fileReport: vi.fn() }));
vi.mock("@/lib/pro/status", () => ({ isPro: vi.fn(async () => false), proUserIds: vi.fn(async () => new Set()) }));
vi.mock("@/lib/auth", () => auth);

import { getConversation, listConversations, sendMessage } from "@/lib/chat/service";
import { DELETED_TRACE, visibleMessageWhere } from "@/lib/chat/visibility";
import { GET as chatRoute } from "@/app/api/chats/[id]/route";

const DAY = 24 * 60 * 60 * 1000;
const conv = (over: object = {}) => ({
  id: "c1",
  matchId: "m1",
  status: "ACTIVE",
  expiresAt: new Date(Date.now() + 10 * DAY),
  createdAt: new Date(Date.now() - 4 * DAY),
  extended: false,
  expiryWarnedAt: null,
  familyNudgeAt: null,
  endedById: null,
  clearedAt: null,
  clearedById: null,
  match: {
    id: "m1", femaleId: "f1", maleId: "u1",
    female: { id: "f1", firstName: "هديل", isVerified: true },
    male: { id: "u1", firstName: "يزن", isVerified: true },
  },
  ...over,
});
const row = (over: object = {}) => ({
  id: "a", conversationId: "c1", senderId: "f1", body: "السلام عليكم", createdAt: new Date(), readAt: null,
  kind: "TEXT", replyToId: null, replyTo: null, reactions: [], hides: [], deletedAt: null, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  settings.getCycleFlags.mockResolvedValue({ introRequests: true, chat: true });
  settings.getChatDeleteEnabled.mockResolvedValue(false);
  auth.requireUser.mockResolvedValue({ session: { user: { id: "u1" } } });
  db.conversation.findUnique.mockResolvedValue(conv());
  db.conversation.updateMany.mockResolvedValue({ count: 1 });
  db.conversationClear.findUnique.mockResolvedValue(null);
  db.conversationClear.findMany.mockResolvedValue([]);
  db.block.findFirst.mockResolvedValue(null);
  db.block.findMany.mockResolvedValue([]);
  db.message.findMany.mockResolvedValue([]);
  db.message.count.mockResolvedValue(0);
  db.message.findFirst.mockResolvedValue(null);
  db.messageHide.findMany.mockResolvedValue([]);
});

describe("deleted-for-everyone message (every app version)", () => {
  it("old-client shape: the trace as TEXT, no media, no quote, no reactions", async () => {
    db.message.findMany.mockResolvedValue([
      row({
        kind: "IMAGE", body: "📷 صورة — حدّث التطبيق لعرضها", mediaType: "image/webp", mediaWidth: 10, mediaHeight: 10,
        deletedAt: new Date(), reactions: [{ emoji: "❤️", userId: "u1" }],
        replyTo: { id: "q", conversationId: "c1", senderId: "u1", kind: "TEXT", body: "سؤال", createdAt: new Date(), deletedAt: null, hides: [] },
      }),
    ]);
    const res = await getConversation("c1", "u1");
    expect(res.messages[0]).toMatchObject({
      body: DELETED_TRACE, kind: "TEXT", media: null, replyTo: null, reactions: [], deleted: true,
    });
    expect(JSON.stringify(res.messages)).not.toContain("صورة");
    expect(JSON.stringify(res.messages)).not.toContain("سؤال");
  });

  it("a normal message carries no `deleted` key (old keys unchanged)", async () => {
    db.message.findMany.mockResolvedValue([row()]);
    const res = await getConversation("c1", "u1");
    expect("deleted" in res.messages[0]).toBe(false);
    expect(res.messages[0].body).toBe("السلام عليكم");
  });

  it("reply quote of a deleted, hidden or cleared message is the trace", async () => {
    const cleared = new Date(Date.now() - DAY);
    db.conversation.findUnique.mockResolvedValue(conv({ clearedAt: cleared }));
    const quote = (over: object) => ({
      id: "q", conversationId: "c1", senderId: "f1", kind: "IMAGE", body: "سر", createdAt: new Date(), deletedAt: null, hides: [], ...over,
    });
    db.message.findMany.mockResolvedValue([
      row({ id: "r1", replyTo: quote({ deletedAt: new Date() }) }),
      row({ id: "r2", replyTo: quote({ hides: [{ userId: "u1" }] }) }),
      row({ id: "r3", replyTo: quote({ createdAt: cleared }) }),
    ]);
    const res = await getConversation("c1", "u1");
    for (const m of res.messages) {
      expect(m.replyTo).toMatchObject({ id: "q", snippet: DELETED_TRACE, kind: "TEXT" });
    }
    expect(JSON.stringify(res)).not.toContain("سر");
  });
});

describe("page queries apply the visibility in SQL", () => {
  it("page query uses visibility: the later of the chat clear and my clear", async () => {
    const chatClear = new Date("2026-11-01T10:00:00.000Z");
    const myClear = new Date("2026-11-05T10:00:00.000Z");
    db.conversation.findUnique.mockResolvedValue(conv({ clearedAt: chatClear }));
    db.conversationClear.findUnique.mockResolvedValue({ conversationId: "c1", userId: "u1", clearedAt: myClear });
    const res = await getConversation("c1", "u1");
    expect(db.conversationClear.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { conversationId_userId: { conversationId: "c1", userId: "u1" } } }),
    );
    const where = db.message.findMany.mock.calls[0][0].where;
    expect(where.AND[0]).toEqual(visibleMessageWhere("c1", "u1", myClear));
    expect(res.clearedBefore).toBe(myClear.toISOString());

    const T = "2026-11-10T10:00:00.000Z";
    await getConversation("c1", "u1", { after: T });
    const pollWhere = db.message.findMany.mock.calls.at(-1)![0].where;
    expect(pollWhere).toEqual({ AND: [visibleMessageWhere("c1", "u1", myClear), { createdAt: { gte: new Date(T) } }] });
  });

  it("clearedBefore is null with no clear", async () => {
    const res = await getConversation("c1", "u1");
    expect(res.clearedBefore).toBeNull();
    expect(db.message.findMany.mock.calls[0][0].where.AND[0]).toEqual(visibleMessageWhere("c1", "u1", null));
  });

  it("paging stops at the clear point: only post-cutoff rows come back, so no more pages", async () => {
    const cleared = new Date(Date.now() - DAY);
    db.conversation.findUnique.mockResolvedValue(conv({ clearedAt: cleared }));
    db.message.findMany.mockResolvedValue([row({ id: "n1", createdAt: new Date(cleared.getTime() + 1000) })]);
    const res = await getConversation("c1", "u1");
    expect(res.hasMore).toBe(false);
  });

  it("a message after the clear shows normally", async () => {
    const cleared = new Date(Date.now() - DAY);
    db.conversation.findUnique.mockResolvedValue(conv({ clearedAt: cleared }));
    db.message.findMany.mockResolvedValue([row({ id: "n1", body: "بعد المسح", createdAt: new Date(cleared.getTime() + 1000) })]);
    const res = await getConversation("c1", "u1");
    expect(res.messages[0]).toMatchObject({ id: "n1", body: "بعد المسح", kind: "TEXT" });
    expect(res.conversation.lastMessage?.body).toBe("بعد المسح");
  });

  it("bothWrote ignores hides: the sent counts read the real history", async () => {
    db.message.count.mockResolvedValue(1);
    const res = await getConversation("c1", "u1");
    const countWheres = db.message.count.mock.calls.map((c) => c[0].where);
    expect(countWheres).toContainEqual({ conversationId: "c1", senderId: "u1" });
    expect(countWheres).toContainEqual({ conversationId: "c1", senderId: "f1" });
    expect(res.bothWrote).toBe(true);
  });
});

describe("chat list preview follows my view", () => {
  const listed = (over: object, messages: object[]) => ({ ...conv(over), messages, _count: { messages: 0 } });

  it("list preview of deleted: the trace; a newest message at/before my cutoff: no preview", async () => {
    const myClear = new Date(Date.now() - DAY);
    db.conversation.findMany.mockResolvedValue([
      listed({ id: "c1" }, [{ body: "سر", kind: "TEXT", createdAt: new Date(), senderId: "f1", readAt: null, deletedAt: new Date() }]),
      listed({ id: "c2" }, [{ body: "قديم", kind: "TEXT", createdAt: myClear, senderId: "f1", readAt: null, deletedAt: null }]),
    ]);
    db.conversationClear.findMany.mockResolvedValue([{ conversationId: "c2", userId: "u1", clearedAt: myClear }]);
    const list = await listConversations("u1");
    expect(db.conversationClear.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "u1" } }));
    const inc = db.conversation.findMany.mock.calls[0][0].include.messages;
    expect(inc.where).toEqual({ hides: { none: { userId: "u1" } } });
    expect(inc.select.deletedAt).toBe(true);
    expect(list.find((s) => s.id === "c1")!.lastMessage?.body).toBe(DELETED_TRACE);
    expect(list.find((s) => s.id === "c2")!.lastMessage).toBeNull();
    expect(JSON.stringify(list)).not.toContain("سر");
  });

  it("the chat-wide clear also hides the preview", async () => {
    const cleared = new Date(Date.now() - DAY);
    db.conversation.findMany.mockResolvedValue([
      listed({ id: "c1", clearedAt: cleared }, [{ body: "قديم", kind: "TEXT", createdAt: new Date(cleared.getTime() - 1), senderId: "u1", readAt: null, deletedAt: null }]),
    ]);
    const [s] = await listConversations("u1");
    expect(s.lastMessage).toBeNull();
  });
});

describe("chat GET route", () => {
  const get = (qs = "") => chatRoute(new Request(`http://x/api/chats/c1${qs}`), { params: Promise.resolve({ id: "c1" }) });

  it("adds deleteEnabled from the switch and clearedBefore", async () => {
    settings.getChatDeleteEnabled.mockResolvedValue(true);
    const body = await (await get()).json();
    expect(body.deleteEnabled).toBe(true);
    expect(body.clearedBefore).toBeNull();
    expect(body).not.toHaveProperty("deletedIds");
    expect(body).not.toHaveProperty("hiddenIds");
  });

  it("poll returns deletedIds/hiddenIds since reactionsSince", async () => {
    const T = "2026-11-10T10:00:00.000Z";
    const S = "2026-11-10T09:59:55.000Z";
    db.message.findMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
      "deletedAt" in where ? [{ id: "d1" }, { id: "d2" }] : []);
    db.messageHide.findMany.mockResolvedValue([{ messageId: "h1" }]);
    const body = await (await get(`?after=${T}&reactionsSince=${S}`)).json();
    expect(body.deletedIds).toEqual(["d1", "d2"]);
    expect(body.hiddenIds).toEqual(["h1"]);
    expect(db.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { conversationId: "c1", deletedAt: { gte: new Date(S) } } }),
    );
    expect(db.messageHide.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1", createdAt: { gte: new Date(S) }, message: { conversationId: "c1" } } }),
    );
  });

  it("a poll without reactionsSince carries no deletedIds/hiddenIds", async () => {
    const body = await (await get("?after=2026-11-10T10:00:00.000Z")).json();
    expect(body).not.toHaveProperty("deletedIds");
    expect(body).not.toHaveProperty("hiddenIds");
    expect(db.messageHide.findMany).not.toHaveBeenCalled();
  });
});

describe("first page widens to 100 in chats with deletion state (old apps' 100-message cache)", () => {
  /** The deletion-state probe: one message.findFirst with an OR of deletedAt / my hides */
  const probeHits = (hit: boolean) =>
    db.message.findFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
      "OR" in where && hit ? { id: "x" } : null);
  const pageTake = () => {
    const call = db.message.findMany.mock.calls.find(([a]) => (a as { orderBy?: unknown }).orderBy && Array.isArray((a as { orderBy: unknown }).orderBy));
    return (call?.[0] as { take: number }).take;
  };

  it("a chat with a deleted message (or a hide by me) gets take: 101 on the first page", async () => {
    probeHits(true);
    await getConversation("c1", "u1");
    expect(pageTake()).toBe(101);
    expect(db.message.findFirst).toHaveBeenCalledWith({
      where: { conversationId: "c1", OR: [{ deletedAt: { not: null } }, { hides: { some: { userId: "u1" } } }] },
      select: { id: true },
    });
  });

  it("hasMore stays right on the widened page", async () => {
    probeHits(true);
    db.message.findMany.mockResolvedValue(Array.from({ length: 101 }, (_, i) => row({ id: `m${i}`, createdAt: new Date(Date.now() - i * 1000) })));
    const res = await getConversation("c1", "u1");
    expect(res.messages).toHaveLength(100);
    expect(res.hasMore).toBe(true);
  });

  it("a chat with no deletion state keeps the normal limit", async () => {
    probeHits(false);
    await getConversation("c1", "u1");
    expect(pageTake()).toBe(31);
    db.message.findMany.mockClear();
    await getConversation("c1", "u1", { limit: 50 });
    expect(pageTake()).toBe(51);
  });

  it("my own clear alone triggers it", async () => {
    probeHits(false);
    db.conversationClear.findUnique.mockResolvedValue({ clearedAt: new Date(Date.now() - DAY) });
    await getConversation("c1", "u1");
    expect(pageTake()).toBe(101);
  });

  it("a chat-wide clear triggers it", async () => {
    probeHits(false);
    db.conversation.findUnique.mockResolvedValue(conv({ clearedAt: new Date(Date.now() - DAY), clearedById: "f1" }));
    await getConversation("c1", "u1");
    expect(pageTake()).toBe(101);
  });

  it("before / after requests are unchanged and never probe", async () => {
    probeHits(true);
    await getConversation("c1", "u1", { before: new Date().toISOString() });
    expect(pageTake()).toBe(31);
    db.message.findMany.mockClear();
    await getConversation("c1", "u1", { after: new Date(Date.now() - 1000).toISOString() });
    const afterCall = db.message.findMany.mock.calls.find(([a]) => (a as { orderBy?: unknown }).orderBy && Array.isArray((a as { orderBy: unknown }).orderBy));
    expect((afterCall?.[0] as { take: number }).take).toBe(100);
    expect(db.message.findFirst).not.toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ OR: expect.anything() }) }));
  });
});

describe("a retried send (same nonce) applies the clear point to its quote", () => {
  const quote = (createdAt: Date) => ({
    id: "q", conversationId: "c1", senderId: "f1", kind: "TEXT", body: "سر", createdAt, deletedAt: null, hides: [],
  });

  it("a quote of a message cleared for everyone comes back as the trace", async () => {
    const cleared = new Date(Date.now() - DAY);
    db.conversation.findUnique.mockResolvedValue(conv({ clearedAt: cleared, clearedById: "f1" }));
    db.message.findFirst.mockResolvedValueOnce(row({ id: "s1", senderId: "u1", body: "رد", replyToId: "q", replyTo: quote(cleared) }));
    const m = await sendMessage({ conversationId: "c1", senderId: "u1", body: "رد", clientNonce: "n-clear" });
    expect(m.id).toBe("s1");
    expect(m.replyTo).toMatchObject({ id: "q", snippet: DELETED_TRACE });
    expect(JSON.stringify(m)).not.toContain("سر");
    expect(db.message.create).not.toHaveBeenCalled();
  });

  it("my own clear applies too", async () => {
    const mine = new Date(Date.now() - DAY);
    db.conversationClear.findUnique.mockResolvedValue({ clearedAt: mine });
    db.message.findFirst.mockResolvedValueOnce(row({ id: "s2", senderId: "u1", body: "رد", replyToId: "q", replyTo: quote(mine) }));
    const m = await sendMessage({ conversationId: "c1", senderId: "u1", body: "رد", clientNonce: "n-myclear" });
    expect(m.replyTo).toMatchObject({ id: "q", snippet: DELETED_TRACE });
  });
});
