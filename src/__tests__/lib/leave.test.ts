import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  conversation: { findMany: vi.fn(), updateMany: vi.fn() },
  introRequest: { updateMany: vi.fn() },
  mutualMatch: { findMany: vi.fn() },
  block: { findMany: vi.fn() },
}));
const notifyMod = vi.hoisted(() => ({ notify: vi.fn(), notifyMany: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/notify", () => notifyMod);
vi.mock("@/lib/ably", () => ({ publishChatEvent: vi.fn(async () => {}) }));

import { closeActivityForLeaving } from "@/lib/matches/leave";

beforeEach(() => {
  vi.clearAllMocks();
  db.conversation.findMany.mockResolvedValue([{ id: "c1", match: { femaleId: "f1", maleId: "u1" } }]);
  db.conversation.updateMany.mockResolvedValue({ count: 1 });
  db.block.findMany.mockResolvedValue([]);
});

describe("closeActivityForLeaving", () => {
  it("pausing ends open chats, cancels pending requests and tells the chat partner", async () => {
    await closeActivityForLeaving("u1", "paused");
    expect(db.conversation.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "ENDED", endedById: "u1" }) }));
    expect(db.introRequest.updateMany).toHaveBeenCalledWith({
      where: { status: "PENDING", OR: [{ senderId: "u1" }, { receiverId: "u1" }] },
      data: { status: "CANCELLED" },
    });
    expect(notifyMod.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: "f1", title: "انتهت المحادثة" }));
    expect(notifyMod.notifyMany).not.toHaveBeenCalled();
  });

  it("deletion tells every partner on an open match once, skipping ended matches and blocks", async () => {
    db.mutualMatch.findMany.mockResolvedValue([
      { femaleId: "f1", maleId: "u1", femaleOutcome: null, maleOutcome: null },
      { femaleId: "f2", maleId: "u1", femaleOutcome: "NOT_A_MATCH", maleOutcome: null },
      { femaleId: "f3", maleId: "u1", femaleOutcome: null, maleOutcome: null },
    ]);
    db.block.findMany.mockResolvedValue([{ blockerId: "f3", blockedId: "u1" }]);
    await closeActivityForLeaving("u1", "deleted");
    expect(notifyMod.notify).not.toHaveBeenCalled();
    expect(notifyMod.notifyMany).toHaveBeenCalledWith(["f1"], expect.objectContaining({ title: "انتهى أحد التوافقات" }));
  });
});
