import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), update: vi.fn() },
  conversation: { findUnique: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
}));
const notifyMod = vi.hoisted(() => ({ notify: vi.fn() }));
const ably = vi.hoisted(() => ({ publishChatEvent: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/notify", () => notifyMod);
vi.mock("@/lib/ably", () => ably);

import { adminEndConversation, setSuspended, statusAfterUnsuspend } from "@/lib/admin/moderation";

const user = (over: object = {}) => ({ id: "u1", role: "USER", status: "VERIFIED", statusBeforeSuspension: null, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  db.conversation.findMany.mockResolvedValue([]);
  db.conversation.updateMany.mockResolvedValue({ count: 1 });
});

describe("statusAfterUnsuspend", () => {
  it("restores the remembered status", () => {
    expect(statusAfterUnsuspend("PENDING")).toBe("PENDING");
    expect(statusAfterUnsuspend("VERIFIED")).toBe("VERIFIED");
  });
  it("falls back to PENDING (never VERIFIED) when nothing was remembered", () => {
    expect(statusAfterUnsuspend(null)).toBe("PENDING");
    expect(statusAfterUnsuspend("SUSPENDED")).toBe("PENDING");
  });
});

describe("setSuspended", () => {
  it("remembers the status and ends active chats, telling only the partner", async () => {
    db.user.findUnique.mockResolvedValue(user({ status: "PENDING" }));
    db.conversation.findMany.mockResolvedValue([{ id: "c1", match: { femaleId: "f1", maleId: "u1" } }]);
    db.conversation.findUnique.mockResolvedValue({ id: "c1", status: "ACTIVE", match: { femaleId: "f1", maleId: "u1" } });

    const res = await setSuspended("u1", true, "admin1");

    expect(res).toEqual({ status: "SUSPENDED", changed: true });
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { status: "SUSPENDED", statusBeforeSuspension: "PENDING" },
    });
    expect(db.conversation.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "c1", status: "ACTIVE" },
      data: expect.objectContaining({ status: "ENDED", endedByAdminId: "admin1" }),
    }));
    const chatNotices = notifyMod.notify.mock.calls.filter((c) => c[0].type === "CHAT");
    expect(chatNotices.map((c) => c[0].userId)).toEqual(["f1"]);
  });

  it("restores the pre-suspension status on unsuspend", async () => {
    db.user.findUnique.mockResolvedValue(user({ status: "SUSPENDED", statusBeforeSuspension: "PENDING" }));
    const res = await setSuspended("u1", false, "admin1");
    expect(res.status).toBe("PENDING");
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { status: "PENDING", statusBeforeSuspension: null } });
  });

  it("does nothing when already in the requested state", async () => {
    db.user.findUnique.mockResolvedValue(user({ status: "SUSPENDED" }));
    expect((await setSuspended("u1", true, "a")).changed).toBe(false);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("refuses admins", async () => {
    db.user.findUnique.mockResolvedValue(user({ role: "ADMIN" }));
    await expect(setSuspended("u1", true, "a")).rejects.toMatchObject({ code: "ADMIN" });
  });
});

describe("adminEndConversation", () => {
  it("returns false for a chat that is not active", async () => {
    db.conversation.findUnique.mockResolvedValue({ id: "c1", status: "ENDED", match: { femaleId: "f1", maleId: "u1" } });
    db.conversation.updateMany.mockResolvedValue({ count: 0 });
    expect(await adminEndConversation("c1", "a")).toBe(false);
    expect(notifyMod.notify).not.toHaveBeenCalled();
  });
});
