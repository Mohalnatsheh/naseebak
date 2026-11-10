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
      where: { userId: "u2", type: "CHAT", metadata: { path: ["conversationId"], equals: "c1" } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    expect(db.notification.create).not.toHaveBeenCalled();
    const data = db.notification.update.mock.calls[0][0].data;
    expect(data.isRead).toBe(false);
    expect(data.createdAt).toBeInstanceOf(Date);
    // A second unread entry of the same chat (two messages at once) is folded into this one
    expect(db.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: "u2", type: "CHAT", isRead: false, metadata: { path: ["conversationId"], equals: "c1" }, id: { not: "n1" } },
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
      where: { userId: "u2", type: "CHAT", isRead: false, metadata: { path: ["conversationId"], equals: "c1" } },
      data: { isRead: true },
    });
  });
});
