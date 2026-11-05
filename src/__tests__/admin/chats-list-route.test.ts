import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  conversation: { findMany: vi.fn() },
  message: { groupBy: vi.fn() },
  report: { findMany: vi.fn() },
  $queryRaw: vi.fn(),
}));
const auth = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
const country = vi.hoisted(() => ({ value: "JO" }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/auth", () => auth);
vi.mock("@/lib/chat/unread-sms", () => ({ chatSmsOverview: vi.fn().mockResolvedValue(new Map()) }));
vi.mock("@/lib/admin/country-filter", () => ({
  getAdminCountry: vi.fn(async () => country.value),
  matchCountryWhere: (c: string) => (c === "ALL" ? {} : { female: { country: c } }),
}));

import { GET } from "@/app/api/admin/chats/route";
import { buildChatActivity, chatSummary, type LastMessageRow, type SenderCountRow } from "@/lib/admin/chat-list";
import { effectiveConversationStatus } from "@/lib/admin/cycle-stats";

const now = new Date("2026-11-05T10:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 36e5);
const chat = (id: string) => ({ id, status: "ACTIVE", createdAt: hoursAgo(50), expiresAt: new Date(now.getTime() + 864e5), endedByAdminId: null });

// Every message in the table; c9 belongs to another country
const allSenders: SenderCountRow[] = [
  { conversationId: "c1", senderId: "a", _count: { _all: 3 } },
  { conversationId: "c1", senderId: "b", _count: { _all: 2 } },
  { conversationId: "c2", senderId: "a", _count: { _all: 1 } },
  { conversationId: "c9", senderId: "z", _count: { _all: 40 } },
];
const allLast: LastMessageRow[] = [
  { conversationId: "c1", senderId: "b", createdAt: hoursAgo(1) },
  { conversationId: "c2", senderId: "a", createdAt: hoursAgo(60) },
  { conversationId: "c9", senderId: "z", createdAt: hoursAgo(2) },
];

describe("chat activity limited to the chats in scope", () => {
  const chats = [chat("c1"), chat("c2"), chat("c3")];
  const inScope = new Set(chats.map((c) => c.id));
  const status = (c: { status: string; expiresAt: Date }) => effectiveConversationStatus(c, now);
  const build = (senders: SenderCountRow[], last: LastMessageRow[]) => buildChatActivity(chats, senders, last, ["c2", "c9", null], status);

  it("gives the same activity and summary with only their messages as with the whole table", () => {
    const whole = build(allSenders, allLast);
    const scoped = build(
      allSenders.filter((r) => inScope.has(r.conversationId)),
      allLast.filter((r) => inScope.has(r.conversationId)),
    );
    expect([...scoped.entries()]).toEqual([...whole.entries()]);
    expect(chatSummary([...scoped.values()], now)).toEqual(chatSummary([...whole.values()], now));
  });

  it("counts the messages per person and keeps chats with no message", () => {
    const a = build(allSenders, allLast);
    expect(a.get("c1")).toMatchObject({ messages: 5, bySender: { a: 3, b: 2 }, lastSenderId: "b", reported: false });
    expect(a.get("c2")).toMatchObject({ messages: 1, reported: true });
    expect(a.get("c3")).toMatchObject({ messages: 0, bySender: {}, lastAt: null, lastSenderId: null });
    expect(a.has("c9")).toBe(false);
  });
});

describe("GET /api/admin/chats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    country.value = "JO";
    auth.requireAdmin.mockResolvedValue({ session: { user: { id: "admin1" } } });
    db.conversation.findMany.mockImplementation(async (args: { select: { match?: unknown } }) => (args.select.match ? [] : [chat("c1"), chat("c2")]));
    db.message.groupBy.mockResolvedValue(allSenders.slice(0, 3));
    db.$queryRaw.mockResolvedValue(allLast.slice(0, 2));
    db.report.findMany.mockResolvedValue([]);
  });
  const call = () => GET(new Request("http://x/api/admin/chats")) as Promise<Response>;

  it("asks only for the messages of the selected country's chats", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(db.message.groupBy.mock.calls[0][0].where).toEqual({ conversationId: { in: ["c1", "c2"] } });
    const [sql, ids] = db.$queryRaw.mock.calls[0];
    expect(sql.join("?")).toContain('WHERE "conversationId" = ANY(?::text[])');
    expect(ids).toEqual(["c1", "c2"]);
  });

  it("doesn't list ids for every country", async () => {
    country.value = "ALL";
    await call();
    expect(db.message.groupBy.mock.calls[0][0].where).toBeUndefined();
  });

  it("skips the message queries when the country has no chat", async () => {
    db.conversation.findMany.mockResolvedValue([]);
    const d = await (await call()).json();
    expect(db.message.groupBy).not.toHaveBeenCalled();
    expect(db.$queryRaw).not.toHaveBeenCalled();
    expect(d.total).toBe(0);
  });
});
