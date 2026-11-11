/**
 * Admin → Reports: a report made with «إبلاغ عن الرسالة» (Report.messageId) shows the reported message, and the
 * admin chat view knows which messages were reported (it highlights them).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  report: { findMany: vi.fn(), count: vi.fn() },
  user: { findMany: vi.fn() },
  conversation: { findMany: vi.fn(), findUnique: vi.fn() },
  message: { findMany: vi.fn() },
}));
const auth = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/auth", () => auth);
vi.mock("@/lib/admin/country-filter", () => ({ getAdminCountry: vi.fn(async () => "ALL"), reportCountryWhere: () => ({}) }));
vi.mock("@/lib/admin/moderation", () => ({ adminEndConversation: vi.fn(), setSuspended: vi.fn() }));
vi.mock("@/lib/notify", () => ({ notify: vi.fn() }));
vi.mock("@/lib/admin-alert", () => ({ sendAdminAlert: vi.fn() }));

import { GET as reportsGet } from "@/app/api/admin/reports/route";
import { GET as chatGet } from "@/app/api/admin/chats/[id]/messages/route";

const report = (over: object = {}) => ({
  id: "r1", reason: "HARASSMENT", details: null, status: "PENDING", adminNote: null, reviewedAt: null, reviewedById: null,
  createdAt: new Date(), reporterId: "a", reportedId: "b", conversationId: "c1", messageId: null, evidence: null,
  reporter: { id: "a", firstName: "سارة", lastName: "أ" }, reported: { id: "b", firstName: "خالد", lastName: "ب", status: "ACTIVE" },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  auth.requireAdmin.mockResolvedValue({ session: { user: { id: "admin1", role: "ADMIN" } } });
  db.report.count.mockResolvedValue(1);
  db.user.findMany.mockResolvedValue([]);
  db.conversation.findMany.mockResolvedValue([]);
  db.message.findMany.mockResolvedValue([]);
});

describe("GET /api/admin/reports: the reported message", () => {
  it("a report with messageId carries the message (same chat only): who wrote it, when, a one-line snippet", async () => {
    const at = new Date("2026-11-10T09:00:00Z");
    db.report.findMany.mockResolvedValue([report({ messageId: "m9" }), report({ id: "r2", messageId: "m8" }), report({ id: "r3" })]);
    db.message.findMany.mockResolvedValue([
      { id: "m9", conversationId: "c1", senderId: "b", kind: "TEXT", body: "كلام\nمسيء", createdAt: at },
      // A message of another chat is never shown on this report
      { id: "m8", conversationId: "other", senderId: "b", kind: "TEXT", body: "سر", createdAt: at },
    ]);
    const d = await (await reportsGet(new Request("http://x/api/admin/reports"))).json();
    expect(db.message.findMany.mock.calls[0][0].where).toEqual({ id: { in: ["m9", "m8"] } });
    expect(d.reports[0].reportedMessage).toEqual({ id: "m9", at: at.toISOString(), kind: "TEXT", snippet: "كلام مسيء", fromReported: true });
    expect(d.reports[1].reportedMessage).toBeNull();
    expect(d.reports[2].reportedMessage).toBeNull();
    expect(JSON.stringify(d)).not.toContain("سر");
  });

  it("a reported message deleted for everyone carries `deleted`, and a cleared chat its `clearedAt`", async () => {
    const at = new Date("2026-11-10T09:00:00Z");
    db.report.findMany.mockResolvedValue([report({ messageId: "m9" })]);
    db.message.findMany.mockResolvedValue([
      { id: "m9", conversationId: "c1", senderId: "b", kind: "TEXT", body: "مسيء", createdAt: at, deletedAt: new Date() },
    ]);
    db.conversation.findMany.mockResolvedValue([{
      id: "c1", status: "ACTIVE", createdAt: at, expiresAt: new Date(Date.now() + 86400000), endedAt: null, endedById: null,
      endedByAdminId: null, clearedAt: new Date("2026-11-10T10:00:00Z"), match: { femaleId: "a", maleId: "b" }, _count: { messages: 3 },
    }]);
    const d = await (await reportsGet(new Request("http://x/api/admin/reports"))).json();
    expect(db.message.findMany.mock.calls[0][0].select).toMatchObject({ deletedAt: true });
    expect(d.reports[0].reportedMessage).toMatchObject({ id: "m9", snippet: "مسيء", deleted: true });
    expect(d.reports[0].chat.clearedAt).toBe("2026-11-10T10:00:00.000Z");
  });

  it("no report with a message: no message query", async () => {
    db.report.findMany.mockResolvedValue([report()]);
    await reportsGet(new Request("http://x/api/admin/reports"));
    expect(db.message.findMany).not.toHaveBeenCalled();
  });
});

describe("GET /api/admin/chats/[id]/messages: reported messages", () => {
  it("the chat's reports carry their messageId (the page highlights those messages)", async () => {
    db.conversation.findUnique.mockResolvedValue({
      id: "c1", status: "ACTIVE", createdAt: new Date(), expiresAt: new Date(Date.now() + 864e5), extended: false,
      endedById: null, endedByAdminId: null, endedAt: null,
      match: { id: "mm", female: { id: "a", firstName: "سارة", lastName: "أ", status: "ACTIVE" }, male: { id: "b", firstName: "خالد", lastName: "ب", status: "ACTIVE" } },
      messages: [],
    });
    db.report.findMany.mockResolvedValue([{ id: "r1", status: "PENDING", createdAt: new Date(), messageId: "m9" }]);
    vi.spyOn(console, "info").mockImplementation(() => {});
    const d = await (await chatGet(new Request("http://x"), { params: Promise.resolve({ id: "c1" }) })).json();
    expect(db.report.findMany.mock.calls[0][0].select).toMatchObject({ messageId: true });
    expect(d.chat.reports[0].messageId).toBe("m9");
  });
});
