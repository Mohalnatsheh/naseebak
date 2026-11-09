import { describe, it, expect, vi, beforeEach } from "vitest";

// The real webhook handlers, refund and cancel code over an in-memory database; Stripe, notices and alerts are fakes.
// A member pays two Pro checkouts (two tabs, or the website and the app): the second subscription must never be live,
// never grant credits, and be cancelled and refunded at Stripe, with the admins told.
const fake = vi.hoisted(() => ({ current: null as unknown as ReturnType<typeof import("./fake-db").createFakeDb> }));
vi.mock("@/lib/db", async () => {
  const { createFakeDb } = await import("./fake-db");
  fake.current = createFakeDb();
  return { db: fake.current.db };
});
const stripe = vi.hoisted(() => ({
  subscriptions: { cancel: vi.fn(), retrieve: vi.fn(), update: vi.fn() },
  refunds: { create: vi.fn() },
}));
const invoicePayments = vi.hoisted(() => ({ paymentIntentForInvoice: vi.fn(), invoiceIdForPaymentIntent: vi.fn() }));
const notifyMock = vi.hoisted(() => ({ notify: vi.fn() }));
const alert = vi.hoisted(() => ({ sendAdminAlert: vi.fn() }));
vi.mock("@/lib/stripe", () => ({ getStripe: () => stripe }));
vi.mock("@/lib/pro/invoice-payments", () => invoicePayments);
vi.mock("@/lib/notify", () => notifyMock);
vi.mock("@/lib/admin-alert", () => alert);
vi.mock("@/lib/countries/settings", () => ({ getCountrySettings: async () => ({ proPlans: { monthly: { enabled: true, price: 4, credits: 8 } } }) }));

import { handleProCheckoutCompleted, handleProInvoicePaid } from "@/lib/pro/stripe-events";
import { currentProSubscription } from "@/lib/pro/status";
import { fakeProInvoice, fakeProSession } from "@/lib/pro/mock";

const s = () => fake.current.store;
const NOW = Math.floor(Date.now() / 1000);
const MONTH = 30 * 86400;
const meta = (paymentId: string) => ({ app: "naseebak", kind: "pro", userId: "u1", plan: "monthly", country: "JO", paymentId });
const invoice = (id: string, subscriptionId: string, paymentId: string, over: { start?: number; end?: number } = {}) =>
  fakeProInvoice({
    id, subscriptionId, customerId: "cus_1", metadata: meta(paymentId), periodStart: over.start ?? NOW - 60, periodEnd: over.end ?? NOW + MONTH,
    amountPaid: 564, currency: "usd", billingReason: "subscription_create",
  });
const pending = (id: string) =>
  s().payments.push({ id, userId: "u1", type: "SUBSCRIPTION", planName: "pro_monthly", amount: 4, currency: "JOD", provider: "STRIPE", status: "PENDING", providerTxId: null, proSubscriptionId: null, createdAt: new Date() });
const row = (stripeId: string) => s().subs.find((r) => r.stripeSubscriptionId === stripeId)!;
const credits = () => s().users[0].matchCredits;

beforeEach(() => {
  vi.clearAllMocks();
  const st = s();
  for (const k of ["subs", "payments", "grants", "ledger", "users"] as const) st[k].length = 0;
  st.users.push({ id: "u1", matchCredits: 0 });
  pending("pay1");
  pending("pay2");
  stripe.subscriptions.cancel.mockResolvedValue({ status: "canceled" });
  stripe.refunds.create.mockResolvedValue({ id: "re_1" });
  invoicePayments.paymentIntentForInvoice.mockImplementation(async (inv: string) => `pi_for_${inv}`);
  notifyMock.notify.mockResolvedValue(undefined);
  alert.sendAdminAlert.mockResolvedValue(undefined);
});

async function firstMembership() {
  expect(await handleProInvoicePaid(invoice("in_1", "sub_1", "pay1"))).toBe("ok");
  expect(credits()).toBe(8);
  notifyMock.notify.mockClear();
}

describe("a second Pro subscription while one is live", () => {
  it("is ended at once, grants nothing, is cancelled and refunded at Stripe, and the admins are emailed", async () => {
    await firstMembership();
    expect(await handleProInvoicePaid(invoice("in_2", "sub_2", "pay2"))).toBe("ok");

    expect(row("sub_2")).toMatchObject({ status: "ENDED", creditsPerGrant: 0 });
    expect(row("sub_2").endedAt).toBeInstanceOf(Date);
    expect(s().grants.map((g) => g.key)).toEqual(["invoice:in_1"]);
    expect(credits()).toBe(8);
    // The first membership is untouched and still the member's
    expect(row("sub_1")).toMatchObject({ status: "ACTIVE", creditsPerGrant: 8 });
    expect((await currentProSubscription("u1"))?.stripeSubscriptionId).toBe("sub_1");

    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith("sub_2", { invoice_now: false, prorate: false });
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalledWith("sub_1", expect.anything());
    expect(stripe.refunds.create).toHaveBeenCalledWith({ payment_intent: "pi_for_in_2" }, { idempotencyKey: "refund-pay2" });
    expect(s().payments.find((p) => p.id === "pay2")).toMatchObject({ status: "REFUNDED", providerTxId: "in_2" });
    expect(s().payments.find((p) => p.id === "pay1")).toMatchObject({ status: "COMPLETED" });

    expect(alert.sendAdminAlert).toHaveBeenCalledTimes(1);
    const [subject, text, about] = alert.sendAdminAlert.mock.calls[0];
    expect(subject).toBe("Duplicate Pro subscription cancelled and refunded");
    expect(text).toContain("sub_2");
    expect(text).toContain("sub_1");
    expect(about).toEqual({ userId: "u1" });
    // No «started» notice for the duplicate; the member hears about the refund only
    const titles = notifyMock.notify.mock.calls.map((c) => c[0].title);
    expect(titles).not.toContain("أصبحت عضوية Pro فعّالة");
    expect(titles).toContain("تم استرداد المبلغ");
  });

  it("a re-delivered invoice grants nothing, refunds nothing more and sends no second email", async () => {
    await firstMembership();
    await handleProInvoicePaid(invoice("in_2", "sub_2", "pay2"));
    vi.clearAllMocks();
    stripe.subscriptions.cancel.mockResolvedValue({ status: "canceled" });
    expect(await handleProInvoicePaid(invoice("in_2", "sub_2", "pay2"))).toBe("already");
    expect(s().grants).toHaveLength(1);
    expect(credits()).toBe(8);
    expect(stripe.refunds.create).not.toHaveBeenCalled();
    expect(alert.sendAdminAlert).not.toHaveBeenCalled();
  });

  it("checkout.session.completed first: the second row is created not live, then its invoice settles it", async () => {
    await firstMembership();
    const session = fakeProSession({ id: "cs_2", subscriptionId: "sub_2", customerId: "cus_1", metadata: meta("pay2"), created: NOW });
    expect(await handleProCheckoutCompleted(session)).toBe("ok");
    expect((row("sub_2").currentPeriodEnd as Date).getTime()).toBeLessThanOrEqual(Date.now());
    expect((await currentProSubscription("u1"))?.stripeSubscriptionId).toBe("sub_1");

    await handleProInvoicePaid(invoice("in_2", "sub_2", "pay2"));
    expect(row("sub_2")).toMatchObject({ status: "ENDED", creditsPerGrant: 0 });
    expect(credits()).toBe(8);
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith("sub_2", expect.anything());
    expect(s().payments.find((p) => p.id === "pay2")?.status).toBe("REFUNDED");
  });

  it("a failed Stripe refund: still no credits, payment left COMPLETED, admins asked to finish by hand", async () => {
    await firstMembership();
    stripe.refunds.create.mockRejectedValue(new Error("card network down"));
    expect(await handleProInvoicePaid(invoice("in_2", "sub_2", "pay2"))).toBe("ok");
    expect(credits()).toBe(8);
    expect(row("sub_2").status).toBe("ENDED");
    expect(s().payments.find((p) => p.id === "pay2")?.status).toBe("COMPLETED");
    const [subject, text] = alert.sendAdminAlert.mock.calls[0];
    expect(subject).toBe("Duplicate Pro subscription: action needed");
    expect(text).toContain("refund it in Admin");
  });

  it("a failed Stripe cancel is reported; the refund still happens", async () => {
    await firstMembership();
    stripe.subscriptions.cancel.mockRejectedValue(new Error("timeout"));
    stripe.subscriptions.retrieve.mockResolvedValue({ status: "active" });
    await handleProInvoicePaid(invoice("in_2", "sub_2", "pay2"));
    expect(s().payments.find((p) => p.id === "pay2")?.status).toBe("REFUNDED");
    const [subject, text] = alert.sendAdminAlert.mock.calls[0];
    expect(subject).toBe("Duplicate Pro subscription: action needed");
    expect(text).toContain("cancel it in the Stripe dashboard");
  });

  it("local mock subscriptions: nothing is sent to Stripe, the refund is recorded locally", async () => {
    s().payments.push({ id: "payM", userId: "u1", type: "SUBSCRIPTION", planName: "pro_monthly", amount: 4, currency: "JOD", provider: "STRIPE", status: "PENDING", providerTxId: null, proSubscriptionId: null, createdAt: new Date() });
    await firstMembership();
    await handleProInvoicePaid(invoice("mock_in_2", "mock_sub_payM", "payM"));
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
    expect(stripe.refunds.create).not.toHaveBeenCalled();
    expect(s().payments.find((p) => p.id === "payM")?.status).toBe("REFUNDED");
    expect(row("mock_sub_payM")).toMatchObject({ status: "ENDED", creditsPerGrant: 0 });
  });

  it("the live membership's own renewal is never taken for a duplicate", async () => {
    await firstMembership();
    await handleProInvoicePaid(invoice("in_2", "sub_2", "pay2"));
    vi.clearAllMocks();
    await handleProInvoicePaid(invoice("in_3", "sub_1", "pay1", { start: NOW + MONTH, end: NOW + 2 * MONTH }));
    expect(credits()).toBe(16);
    expect(row("sub_1").status).toBe("ACTIVE");
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
    expect(alert.sendAdminAlert).not.toHaveBeenCalled();
  });

  it("a new subscription after the old one ended is a normal membership", async () => {
    await firstMembership();
    row("sub_1").status = "ENDED";
    await handleProInvoicePaid(invoice("in_2", "sub_2", "pay2"));
    expect(row("sub_2")).toMatchObject({ status: "ACTIVE", creditsPerGrant: 8 });
    expect(credits()).toBe(16);
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
  });
});
