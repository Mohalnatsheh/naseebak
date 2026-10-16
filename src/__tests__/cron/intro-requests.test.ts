import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  introRequest: { updateMany: vi.fn(), findMany: vi.fn() },
  block: { findFirst: vi.fn() },
}));
const notifyMod = vi.hoisted(() => ({ notify: vi.fn(), notifyMany: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/notify", () => notifyMod);

import { expireIntroRequests, remindIntroRequests } from "@/lib/cron/intro-requests";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-10-16T06:00:00Z");
const party = (id: string, gender = "MALE", over: object = {}) => ({ id, gender, isDeactivated: false, status: "ACTIVE", ...over });

beforeEach(() => {
  vi.clearAllMocks();
  db.introRequest.updateMany.mockResolvedValue({ count: 1 });
  db.introRequest.findMany.mockResolvedValue([]);
  db.block.findFirst.mockResolvedValue(null);
});

describe("expireIntroRequests", () => {
  it("expires overdue PENDING requests like the lazy path (status only, no refund)", async () => {
    db.introRequest.updateMany.mockResolvedValueOnce({ count: 4 });
    const res = await expireIntroRequests(now);
    expect(db.introRequest.updateMany.mock.calls[0][0]).toEqual({
      where: { status: "PENDING", expiresAt: { lt: now } },
      data: { status: "EXPIRED" },
    });
    expect(res).toEqual({ expired: 4, notified: 0 });
  });

  it("tells the sender once, linking to the match", async () => {
    db.introRequest.findMany.mockResolvedValue([
      { id: "r1", matchId: "m1", type: "FAMILY", senderId: "u1", sender: party("u1") },
    ]);
    const res = await expireIntroRequests(now);
    // Claimed with a conditional marker first
    expect(db.introRequest.updateMany).toHaveBeenCalledWith({
      where: { id: "r1", expiryNotifiedAt: null },
      data: { expiryNotifiedAt: now },
    });
    expect(notifyMod.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        type: "INTRO_REQUEST",
        title: "انتهت مدة طلبك دون رد",
        url: "/dashboard/matches?match=m1",
      })
    );
    expect(res.notified).toBe(1);
    // Only recently expired, un-notified rows are considered
    const where = db.introRequest.findMany.mock.calls[0][0].where;
    expect(where.expiryNotifiedAt).toBeNull();
    expect(where.expiresAt.gte).toEqual(new Date(now.getTime() - 3 * DAY));
  });

  it("is idempotent: a request already claimed is not notified again", async () => {
    db.introRequest.findMany.mockResolvedValue([
      { id: "r1", matchId: "m1", type: "CHAT", senderId: "u1", sender: party("u1") },
    ]);
    db.introRequest.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 0 });
    const res = await expireIntroRequests(now);
    expect(notifyMod.notify).not.toHaveBeenCalled();
    expect(res.notified).toBe(0);
  });

  it("does not notify an inactive sender", async () => {
    db.introRequest.findMany.mockResolvedValue([
      { id: "r1", matchId: "m1", type: "CHAT", senderId: "u1", sender: party("u1", "MALE", { isDeactivated: true }) },
    ]);
    await expireIntroRequests(now);
    expect(notifyMod.notify).not.toHaveBeenCalled();
  });
});

describe("remindIntroRequests", () => {
  const row = (over: object = {}) => ({
    id: "r1", matchId: "m1", type: "FAMILY", senderId: "u1", receiverId: "f1",
    sender: party("u1"), receiver: party("f1", "FEMALE"), ...over,
  });

  it("reminds the receiver once when ≤2 days are left (feminine imperative for women)", async () => {
    db.introRequest.findMany.mockResolvedValue([row()]);
    const res = await remindIntroRequests(now);
    const where = db.introRequest.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ status: "PENDING", reminderSentAt: null });
    expect(where.expiresAt).toEqual({ gt: now, lte: new Date(now.getTime() + 2 * DAY) });
    expect(db.introRequest.updateMany).toHaveBeenCalledWith({
      where: { id: "r1", status: "PENDING", reminderSentAt: null },
      data: { reminderSentAt: now },
    });
    const call = notifyMod.notify.mock.calls[0][0];
    expect(call).toMatchObject({ userId: "f1", title: "لديك طلب تعارف ينتهي خلال يومين", url: "/dashboard/matches?match=m1" });
    expect(call.body.startsWith("ردّي")).toBe(true);
    expect(res.reminded).toBe(1);
  });

  it("uses the masculine form for men", async () => {
    db.introRequest.findMany.mockResolvedValue([row({ receiverId: "u2", receiver: party("u2", "MALE") })]);
    await remindIntroRequests(now);
    expect(notifyMod.notify.mock.calls[0][0].body.startsWith("ردّ ")).toBe(true);
  });

  it("sends nothing when already claimed, blocked, or someone is inactive", async () => {
    db.introRequest.findMany.mockResolvedValue([row({ id: "a" }), row({ id: "b" }), row({ id: "c", sender: party("u1", "MALE", { status: "SUSPENDED" }) })]);
    db.introRequest.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValue({ count: 1 });
    db.block.findFirst.mockResolvedValueOnce({ id: "blk" });
    const res = await remindIntroRequests(now);
    expect(notifyMod.notify).not.toHaveBeenCalled();
    expect(res.reminded).toBe(0);
  });
});
