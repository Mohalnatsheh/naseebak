import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const db = vi.hoisted(() => ({ conversation: { findUnique: vi.fn() }, report: { findMany: vi.fn() }, message: { findUnique: vi.fn() } }));
const auth = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/auth", () => auth);

import { GET } from "@/app/api/admin/chats/[id]/messages/route";

const call = (id = "c1") => GET(new Request("http://x"), { params: Promise.resolve({ id }) }) as Promise<Response>;
const sara = { id: "f1", firstName: "سارة", lastName: "أ", status: "VERIFIED" };
const yazan = { id: "m1", firstName: "يزن", lastName: "ب", status: "PENDING" };

beforeEach(() => {
  vi.clearAllMocks();
  auth.requireAdmin.mockResolvedValue({ session: { user: { id: "admin1", role: "ADMIN" } } });
  db.report.findMany.mockResolvedValue([]);
});

describe("GET /api/admin/chats/[id]/messages", () => {
  it("is admin-only", async () => {
    auth.requireAdmin.mockResolvedValue({ error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) });
    expect((await call()).status).toBe(403);
    expect(db.conversation.findUnique).not.toHaveBeenCalled();
  });

  it("404s for an unknown chat", async () => {
    db.conversation.findUnique.mockResolvedValue(null);
    expect((await call("nope")).status).toBe(404);
  });

  it("returns the people and full history oldest first, and logs the view", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const now = Date.now();
    db.conversation.findUnique.mockResolvedValue({
      id: "c1", status: "ENDED", createdAt: new Date(now - 864e5), expiresAt: new Date(now + 864e5), extended: false,
      endedById: "m1", endedByAdminId: null, endedAt: new Date(now),
      match: { id: "mm1", female: sara, male: yazan },
      // the query returns the newest first; the route shows them oldest first
      messages: [
        { id: "b", senderId: "m1", body: "وعليكم السلام", readAt: null, createdAt: new Date(now) },
        { id: "a", senderId: "f1", body: "السلام عليكم", readAt: new Date(now), createdAt: new Date(now - 1000) },
      ],
    });
    const res = await call();
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.chat.people.map((p: { id: string }) => p.id)).toEqual(["f1", "m1"]);
    expect(d.chat.endedBy).toBe("يزن");
    expect(d.messages.map((m: { body: string }) => m.body)).toEqual(["السلام عليكم", "وعليكم السلام"]);
    expect(d.truncated).toBe(false);
    expect(db.conversation.findUnique.mock.calls[0][0].select.messages.orderBy).toEqual({ createdAt: "desc" });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("[admin-chat-view] admin=admin1 chat=c1"));
  });

  const ended = (endedByAdminId: string | null, endedById: string | null = null) => ({
    id: "c1", status: "ENDED", createdAt: new Date(), expiresAt: new Date(Date.now() + 864e5), extended: false,
    endedById, endedByAdminId, endedAt: new Date(),
    match: { id: "mm1", female: sara, male: yazan },
    messages: [],
  });

  it("tells admin, report pause and system apart, like the list", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const by = async (row: ReturnType<typeof ended>) => {
      db.conversation.findUnique.mockResolvedValue(row);
      return (await (await call()).json()).chat.endedBy;
    };
    expect(await by(ended("admin1"))).toBe("admin");
    expect(await by(ended("system:report-review"))).toBe("paused");
    expect(await by(ended("system:match-closed"))).toBe("system");
    expect(await by(ended(null, "f1"))).toBe("سارة");
    expect(await by(ended(null))).toBeNull();
  });

  it("returns the match id and the chat's reports", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    db.conversation.findUnique.mockResolvedValue(ended("admin1"));
    db.report.findMany.mockResolvedValue([{ id: "r1", status: "PENDING", createdAt: new Date() }]);
    const d = await (await call()).json();
    expect(d.chat.matchId).toBe("mm1");
    expect(d.chat.reports.map((r: { id: string }) => r.id)).toEqual(["r1"]);
    expect(db.report.findMany.mock.calls[0][0].where).toEqual({ conversationId: "c1" });
  });

  it("returns each message's kind and the members-only media route, never the storage path", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    db.conversation.findUnique.mockResolvedValue({
      ...ended("admin1"),
      messages: [
        {
          id: "p1", senderId: "f1", body: "📷 صورة — حدّث التطبيق لعرضها", readAt: null, createdAt: new Date(),
          kind: "IMAGE", mediaType: "image/webp", mediaDurationSec: null, mediaWidth: 1600, mediaHeight: 900,
        },
        { id: "t1", senderId: "m1", body: "مرحبا", readAt: null, createdAt: new Date(), kind: "TEXT", mediaType: null, mediaDurationSec: null, mediaWidth: null, mediaHeight: null },
      ],
    });
    const d = await (await call()).json();
    const select = db.conversation.findUnique.mock.calls[0][0].select.messages.select;
    expect(select.mediaPath).toBeUndefined();
    const [t, p] = d.messages;
    expect(t).toMatchObject({ id: "t1", kind: "TEXT", media: null });
    expect(p).toMatchObject({
      id: "p1", kind: "IMAGE",
      media: { url: "/api/chats/c1/media/p1", type: "image/webp", durationSec: null, width: 1600, height: 900 },
    });
  });

  it("shows replies (same chat only) and who reacted with what, read-only", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const base = { readAt: null, createdAt: new Date(), kind: "TEXT", mediaType: null, mediaDurationSec: null, mediaWidth: null, mediaHeight: null };
    db.conversation.findUnique.mockResolvedValue({
      ...ended("admin1"),
      messages: [
        { ...base, id: "x", senderId: "m1", body: "سؤال", replyTo: { id: "y", conversationId: "other", senderId: "f9", kind: "TEXT", body: "سر" }, reactions: [] },
        { ...base, id: "r", senderId: "m1", body: "نعم", replyTo: { id: "q", conversationId: "c1", senderId: "f1", kind: "VOICE", body: "x" }, reactions: [{ emoji: "❤️", userId: "f1" }] },
      ],
    });
    const d = await (await call()).json();
    const [r, x] = d.messages;
    expect(r.replyTo).toEqual({ id: "q", senderId: "f1", kind: "VOICE", snippet: "🎤 رسالة صوتية" });
    expect(r.reactions).toEqual([{ emoji: "❤️", userId: "f1" }]);
    expect(x.replyTo).toBeNull();
    expect(JSON.stringify(d)).not.toContain("سر");
  });
});

describe("GET /api/admin/chats/[id]/messages deletion info", () => {
  const T = (min: number) => new Date(Date.UTC(2026, 10, 11, 10, min));
  const base = { senderId: "f1", readAt: null, kind: "TEXT", mediaType: null, mediaDurationSec: null, mediaWidth: null, mediaHeight: null };
  const chat = (over: Record<string, unknown>, messages: unknown[]) => ({
    ...{
      id: "c1", status: "ACTIVE", createdAt: T(0), expiresAt: new Date(Date.now() + 864e5), extended: false,
      endedById: null, endedByAdminId: null, endedAt: null,
      match: { id: "mm1", female: sara, male: yazan },
      clearedAt: null, clearedById: null, clears: [],
    },
    ...over,
    messages,
  });

  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("keeps the real body of a deleted message and marks it deleted for everyone", async () => {
    db.conversation.findUnique.mockResolvedValue(
      chat({}, [{ ...base, id: "d", body: "نص أصلي", createdAt: T(5), deletedAt: T(6), hides: [] }]),
    );
    const d = await (await call()).json();
    expect(d.messages[0].body).toBe("نص أصلي");
    expect(d.messages[0].deletion).toEqual({ forEveryone: true, hiddenBy: [], clearedForEveryone: false, beforeClearOf: [] });
    const select = db.conversation.findUnique.mock.calls[0][0].select;
    expect(select.messages.select.deletedAt).toBe(true);
    expect(select.messages.select.hides).toBeDefined();
    expect(select.clearedAt).toBe(true);
    expect(select.clearedById).toBe(true);
    expect(select.clears).toBeDefined();
  });

  it("lists who hid a message for themselves", async () => {
    db.conversation.findUnique.mockResolvedValue(
      chat({}, [{ ...base, id: "h", body: "x", createdAt: T(5), deletedAt: null, hides: [{ userId: "f1" }] }]),
    );
    const d = await (await call()).json();
    expect(d.messages[0].deletion).toEqual({ forEveryone: false, hiddenBy: ["f1"], clearedForEveryone: false, beforeClearOf: [] });
  });

  it("marks messages at or before the chat's clear for everyone, and returns the clear info", async () => {
    db.conversation.findUnique.mockResolvedValue(
      chat({ clearedAt: T(10), clearedById: "m1" }, [
        { ...base, id: "after", body: "b", createdAt: T(11), deletedAt: null, hides: [] },
        { ...base, id: "edge", body: "a", createdAt: T(10), deletedAt: null, hides: [] },
        { ...base, id: "before", body: "a", createdAt: T(9), deletedAt: null, hides: [] },
      ]),
    );
    const d = await (await call()).json();
    expect(d.chat.clearedAt).toBe(T(10).toISOString());
    expect(d.chat.clearedById).toBe("m1");
    const by = Object.fromEntries(d.messages.map((m: { id: string; deletion: { clearedForEveryone: boolean } }) => [m.id, m.deletion.clearedForEveryone]));
    expect(by).toEqual({ before: true, edge: true, after: false });
  });

  it("lists the members whose own clear covers the message", async () => {
    db.conversation.findUnique.mockResolvedValue(
      chat({ clears: [{ userId: "m1", clearedAt: T(8) }] }, [
        { ...base, id: "late", body: "b", createdAt: T(9), deletedAt: null, hides: [] },
        { ...base, id: "edge", body: "a", createdAt: T(8), deletedAt: null, hides: [] },
        { ...base, id: "early", body: "a", createdAt: T(7), deletedAt: null, hides: [] },
      ]),
    );
    const d = await (await call()).json();
    expect(d.chat.clears).toEqual([{ userId: "m1", clearedAt: T(8).toISOString() }]);
    const by = Object.fromEntries(d.messages.map((m: { id: string; deletion: { beforeClearOf: string[] } }) => [m.id, m.deletion.beforeClearOf]));
    expect(by).toEqual({ early: ["m1"], edge: ["m1"], late: [] });
  });

  it("an untouched message has every field false or empty", async () => {
    db.conversation.findUnique.mockResolvedValue(
      chat({}, [{ ...base, id: "u", body: "x", createdAt: T(5), deletedAt: null, hides: [] }]),
    );
    const d = await (await call()).json();
    expect(d.messages[0].deletion).toEqual({ forEveryone: false, hiddenBy: [], clearedForEveryone: false, beforeClearOf: [] });
    expect(d.chat.clearedAt).toBeNull();
    expect(d.chat.clears).toEqual([]);
  });
});

describe("GET /api/admin/chats/[id]/messages paging (ADM-26)", () => {
  const chatWith = (ids: string[]) => ({
    id: "c1", status: "ACTIVE", createdAt: new Date(), expiresAt: new Date(Date.now() + 864e5), extended: false,
    endedById: null, endedByAdminId: null, endedAt: null,
    match: { id: "mm1", female: { id: "f1", firstName: "س", lastName: "أ", status: "VERIFIED" }, male: { id: "m1", firstName: "ي", lastName: "ب", status: "VERIFIED" } },
    // newest first, as the query returns them
    messages: ids.map((id, i) => ({ id, senderId: "f1", body: id, readAt: null, createdAt: new Date(Date.now() - i * 1000) })),
  });
  const get = (qs: string) => GET(new Request(`http://x/api/admin/chats/c1/messages${qs}`), { params: Promise.resolve({ id: "c1" }) }) as Promise<Response>;

  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("?limit=2 gives the newest two oldest first, with hasMore and the cursor for older ones", async () => {
    db.conversation.findUnique.mockResolvedValue(chatWith(["m5", "m4", "m3"]));
    const d = await (await get("?limit=2")).json();
    expect(db.conversation.findUnique.mock.calls[0][0].select.messages).toMatchObject({ take: 3, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    expect(d.messages.map((m: { id: string }) => m.id)).toEqual(["m4", "m5"]);
    expect(d).toMatchObject({ hasMore: true, nextBefore: "m4", truncated: true });
  });

  it("?before= from another chat is refused", async () => {
    db.message.findUnique.mockResolvedValue({ conversationId: "other" });
    expect((await get("?limit=2&before=x")).status).toBe(400);
    expect(db.conversation.findUnique).not.toHaveBeenCalled();
  });

  it("?before= reads the page older than that message, by cursor", async () => {
    db.message.findUnique.mockResolvedValue({ conversationId: "c1" });
    db.conversation.findUnique.mockResolvedValue(chatWith(["m3"]));
    const d = await (await get("?limit=2&before=m4")).json();
    const q = db.conversation.findUnique.mock.calls[0][0].select.messages;
    expect(q).toMatchObject({ cursor: { id: "m4" }, skip: 1, take: 3, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    expect(d).toMatchObject({ hasMore: false, nextBefore: null });
  });

  it("caps the page at 500 and refuses a bad limit", async () => {
    db.conversation.findUnique.mockResolvedValue(chatWith([]));
    await get("?limit=9999");
    expect(db.conversation.findUnique.mock.calls[0][0].select.messages.take).toBe(501);
    expect((await get("?limit=abc")).status).toBe(400);
  });
});
