import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({ payment: { updateMany: vi.fn() } }));
const refund = vi.hoisted(() => ({ handleChargeRefunded: vi.fn(), flagDispute: vi.fn() }));
const event = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/payments/refund", () => refund);
const fulfil = vi.hoisted(() => ({ fulfilCheckoutSession: vi.fn() }));
const pro = vi.hoisted(() => ({
  handleProCheckoutCompleted: vi.fn(),
  handleProInvoicePaid: vi.fn(),
  handleProInvoiceFailed: vi.fn(),
  handleProSubscriptionChanged: vi.fn(),
}));
vi.mock("@/lib/pro/stripe-events", () => pro);
vi.mock("@/lib/payments/fulfil", () => ({
  fulfilCheckoutSession: fulfil.fulfilCheckoutSession,
  isOurSession: (s: { metadata?: { app?: string } }) => s.metadata?.app === "naseebak",
}));
vi.mock("@/lib/stripe", () => ({ getStripe: () => ({ webhooks: { constructEvent: () => event.current } }) }));
const intents = vi.hoisted(() => ({ fulfilPaymentIntent: vi.fn() }));
vi.mock("@/lib/payments/intent", () => ({
  fulfilPaymentIntent: intents.fulfilPaymentIntent,
  isOurIntent: (i: { metadata?: { app?: string; paymentId?: string } }) => i.metadata?.app === "naseebak" && !!i.metadata?.paymentId,
}));

import { POST } from "@/app/api/payments/webhook/route";

const call = () => POST(new Request("http://x", { method: "POST", body: "{}", headers: { "stripe-signature": "sig" } }));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_WEBHOOK_SECRET = "whsec";
  refund.handleChargeRefunded.mockResolvedValue("refunded");
});

describe("Stripe webhook", () => {
  it("fails our row on an expired or failed async checkout", async () => {
    for (const type of ["checkout.session.expired", "checkout.session.async_payment_failed"]) {
      event.current = { type, data: { object: { metadata: { app: "naseebak", paymentId: "p1" } } } };
      expect((await call()).status).toBe(200);
    }
    expect(db.payment.updateMany).toHaveBeenCalledTimes(2);
    // No card was tried (no payment_intent): the reason is how it ended
    expect(db.payment.updateMany).toHaveBeenCalledWith({ where: { id: "p1", status: "PENDING" }, data: { status: "FAILED", failureReason: "EXPIRED" } });
    expect(db.payment.updateMany).toHaveBeenCalledWith({ where: { id: "p1", status: "PENDING" }, data: { status: "FAILED", failureReason: "ASYNC_FAILED" } });
  });

  it("routes refunds and disputes", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    event.current = { type: "charge.refunded", data: { object: { id: "ch_1" } } };
    await call();
    expect(refund.handleChargeRefunded).toHaveBeenCalled();
    event.current = { type: "charge.dispute.created", data: { object: { id: "dp_1" } } };
    await call();
    expect(refund.flagDispute).toHaveBeenCalled();
  });

  it("refuses to run without a webhook secret", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await call()).status).toBe(500);
    spy.mockRestore();
  });

  it("Arabic payment page: a succeeded intent of ours is credited; anyone else's is ignored", async () => {
    event.current = { type: "payment_intent.succeeded", data: { object: { id: "pi_1", metadata: { app: "naseebak", paymentId: "p1" } } } };
    await call();
    expect(intents.fulfilPaymentIntent).toHaveBeenCalledTimes(1);
    event.current = { type: "payment_intent.succeeded", data: { object: { id: "pi_2", metadata: {} } } };
    await call();
    expect(intents.fulfilPaymentIntent).toHaveBeenCalledTimes(1);
  });

  it("Arabic payment page: a refused card keeps the row open with the reason; a cancelled intent fails it", async () => {
    event.current = { type: "payment_intent.payment_failed", data: { object: { metadata: { app: "naseebak", paymentId: "p1" }, last_payment_error: { decline_code: "do_not_honor" } } } };
    await call();
    expect(db.payment.updateMany).toHaveBeenLastCalledWith({ where: { id: "p1", status: "PENDING" }, data: { failureReason: "DECLINED:do_not_honor" } });
    event.current = { type: "payment_intent.canceled", data: { object: { metadata: { app: "naseebak", paymentId: "p1" }, last_payment_error: null } } };
    await call();
    expect(db.payment.updateMany).toHaveBeenLastCalledWith({ where: { id: "p1", status: "PENDING" }, data: { status: "FAILED", failureReason: "CANCELLED" } });
  });

  it("Pro: a subscription-mode session goes to the Pro handler and never reaches fulfilCheckoutSession", async () => {
    pro.handleProCheckoutCompleted.mockResolvedValue("ok");
    for (const type of ["checkout.session.completed", "checkout.session.async_payment_succeeded"]) {
      event.current = { type, data: { object: { id: "cs_1", mode: "subscription", metadata: { app: "naseebak", kind: "pro" } } } };
      expect((await call()).status).toBe(200);
    }
    // Another site's subscription session: neither handler credits anything
    event.current = { type: "checkout.session.completed", data: { object: { id: "cs_2", mode: "subscription", metadata: { app: "other" } } } };
    await call();
    expect(pro.handleProCheckoutCompleted).toHaveBeenCalledTimes(3);
    expect(fulfil.fulfilCheckoutSession).not.toHaveBeenCalled();
    // A package checkout still goes to the package path
    event.current = { type: "checkout.session.completed", data: { object: { id: "cs_3", mode: "payment", metadata: { app: "naseebak" } } } };
    await call();
    expect(fulfil.fulfilCheckoutSession).toHaveBeenCalledTimes(1);
    expect(pro.handleProCheckoutCompleted).toHaveBeenCalledTimes(3);
  });

  it("Pro: routes invoice and subscription events", async () => {
    const inv = { id: "in_1" };
    const sub = { id: "sub_1" };
    event.current = { type: "invoice.paid", data: { object: inv } };
    await call();
    expect(pro.handleProInvoicePaid).toHaveBeenCalledWith(inv);
    event.current = { type: "invoice.payment_failed", data: { object: inv } };
    await call();
    expect(pro.handleProInvoiceFailed).toHaveBeenCalledWith(inv);
    event.current = { type: "customer.subscription.updated", data: { object: sub } };
    await call();
    expect(pro.handleProSubscriptionChanged).toHaveBeenLastCalledWith(sub, "updated");
    event.current = { type: "customer.subscription.deleted", data: { object: sub } };
    await call();
    expect(pro.handleProSubscriptionChanged).toHaveBeenLastCalledWith(sub, "deleted");
  });

  it("Pro: a handler error answers 500 so Stripe retries", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    pro.handleProInvoicePaid.mockRejectedValueOnce(new Error("db down"));
    event.current = { type: "invoice.paid", id: "evt_1", data: { object: { id: "in_1" } } };
    expect((await call()).status).toBe(500);
    spy.mockRestore();
  });
});
