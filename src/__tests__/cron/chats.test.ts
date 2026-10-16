import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  conversation: { findMany: vi.fn(), updateMany: vi.fn() },
}));
const ably = vi.hoisted(() => ({ publishChatEvent: vi.fn() }));
const notifyMod = vi.hoisted(() => ({ notify: vi.fn(), notifyMany: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/ably", () => ably);
vi.mock("@/lib/notify", () => notifyMod);
vi.mock("@/lib/settings", () => ({ getCycleFlags: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn() }));

import { chatHousekeepingAll } from "@/lib/chat/service";

const DAY = 24 * 60 * 60 * 1000;
const conv = (id: string, expiresIn: number, over: object = {}) => ({
  id,
  matchId: "m1",
  status: "ACTIVE",
  expiresAt: new Date(Date.now() + expiresIn),
  extended: false,
  expiryWarnedAt: null,
  endedById: null,
  match: { id: "m1", femaleId: "f1", maleId: "u1", female: { id: "f1" }, male: { id: "u1" } },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.conversation.updateMany.mockResolvedValue({ count: 1 });
});

describe("chatHousekeepingAll", () => {
  it("loads only due active chats and expires / warns them like the lazy path", async () => {
    db.conversation.findMany.mockResolvedValue([conv("old", -DAY), conv("soon", DAY)]);
    const res = await chatHousekeepingAll();
    const { where } = db.conversation.findMany.mock.calls[0][0];
    expect(where.status).toBe("ACTIVE");
    expect(res).toEqual({ expired: 1, warned: 1 });
    expect(ably.publishChatEvent).toHaveBeenCalledWith("old", "status", { status: "EXPIRED" });
    expect(notifyMod.notifyMany).toHaveBeenCalledTimes(1);
    expect(notifyMod.notifyMany.mock.calls[0][0]).toEqual(["f1", "u1"]);
  });

  it("does not warn twice (conditional update lost to the lazy path)", async () => {
    db.conversation.findMany.mockResolvedValue([conv("soon", DAY)]);
    db.conversation.updateMany.mockResolvedValue({ count: 0 });
    const res = await chatHousekeepingAll();
    expect(notifyMod.notifyMany).not.toHaveBeenCalled();
    expect(res).toEqual({ expired: 0, warned: 0 });
  });
});
