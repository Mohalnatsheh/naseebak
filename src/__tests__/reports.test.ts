import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

const db = vi.hoisted(() => ({
  report: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  user: { updateMany: vi.fn(), findMany: vi.fn() },
  conversation: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(async (): Promise<unknown[]> => []), updateMany: vi.fn() },
  message: { findMany: vi.fn(), findUnique: vi.fn(async (): Promise<unknown> => null) },
  block: { findFirst: vi.fn(async (): Promise<unknown> => null) },
  mutualMatch: { findMany: vi.fn(async (): Promise<unknown[]> => []) },
}));
vi.mock("@/lib/db", () => ({ db }));
const alert = vi.hoisted(() => ({ sendAdminAlert: vi.fn(async () => {}) }));
const notifyMod = vi.hoisted(() => ({ notify: vi.fn(async () => {}) }));
vi.mock("@/lib/admin-alert", () => alert);
vi.mock("@/lib/notify", () => notifyMod);
vi.mock("@/lib/ably", () => ({ publishChatEvent: vi.fn(async () => {}) }));

import {
  endPausedChats, fileReport, refreshReportFlag, snapshotReportEvidence,
  PAUSED_MATCH_CLOSED_MARKER, REPORT_PAUSE_MARKER,
} from "@/lib/reports";

beforeEach(() => {
  vi.clearAllMocks();
  db.report.create.mockResolvedValue({ id: "r1" });
  db.report.update.mockResolvedValue({ id: "r1" });
  db.report.count.mockResolvedValue(1);
  db.report.updateMany.mockResolvedValue({ count: 1 });
  db.user.findMany.mockResolvedValue([]);
  db.user.updateMany.mockResolvedValue({ count: 1 });
  db.conversation.findMany.mockResolvedValue([]);
  db.conversation.updateMany.mockResolvedValue({ count: 1 });
  db.block.findFirst.mockResolvedValue(null);
  db.mutualMatch.findMany.mockResolvedValue([]);
});

describe("fileReport", () => {
  it("creates a new report with the chat it came from", async () => {
    db.report.findUnique.mockResolvedValue(null);
    const r = await fileReport({ reporterId: "a", reportedId: "b", reason: "HARASSMENT", details: " تهديد ", conversationId: "c1" });
    expect(r).toEqual({ id: "r1", reopened: false });
    expect(db.report.create).toHaveBeenCalledWith({
      data: { reporterId: "a", reportedId: "b", reason: "HARASSMENT", details: "تهديد", conversationId: "c1" },
      select: { id: true },
    });
  });

  it("a repeat report reopens the earlier one and keeps both accounts", async () => {
    db.report.findUnique.mockResolvedValue({ id: "r1", details: "أول مرة" });
    const r = await fileReport({ reporterId: "a", reportedId: "b", reason: "SPAM", details: "مرة ثانية" });
    expect(r.reopened).toBe(true);
    const { data } = db.report.update.mock.calls[0][0];
    expect(data).toMatchObject({ reason: "SPAM", status: "PENDING", reviewedAt: null });
    expect(data.details).toMatch(/^أول مرة\n---\n\[\d{4}-\d{2}-\d{2}\] مرة ثانية$/);
  });

  it("«إبلاغ عن الرسالة»: the reported message is kept on a new report and on a reopened one", async () => {
    db.report.findUnique.mockResolvedValue(null);
    await fileReport({ reporterId: "a", reportedId: "b", reason: "HARASSMENT", conversationId: "c1", messageId: "m9" });
    expect(db.report.create.mock.calls[0][0].data).toMatchObject({ conversationId: "c1", messageId: "m9" });
    db.report.findUnique.mockResolvedValue({ id: "r1", details: null });
    await fileReport({ reporterId: "a", reportedId: "b", reason: "SPAM", conversationId: "c1", messageId: "m10" });
    expect(db.report.update.mock.calls[0][0].data).toMatchObject({ messageId: "m10" });
    // A later report without a message keeps the one reported before (like the chat)
    db.report.update.mockClear();
    await fileReport({ reporterId: "a", reportedId: "b", reason: "SPAM" });
    expect(db.report.update.mock.calls[0][0].data).not.toHaveProperty("messageId");
  });

  it("the admin email quotes the reported message (one line)", async () => {
    db.report.findUnique.mockResolvedValue(null);
    db.message.findUnique.mockResolvedValue({ kind: "TEXT", body: "كلام\nمسيء" });
    await fileReport({ reporterId: "a", reportedId: "b", reason: "HARASSMENT", conversationId: "c1", messageId: "m9" });
    await vi.waitFor(() => expect(alert.sendAdminAlert).toHaveBeenCalled());
    const [, text] = alert.sendAdminAlert.mock.calls[0] as unknown as [string, string];
    expect(text).toContain("الرسالة المُبلَّغ عنها: «كلام مسيء»");
  });

  it("never flags the member or pauses their chats, however many reports (owner, 2026-11-07)", async () => {
    db.report.findUnique.mockResolvedValue(null);
    db.report.count.mockResolvedValue(5);
    db.conversation.findMany.mockResolvedValue([{ id: "c1", match: { femaleId: "b", maleId: "x" } }]);
    await fileReport({ reporterId: "a", reportedId: "b", reason: "HARASSMENT" });
    expect(db.user.updateMany).not.toHaveBeenCalled();
    expect(db.conversation.updateMany).not.toHaveBeenCalled();
    expect(notifyMod.notify).not.toHaveBeenCalled();
  });
});

const openMatch = {
  id: "m1", femaleId: "b", maleId: "x", femaleOutcome: null, maleOutcome: null,
  female: { isDeactivated: false, status: "ACTIVE" }, male: { isDeactivated: false, status: "ACTIVE" },
};

describe("endPausedChats (G55)", () => {
  it("turns paused rows on the given matches into a real end", async () => {
    db.conversation.updateMany.mockResolvedValue({ count: 2 });
    expect(await endPausedChats({ id: "m1" }, { endedById: "u1" })).toBe(2);
    expect(db.conversation.updateMany).toHaveBeenCalledWith({
      where: { status: "ENDED", endedByAdminId: REPORT_PAUSE_MARKER, match: { id: "m1" } },
      data: { endedById: "u1", endedByAdminId: null },
    });
  });
});

describe("snapshotReportEvidence", () => {
  it("saves both people and the chat (oldest first) on each report without a snapshot", async () => {
    db.report.findMany.mockResolvedValue([{ id: "r1", reporterId: "a", reportedId: "b", conversationId: "c1" }]);
    db.user.findMany.mockResolvedValue([
      { id: "a", firstName: "سارة", lastName: "أحمد", phone: "962790000001" },
      { id: "b", firstName: "خالد", lastName: "علي", phone: "962790000002" },
    ]);
    db.conversation.findUnique.mockResolvedValue({ id: "c1" });
    db.message.findMany.mockResolvedValue([
      { senderId: "b", body: "رد", createdAt: new Date("2026-10-02T10:00:00Z") },
      { senderId: "a", body: "مرحبا", createdAt: new Date("2026-10-01T10:00:00Z") },
    ]);
    expect(await snapshotReportEvidence("b")).toBe(1);
    expect(db.report.findMany.mock.calls[0][0].where).toMatchObject({ evidence: { equals: Prisma.DbNull } });
    const { where, data } = db.report.updateMany.mock.calls[0][0];
    expect(where).toEqual({ id: "r1", evidence: { equals: Prisma.DbNull } });
    expect(data.evidence.people).toEqual({
      reporter: { id: "a", name: "سارة أحمد", phone: "962790000001" },
      reported: { id: "b", name: "خالد علي", phone: "962790000002" },
    });
    expect(data.evidence.chat).toEqual({
      id: "c1",
      truncated: false,
      messages: [
        { at: "2026-10-01T10:00:00.000Z", from: "reporter", body: "مرحبا" },
        { at: "2026-10-02T10:00:00.000Z", from: "reported", body: "رد" },
      ],
    });
  });

  it("a reply in the evidence keeps its quote (same chat only)", async () => {
    db.report.findMany.mockResolvedValue([{ id: "r1", reporterId: "a", reportedId: "b", conversationId: "c1" }]);
    db.user.findMany.mockResolvedValue([]);
    db.conversation.findUnique.mockResolvedValue({ id: "c1" });
    db.message.findMany.mockResolvedValue([
      { senderId: "b", body: "رد", createdAt: new Date("2026-10-02T10:00:00Z"), replyTo: { conversationId: "c1", senderId: "a", kind: "TEXT", body: "سؤال" } },
      { senderId: "b", body: "آخر", createdAt: new Date("2026-10-03T10:00:00Z"), replyTo: { conversationId: "zz", senderId: "a", kind: "TEXT", body: "سر" } },
    ]);
    await snapshotReportEvidence("b");
    const msgs = db.report.updateMany.mock.calls[0][0].data.evidence.chat.messages;
    expect(msgs.find((m: { body: string }) => m.body === "رد").replyTo).toEqual({ from: "reporter", snippet: "سؤال" });
    expect(JSON.stringify(msgs)).not.toContain("سر");
  });

  it("marks the reported message (Report.messageId) in the saved chat", async () => {
    db.report.findMany.mockResolvedValue([{ id: "r1", reporterId: "a", reportedId: "b", conversationId: "c1", messageId: "m2" }]);
    db.user.findMany.mockResolvedValue([]);
    db.conversation.findUnique.mockResolvedValue({ id: "c1" });
    db.message.findMany.mockResolvedValue([
      { id: "m2", senderId: "b", body: "مسيء", createdAt: new Date("2026-10-02T10:00:00Z") },
      { id: "m1", senderId: "a", body: "مرحبا", createdAt: new Date("2026-10-01T10:00:00Z") },
    ]);
    await snapshotReportEvidence("b");
    expect(db.report.findMany.mock.calls[0][0].select).toMatchObject({ messageId: true });
    const msgs = db.report.updateMany.mock.calls[0][0].data.evidence.chat.messages;
    expect(msgs).toEqual([
      { at: "2026-10-01T10:00:00.000Z", from: "reporter", body: "مرحبا" },
      { at: "2026-10-02T10:00:00.000Z", from: "reported", body: "مسيء", reported: true },
    ]);
  });

  it("finds the pair's chat when the report didn't come from one, and works with no chat", async () => {
    db.report.findMany.mockResolvedValue([{ id: "r1", reporterId: "a", reportedId: "b", conversationId: null }]);
    db.user.findMany.mockResolvedValue([]);
    db.conversation.findFirst.mockResolvedValue(null);
    await snapshotReportEvidence("a");
    expect(db.conversation.findFirst).toHaveBeenCalled();
    expect(db.report.updateMany.mock.calls[0][0].data.evidence.chat).toBeNull();
  });
});

describe("admin alerts, and undoing the old automatic flag and pause", () => {
  /** count() answers: PENDING-only → pending, PENDING+REVIEWED → open */
  const counts = (pending: number, open = pending) =>
    db.report.count.mockImplementation(async ({ where }: { where: { status: unknown } }) =>
      where.status === "PENDING" ? pending : open
    );

  it("emails the admins on every report (best effort)", async () => {
    db.report.findUnique.mockResolvedValue(null);
    db.user.findMany.mockResolvedValue([
      { id: "a", firstName: "سارة", lastName: "علي", phone: "962790000001" },
      { id: "b", firstName: "خالد", lastName: "سعيد", phone: "962790000002" },
    ]);
    await fileReport({ reporterId: "a", reportedId: "b", reason: "HARASSMENT", details: "تهديد" });
    await vi.waitFor(() => expect(alert.sendAdminAlert).toHaveBeenCalled());
    const [subject, text] = alert.sendAdminAlert.mock.calls[0] as unknown as [string, string];
    expect(subject).toBe("بلاغ جديد");
    expect(text).toContain("خالد سعيد");
    expect(text).toContain("إزعاج أو تحرش");
    expect(text).toContain("تهديد");
  });

  it("3+ pending reports say so in the subject and leave the decision to the admins", async () => {
    db.report.findUnique.mockResolvedValue(null);
    counts(3);
    await fileReport({ reporterId: "a", reportedId: "b", reason: "HARASSMENT" });
    await vi.waitFor(() => expect(alert.sendAdminAlert).toHaveBeenCalled());
    const [subject, text] = alert.sendAdminAlert.mock.calls[0] as unknown as [string, string];
    expect(subject).toBe("بلاغ جديد — 3 بلاغات بانتظار المراجعة عن نفس العضو");
    expect(text).toContain("لم يُتخذ أي إجراء تلقائي");
  });

  it("a review clears an old automatic flag and resumes old paused chats (paused days given back)", async () => {
    counts(2, 2);
    const pausedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    db.conversation.findMany.mockResolvedValue([{ id: "c1", expiresAt, endedAt: pausedAt, match: openMatch }]);
    db.conversation.updateMany.mockResolvedValue({ count: 1 });
    const r = await refreshReportFlag("b");
    expect(r).toEqual({ unflagged: true, resumed: 1 });
    expect(db.user.updateMany).toHaveBeenCalledWith({
      where: { id: "b", isFlagged: true, flagReason: { startsWith: "Auto-flagged" } },
      data: { isFlagged: false, flagReason: null },
    });
    const { data } = db.conversation.updateMany.mock.calls[0][0];
    expect(data).toMatchObject({ status: "ACTIVE", endedAt: null, endedByAdminId: null });
    expect(data.expiresAt.getTime()).toBeGreaterThanOrEqual(expiresAt.getTime() + 2 * 24 * 60 * 60 * 1000 - 1000);
  });

  it.each([
    ["a block between the two", () => db.block.findFirst.mockResolvedValue({ id: "bl1" }), {}],
    ["«لم يحصل نصيب» on the match", () => {}, { maleOutcome: "NOT_A_MATCH" }],
    ["«تمت الخطبة» on the match", () => {}, { femaleOutcome: "ENGAGED" }],
    ["a partner who paused their account", () => {}, { male: { isDeactivated: true, status: "ACTIVE" } }],
    ["a suspended partner", () => {}, { male: { isDeactivated: false, status: "SUSPENDED" } }],
    [
      "a side engaged on another match",
      () => db.mutualMatch.findMany.mockResolvedValue([{ id: "m2", femaleId: "z", maleId: "x", femaleOutcome: null, maleOutcome: "ENGAGED" }]),
      {},
    ],
  ])("G55: a paused chat is not resumed after %s — it ends for good", async (_label, arrange, matchPatch) => {
    counts(2, 2);
    arrange();
    db.conversation.findMany.mockResolvedValue([
      { id: "c1", expiresAt: new Date(), endedAt: new Date(), match: { ...openMatch, ...matchPatch } },
    ]);
    const r = await refreshReportFlag("b");
    expect(r.resumed).toBe(0);
    expect(db.conversation.updateMany).toHaveBeenCalledTimes(1);
    expect(db.conversation.updateMany).toHaveBeenCalledWith({
      where: { id: "c1", status: "ENDED", endedByAdminId: REPORT_PAUSE_MARKER },
      data: { endedByAdminId: PAUSED_MATCH_CLOSED_MARKER },
    });
    expect(notifyMod.notify).not.toHaveBeenCalled();
  });

  it("an old automatic flag stays while 3 open reports remain, but paused chats resume", async () => {
    counts(3, 3);
    db.conversation.findMany.mockResolvedValue([{ id: "c1", expiresAt: new Date(), endedAt: new Date(), match: openMatch }]);
    const r = await refreshReportFlag("b");
    expect(r).toEqual({ unflagged: false, resumed: 1 });
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });
});
