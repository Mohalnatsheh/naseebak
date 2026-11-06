import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  conversation: { findMany: vi.fn(), updateMany: vi.fn() },
  introRequest: { findFirst: vi.fn() },
  block: { findFirst: vi.fn() },
  visitRequest: { findUnique: vi.fn() },
}));
const ably = vi.hoisted(() => ({ publishChatEvent: vi.fn() }));
const notifyMod = vi.hoisted(() => ({ notify: vi.fn(), notifyMany: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/ably", () => ably);
vi.mock("@/lib/notify", () => notifyMod);
vi.mock("@/lib/settings", () => ({ getCycleFlags: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn() }));

import { chatHousekeepingAll, nudgeQuietChats } from "@/lib/chat/service";

const DAY = 24 * 60 * 60 * 1000;
const conv = (id: string, expiresIn: number, over: object = {}) => ({
  id,
  matchId: "m1",
  status: "ACTIVE",
  expiresAt: new Date(Date.now() + expiresIn),
  createdAt: new Date(Date.now() - 12 * DAY),
  extended: false,
  expiryWarnedAt: null,
  familyNudgeAt: new Date(Date.now() - 5 * DAY),
  endedById: null,
  match: { id: "m1", femaleId: "f1", maleId: "u1", female: { id: "f1" }, male: { id: "u1" } },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.conversation.updateMany.mockResolvedValue({ count: 1 });
  db.introRequest.findFirst.mockResolvedValue(null);
  db.block.findFirst.mockResolvedValue(null);
  db.visitRequest.findUnique.mockResolvedValue(null);
});

describe("chatHousekeepingAll", () => {
  it("loads only due active chats and expires / warns them like the lazy path", async () => {
    db.conversation.findMany.mockResolvedValue([conv("old", -DAY), conv("soon", DAY)]);
    const res = await chatHousekeepingAll();
    const { where } = db.conversation.findMany.mock.calls[0][0];
    expect(where.status).toBe("ACTIVE");
    expect(res).toEqual({ expired: 1, warned: 1, nudged: 0 });
    expect(ably.publishChatEvent).toHaveBeenCalledWith("old", "status", { status: "EXPIRED" });
    // The expired chat asks about a family introduction, the other one gets the 2-days warning
    expect(notifyMod.notifyMany).toHaveBeenCalledTimes(2);
    expect(notifyMod.notifyMany.mock.calls[0][0]).toEqual(["f1", "u1"]);
    expect(notifyMod.notifyMany.mock.calls[0][1].title).toBe("انتهت مدة المحادثة");
    // G21: status notices don't follow the per-message preference
    expect(notifyMod.notifyMany.mock.calls[0][1].preference).toBe("introRequests");
    expect(notifyMod.notifyMany.mock.calls[1][1].preference).toBe("introRequests");
  });

  it("the expiry push says until when the free move to family lasts (G35)", async () => {
    const expired = conv("old", -DAY);
    db.conversation.findMany.mockResolvedValue([expired]);
    await chatHousekeepingAll();
    const until = new Date(expired.expiresAt.getTime() + 14 * DAY).toLocaleDateString("ar-JO-u-nu-latn", {
      day: "numeric",
      month: "long",
      timeZone: "Asia/Amman",
    });
    expect(notifyMod.notifyMany.mock.calls[0][1].body).toContain(`مجاني حتى ${until}`);
    expect(until).toMatch(/[0-9]/); // Western digits
  });

  it("does not warn twice (conditional update lost to the lazy path)", async () => {
    db.conversation.findMany.mockResolvedValue([conv("soon", DAY)]);
    db.conversation.updateMany.mockResolvedValue({ count: 0 });
    const res = await chatHousekeepingAll();
    expect(notifyMod.notifyMany).not.toHaveBeenCalled();
    expect(res).toEqual({ expired: 0, warned: 0, nudged: 0 });
  });

  it("looks for chats due a day-7 family nudge too", async () => {
    db.conversation.findMany.mockResolvedValue([]);
    await chatHousekeepingAll();
    const { where } = db.conversation.findMany.mock.calls[0][0];
    expect(where.OR).toContainEqual({ familyNudgeAt: null, createdAt: { lte: expect.any(Date), gt: expect.any(Date) } });
  });

  it("nudges both once after 7 days while the family path is open", async () => {
    db.conversation.findMany.mockResolvedValue([conv("week", 7 * DAY, { createdAt: new Date(Date.now() - 7 * DAY - 1000), familyNudgeAt: null })]);
    const res = await chatHousekeepingAll();
    expect(res).toEqual({ expired: 0, warned: 0, nudged: 1 });
    expect(notifyMod.notifyMany).toHaveBeenCalledTimes(1);
    expect(notifyMod.notifyMany.mock.calls[0][1].title).toBe("أسبوع على محادثتكما");
  });

  it("no nudge for a chat that was already older than the window on release day", async () => {
    db.conversation.findMany.mockResolvedValue([conv("old-chat", 3 * DAY, { createdAt: new Date(Date.now() - 11 * DAY), familyNudgeAt: null })]);
    const res = await chatHousekeepingAll();
    expect(res.nudged).toBe(0);
  });

  it("no nudge or expiry ask with a block, an inactive partner or a declined family request", async () => {
    const week = () => conv("week", 7 * DAY, { createdAt: new Date(Date.now() - 8 * DAY), familyNudgeAt: null });
    db.block.findFirst.mockResolvedValueOnce({ id: "blk" });
    db.conversation.findMany.mockResolvedValueOnce([week()]);
    expect((await chatHousekeepingAll()).nudged).toBe(0);
    db.conversation.findMany.mockResolvedValueOnce([
      conv("week", 7 * DAY, { createdAt: new Date(Date.now() - 8 * DAY), familyNudgeAt: null, match: { id: "m1", femaleId: "f1", maleId: "u1", female: { id: "f1", isDeactivated: true }, male: { id: "u1" } } }),
    ]);
    expect((await chatHousekeepingAll()).nudged).toBe(0);
    expect(notifyMod.notifyMany).not.toHaveBeenCalled();
  });

  it("no nudge or expiry ask when a family introduction is already pending or accepted", async () => {
    db.introRequest.findFirst.mockResolvedValue({ id: "fam" });
    db.conversation.findMany.mockResolvedValue([
      conv("week", 7 * DAY, { createdAt: new Date(Date.now() - 8 * DAY), familyNudgeAt: null }),
      conv("old", -DAY),
    ]);
    const res = await chatHousekeepingAll();
    expect(res).toMatchObject({ expired: 1, nudged: 0 });
    expect(notifyMod.notifyMany).not.toHaveBeenCalled();
  });
});

describe("nudgeQuietChats", () => {
  const now = new Date("2026-11-20T15:00:00Z");
  const quiet = (messages: object[], over: object = {}) =>
    conv("c1", 10 * DAY, { createdAt: new Date(now.getTime() - 3 * DAY), quietNudgeAt: null, messages, ...over });
  const msg = (senderId: string, readAt: Date | null = null) => ({ senderId, readAt, createdAt: new Date(now.getTime() - 2 * DAY) });

  it("looks only at open chats between 48 hours and 7 days old, not nudged yet", async () => {
    db.conversation.findMany.mockResolvedValue([]);
    await nudgeQuietChats(now);
    const { where } = db.conversation.findMany.mock.calls[0][0];
    expect(where).toMatchObject({ status: "ACTIVE", quietNudgeAt: null });
    expect(where.createdAt.lte).toEqual(new Date(now.getTime() - 2 * DAY));
    expect(where.createdAt.gt).toEqual(new Date(now.getTime() - 7 * DAY));
  });

  it("nobody wrote: both are told, once", async () => {
    db.conversation.findMany.mockResolvedValue([quiet([])]);
    expect(await nudgeQuietChats(now)).toEqual({ nudged: 1 });
    expect(notifyMod.notify.mock.calls.map((c) => c[0].userId)).toEqual(["f1", "u1"]);
    expect(notifyMod.notify.mock.calls[0][0]).toMatchObject({ title: "محادثتك لم تبدأ بعد", url: "/dashboard/chats/c1" });
    expect(notifyMod.notify.mock.calls[0][0].sms).toBeUndefined();
  });

  it("one wrote: only the silent person is told", async () => {
    db.conversation.findMany.mockResolvedValue([quiet([msg("f1")])]);
    await nudgeQuietChats(now);
    expect(notifyMod.notify.mock.calls.map((c) => c[0].userId)).toEqual(["u1"]);
    expect(notifyMod.notify.mock.calls[0][0].title).toBe("رسالة بانتظار ردك");
  });

  it("leaves chats where both write, or the other already read it", async () => {
    db.conversation.findMany.mockResolvedValue([quiet([msg("f1"), msg("u1")]), quiet([msg("f1", now)])]);
    expect(await nudgeQuietChats(now)).toEqual({ nudged: 0 });
    expect(db.conversation.updateMany).not.toHaveBeenCalled();
  });

  it("a second run at the same time sends nothing", async () => {
    db.conversation.findMany.mockResolvedValue([quiet([])]);
    db.conversation.updateMany.mockResolvedValue({ count: 0 });
    expect(await nudgeQuietChats(now)).toEqual({ nudged: 0 });
    expect(notifyMod.notify).not.toHaveBeenCalled();
  });

  it("stays quiet when one has blocked the other", async () => {
    db.conversation.findMany.mockResolvedValue([quiet([])]);
    db.block.findFirst.mockResolvedValue({ id: "b" });
    expect(await nudgeQuietChats(now)).toEqual({ nudged: 0 });
    expect(notifyMod.notify).not.toHaveBeenCalled();
  });
});
