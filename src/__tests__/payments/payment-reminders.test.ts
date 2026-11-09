import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  payment: { findMany: vi.fn(), findFirst: vi.fn() },
  notification: { findFirst: vi.fn() },
}));
const notifyMod = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/notify", () => notifyMod);

import { isQuietHour, remindUnpaidPayments, UNPAID_TITLE } from "@/lib/cron/payment-reminders";

// 12:00 Amman
const now = new Date("2026-11-05T09:00:00Z");
const member = { gender: "MALE", role: "USER", phone: "962791234567", isDeactivated: false, status: "ACTIVE" };
const row = (id: string, userId: string, user: object = member) => ({ id, userId, createdAt: new Date(now.getTime() - 60 * 60 * 1000), user });

beforeEach(() => {
  vi.clearAllMocks();
  db.payment.findFirst.mockResolvedValue(null);
  db.notification.findFirst.mockResolvedValue(null);
});

describe("remindUnpaidPayments («باقي خطوة لإتمام شحن رصيدك»)", () => {
  it("one push + bell per member (latest payment), never SMS", async () => {
    db.payment.findMany.mockResolvedValue([row("p2", "u1"), row("p1", "u1"), row("p3", "u2", { ...member, gender: "FEMALE" })]);
    expect(await remindUnpaidPayments(now)).toEqual({ payments: 3, reminded: 2 });
    expect(notifyMod.notify).toHaveBeenCalledTimes(2);
    const first = notifyMod.notify.mock.calls[0][0];
    expect(first).toMatchObject({ userId: "u1", type: "PAYMENT", title: UNPAID_TITLE, sms: false, metadata: { paymentId: "p2" } });
    expect(notifyMod.notify.mock.calls[1][0].body).toContain("أكملي");
    const where = db.payment.findMany.mock.calls[0][0].where;
    expect(where.status).toEqual({ in: ["PENDING", "FAILED"] });
    expect(now.getTime() - where.createdAt.lte.getTime()).toBe(50 * 60 * 1000);
  });

  it("skips: paid since, already told, admins, test accounts", async () => {
    db.payment.findMany.mockResolvedValue([row("p1", "u1"), row("p2", "u2"), row("p3", "u3", { ...member, role: "ADMIN" })]);
    db.payment.findFirst.mockImplementation(async ({ where }) => (where.userId === "u1" ? { id: "paid" } : null));
    db.notification.findFirst.mockImplementation(async ({ where }) => (where.userId === "u2" ? { id: "n" } : null));
    expect((await remindUnpaidPayments(now)).reminded).toBe(0);
    expect(notifyMod.notify).not.toHaveBeenCalled();
  });

  it("never reminds about a Pro checkout (its text is about credit packages)", async () => {
    db.payment.findMany.mockResolvedValue([{ ...row("p1", "u1"), planName: "pro_monthly" }, { ...row("p2", "u2"), planName: "credits_5" }]);
    expect((await remindUnpaidPayments(now)).reminded).toBe(1);
    expect(notifyMod.notify).toHaveBeenCalledTimes(1);
    expect(notifyMod.notify.mock.calls[0][0].userId).toBe("u2");
    const where = db.payment.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([{ planName: null }, { planName: { notIn: ["pro_weekly", "pro_monthly", "pro_yearly"] } }]);
  });

  it("quiet at night (Amman 23:00–09:00): nothing is read or sent", async () => {
    expect(isQuietHour(new Date("2026-11-05T20:30:00Z"))).toBe(true); // 23:30
    expect(isQuietHour(new Date("2026-11-05T05:59:00Z"))).toBe(true); // 08:59
    expect(isQuietHour(new Date("2026-11-05T06:00:00Z"))).toBe(false); // 09:00
    expect(await remindUnpaidPayments(new Date("2026-11-05T22:00:00Z"))).toEqual({ payments: 0, reminded: 0 });
    expect(db.payment.findMany).not.toHaveBeenCalled();
  });
});
