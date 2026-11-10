import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  message: { count: vi.fn() },
  notification: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));

import { clearChatBell, upsertChatBell } from "@/lib/chat/bell";

beforeEach(() => vi.clearAllMocks());

describe("chat messages in the bell", () => {
  it("creates one entry per chat, without the message text", async () => {
    db.message.count.mockResolvedValue(1);
    db.notification.findFirst.mockResolvedValue(null);
    await upsertChatBell("u2", "c1", "سارة");
    expect(db.notification.create).toHaveBeenCalledWith({
      data: { userId: "u2", type: "CHAT", title: "رسائل جديدة", body: "لديك رسالة جديدة من سارة", metadata: { conversationId: "c1", url: "/dashboard/chats/c1", chatBell: true } },
    });
  });

  it("updates the same entry as more messages arrive", async () => {
    db.message.count.mockResolvedValue(3);
    db.notification.findFirst.mockResolvedValue({ id: "n1" });
    await upsertChatBell("u2", "c1", "سارة");
    expect(db.notification.create).not.toHaveBeenCalled();
    expect(db.notification.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "n1" }, data: expect.objectContaining({ body: "لديك 3 رسائل جديدة من سارة" }) }));
  });

  it("reuses the chat's newest entry even once read, unread again at the top (QA A2-L7: one row per chat)", async () => {
    db.message.count.mockResolvedValue(1);
    db.notification.findFirst.mockResolvedValue({ id: "n1" });
    await upsertChatBell("u2", "c1", "سارة");
    expect(db.notification.findFirst).toHaveBeenCalledWith({
      where: { userId: "u2", type: "CHAT", AND: [{ metadata: { path: ["conversationId"], equals: "c1" } }, { metadata: { path: ["chatBell"], equals: true } }] },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    expect(db.notification.create).not.toHaveBeenCalled();
    const data = db.notification.update.mock.calls[0][0].data;
    expect(data.isRead).toBe(false);
    expect(data.createdAt).toBeInstanceOf(Date);
    // A second unread entry of the same chat (two messages at once) is folded into this one
    expect(db.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: "u2", type: "CHAT", AND: [{ metadata: { path: ["conversationId"], equals: "c1" } }, { metadata: { path: ["chatBell"], equals: true } }], isRead: false, id: { not: "n1" } },
      data: { isRead: true },
    });
  });

  it("never throws (a sent message must not fail on the bell)", async () => {
    db.message.count.mockRejectedValue(new Error("db down"));
    await expect(upsertChatBell("u2", "c1", "سارة")).resolves.toBeUndefined();
  });

  it("reading the chat marks its entry read", async () => {
    await clearChatBell("u2", "c1");
    expect(db.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: "u2", type: "CHAT", AND: [{ metadata: { path: ["conversationId"], equals: "c1" } }, { metadata: { path: ["chatBell"], equals: true } }], isRead: false },
      data: { isRead: true },
    });
  });

  describe("the chat's own notices (final review I1)", () => {
    type Row = { id: string; userId: string; type: string; isRead: boolean; title: string; body: string; metadata: Record<string, unknown>; createdAt: Date };
    type Where = Record<string, unknown>;
    let rows: Row[];

    // A small in-memory notification table that reads the same where shapes the bell writes
    const matches = (row: Row, where: Where): boolean =>
      Object.entries(where).every(([key, value]) => {
        if (key === "AND") return (value as Where[]).every((w) => matches(row, w));
        if (key === "metadata") {
          const { path, equals } = value as { path: string[]; equals: unknown };
          return row.metadata[path[0]] === equals;
        }
        if (key === "id" && value && typeof value === "object") return row.id !== (value as { not: string }).not;
        return (row as unknown as Record<string, unknown>)[key] === value;
      });

    beforeEach(() => {
      const t = (min: number) => new Date(Date.UTC(2026, 10, 10, 10, min));
      rows = [
        { id: "bell", userId: "u2", type: "CHAT", isRead: true, title: "رسائل جديدة", body: "لديك رسالة جديدة من سارة", metadata: { conversationId: "c1", url: "/dashboard/chats/c1", chatBell: true }, createdAt: t(0) },
        { id: "nudge", userId: "u2", type: "CHAT", isRead: false, title: "أسبوع على محادثتكما", body: "…", metadata: { conversationId: "c1", url: "/dashboard/chats/c1" }, createdAt: t(5) },
        { id: "expiry", userId: "u2", type: "CHAT", isRead: true, title: "تنتهي المحادثة قريباً", body: "…", metadata: { conversationId: "c1", url: "/dashboard/chats/c1" }, createdAt: t(6) },
      ];
      db.message.count.mockResolvedValue(2);
      db.notification.findFirst.mockImplementation(async ({ where }: { where: Where }) => {
        const found = rows.filter((r) => matches(r, where)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return found[0] ? { id: found[0].id } : null;
      });
      db.notification.update.mockImplementation(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        Object.assign(rows.find((r) => r.id === where.id)!, data);
      });
      db.notification.updateMany.mockImplementation(async ({ where, data }: { where: Where; data: Partial<Row> }) => {
        rows.filter((r) => matches(r, where)).forEach((r) => Object.assign(r, data));
      });
      db.notification.create.mockImplementation(async ({ data }: { data: Omit<Row, "id" | "isRead" | "createdAt"> }) => {
        rows.push({ ...data, id: `n${rows.length}`, isRead: false, createdAt: new Date() });
      });
    });

    it("new messages leave the nudge and the expiry notice untouched, unread or read", async () => {
      const before = rows.filter((r) => r.id !== "bell").map((r) => ({ ...r }));
      await upsertChatBell("u2", "c1", "سارة");
      await upsertChatBell("u2", "c1", "سارة");
      expect(rows.filter((r) => r.id !== "bell")).toEqual(before);
      const bell = rows.find((r) => r.id === "bell")!;
      expect(bell).toMatchObject({ isRead: false, body: "لديك رسالتان جديدتان من سارة" });
      expect(rows).toHaveLength(3);
    });

    it("with only notices in the chat, a message adds its own bell row beside them", async () => {
      rows = rows.filter((r) => r.id !== "bell");
      await upsertChatBell("u2", "c1", "سارة");
      expect(rows).toHaveLength(3);
      expect(rows.find((r) => r.id === "nudge")).toMatchObject({ isRead: false, title: "أسبوع على محادثتكما" });
      expect(rows.find((r) => r.metadata.chatBell === true)).toMatchObject({ isRead: false, title: "رسائل جديدة" });
    });

    it("reading the chat marks only its bell row read; the nudge stays unread", async () => {
      await upsertChatBell("u2", "c1", "سارة");
      await clearChatBell("u2", "c1");
      expect(rows.find((r) => r.id === "bell")!.isRead).toBe(true);
      expect(rows.find((r) => r.id === "nudge")!.isRead).toBe(false);
    });
  });
});
