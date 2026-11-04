import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  creditLedger: { groupBy: vi.fn() },
  notification: { findFirst: vi.fn() },
  user: { findUnique: vi.fn() },
}));
const notifyMod = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/notify", () => notifyMod);

import { creditsPhrase, notifyRefunds, refundBody, REFUND_TITLE } from "@/lib/cron/refund-notices";

const now = new Date("2026-11-04T15:00:00Z");
beforeEach(() => {
  vi.clearAllMocks();
  db.notification.findFirst.mockResolvedValue(null);
  db.user.findUnique.mockResolvedValue({ gender: "MALE", role: "USER", isDeactivated: false, status: "VERIFIED" });
});

describe("refund notices («رجع لك رصيد»)", () => {
  it("Arabic counts", () => {
    expect(creditsPhrase(1)).toBe("رصيداً واحداً");
    expect(creditsPhrase(2)).toBe("رصيدين");
    expect(creditsPhrase(3)).toBe("3 أرصدة");
    expect(creditsPhrase(11)).toBe("11 رصيداً");
    expect(refundBody(1, true)).toContain("لكِ");
  });

  it("one notice per member for the last 24 hours of refunds, push + bell, no SMS", async () => {
    db.creditLedger.groupBy.mockResolvedValue([{ userId: "u1", _sum: { delta: 2 } }]);
    expect(await notifyRefunds(now)).toEqual({ members: 1, notified: 1 });
    expect(db.creditLedger.groupBy.mock.calls[0][0].where).toMatchObject({ reason: "REFUND", createdAt: { gte: new Date("2026-11-03T15:00:00Z") } });
    expect(notifyMod.notify.mock.calls[0][0]).toMatchObject({ userId: "u1", title: REFUND_TITLE, sms: false, type: "PAYMENT" });
    expect(notifyMod.notify.mock.calls[0][0].body).toContain("رصيدين");
  });

  it("never twice in a window, never to a paused member", async () => {
    db.creditLedger.groupBy.mockResolvedValue([{ userId: "u1", _sum: { delta: 1 } }]);
    db.notification.findFirst.mockResolvedValue({ id: "n1" });
    expect((await notifyRefunds(now)).notified).toBe(0);
    db.notification.findFirst.mockResolvedValue(null);
    db.user.findUnique.mockResolvedValue({ gender: "MALE", role: "USER", isDeactivated: true, status: "VERIFIED" });
    expect((await notifyRefunds(now)).notified).toBe(0);
  });
});
