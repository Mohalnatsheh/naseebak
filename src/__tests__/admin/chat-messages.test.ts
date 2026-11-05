import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const db = vi.hoisted(() => ({ conversation: { findUnique: vi.fn() }, report: { findMany: vi.fn() } }));
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
});
