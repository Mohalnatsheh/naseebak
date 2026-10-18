import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  payment: { findUnique: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
  user: { findUnique: vi.fn(), update: vi.fn() },
  $transaction: vi.fn(),
}));
const credits = vi.hoisted(() => ({ recordCredit: vi.fn() }));
const notifyMod = vi.hoisted(() => ({ notify: vi.fn() }));
const alert = vi.hoisted(() => ({ sendAdminAlert: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/credits", () => credits);
vi.mock("@/lib/notify", () => notifyMod);
vi.mock("@/lib/admin-alert", () => alert);

import { applyRefund, flagDispute, handleChargeRefunded } from "@/lib/payments/refund";

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) => fn(db));
  db.payment.findUnique.mockResolvedValue({ id: "p1", status: "COMPLETED", userId: "u1", planName: "credits_5" });
  db.payment.findFirst.mockResolvedValue({ id: "p1", status: "COMPLETED", userId: "u1", planName: "credits_5" });
  db.payment.updateMany.mockResolvedValue({ count: 1 });
  db.user.findUnique.mockResolvedValue({ matchCredits: 7 });
});

describe("applyRefund", () => {
  it("marks the payment refunded, takes the package's credits back and tells the buyer in USD", async () => {
    expect(await applyRefund({ paymentId: "p1" })).toBe("refunded");
    expect(db.payment.updateMany).toHaveBeenCalledWith({ where: { id: "p1", status: "COMPLETED" }, data: { status: "REFUNDED" } });
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { matchCredits: 2 } });
    expect(credits.recordCredit).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", delta: -5, reason: "REFUND", refId: "p1" }),
      db,
    );
    const body = notifyMod.notify.mock.calls[0][0].body as string;
    expect(body).toContain("5.64$");
    expect(body).not.toContain("دينار");
  });

  it("floors the balance at 0", async () => {
    db.user.findUnique.mockResolvedValue({ matchCredits: 2 });
    await applyRefund({ paymentId: "p1" });
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { matchCredits: 0 } });
    expect(credits.recordCredit).toHaveBeenCalledWith(expect.objectContaining({ delta: -2 }), db);
  });

  it("deducts once when admin route and webhook both arrive", async () => {
    db.payment.updateMany.mockResolvedValue({ count: 0 });
    expect(await applyRefund({ paymentId: "p1" })).toBe("already");
    expect(db.user.update).not.toHaveBeenCalled();
    expect(notifyMod.notify).not.toHaveBeenCalled();
  });

  it("keeps the record of a deleted buyer's payment (no user to charge back or tell)", async () => {
    db.payment.findUnique.mockResolvedValue({ id: "p1", status: "COMPLETED", userId: null, planName: "credits_5" });
    expect(await applyRefund({ paymentId: "p1" })).toBe("refunded");
    expect(db.user.update).not.toHaveBeenCalled();
    expect(notifyMod.notify).not.toHaveBeenCalled();
  });
});

describe("Stripe charge events", () => {
  it("a full refund in Stripe refunds the payment found by its payment intent", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const charge: any = { id: "ch_1", payment_intent: "pi_1", refunded: true, amount: 564, amount_refunded: 564, currency: "usd" };
    expect(await handleChargeRefunded(charge)).toBe("refunded");
    expect(db.payment.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { providerTxId: "pi_1", provider: "STRIPE" } }));
  });

  it("a partial refund only alerts the admins", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const charge: any = { id: "ch_1", payment_intent: "pi_1", refunded: false, amount: 564, amount_refunded: 100, currency: "usd" };
    expect(await handleChargeRefunded(charge)).toBe("partial");
    expect(db.payment.updateMany).not.toHaveBeenCalled();
    expect(alert.sendAdminAlert).toHaveBeenCalled();
  });

  it("another site's charge is ignored", async () => {
    db.payment.findFirst.mockResolvedValue(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await handleChargeRefunded({ payment_intent: "pi_x", refunded: true } as any)).toBe("not_ours");
    expect(alert.sendAdminAlert).not.toHaveBeenCalled();
  });

  it("a dispute flags the payment and alerts the admins", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dispute: any = { id: "dp_1", payment_intent: "pi_1", reason: "fraudulent", amount: 564, currency: "usd" };
    expect(await flagDispute(dispute)).toBe("flagged");
    expect(db.payment.updateMany).toHaveBeenCalledWith({ where: { id: "p1", disputedAt: null }, data: { disputedAt: expect.any(Date) } });
    expect(alert.sendAdminAlert).toHaveBeenCalledWith("Stripe dispute opened", expect.stringContaining("p1"));
  });
});
