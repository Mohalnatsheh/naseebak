import { describe, it, expect, vi, beforeEach } from "vitest";

// The real webhook handlers, refund and cancel code over an in-memory database; Stripe, notices and alerts are fakes.
// A member pays two Pro checkouts (two tabs, or the website and the app): the second subscription must never be live
// and is cancelled at Stripe; its payment grants its credits (money was taken) and only an admin refunds, by hand
// (owner, 2026-11-09). Same for a renewal paid after Pro ended here. Nothing calls Stripe's refund API.
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

import { handleProCheckoutCompleted, handleProInvoicePaid, handleProSubscriptionChanged } from "@/lib/pro/stripe-events";
import { applyRefund } from "@/lib/payments/refund";
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

const payment = (id: string) => s().payments.find((p) => p.id === id);

describe("a second Pro subscription while one is live", () => {
  it("is never live, is cancelled at Stripe, grants its own credits, refunds nothing, and the admins get both payments", async () => {
    await firstMembership();
    expect(await handleProInvoicePaid(invoice("in_2", "sub_2", "pay2"))).toBe("ok");

    expect(row("sub_2").status).toBe("ENDED");
    expect(row("sub_2").endedAt).toBeInstanceOf(Date);
    // The money was taken: its invoice grants its credits like any paid invoice
    expect(s().grants.map((g) => g.key)).toEqual(["invoice:in_1", "invoice:in_2"]);
    expect(credits()).toBe(16);
    // The older membership stays the member's Pro
    expect(row("sub_1")).toMatchObject({ status: "ACTIVE", creditsPerGrant: 8 });
    expect((await currentProSubscription("u1"))?.stripeSubscriptionId).toBe("sub_1");

    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith("sub_2", { invoice_now: false, prorate: false });
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalledWith("sub_1", expect.anything());
    // No automatic refund, anywhere
    expect(stripe.refunds.create).not.toHaveBeenCalled();
    expect(payment("pay2")).toMatchObject({ status: "COMPLETED", providerTxId: "in_2" });
    expect(payment("pay1")).toMatchObject({ status: "COMPLETED" });

    expect(alert.sendAdminAlert).toHaveBeenCalledTimes(1);
    const [subject, text, about] = alert.sendAdminAlert.mock.calls[0];
    expect(subject).toBe("Duplicate Pro subscription: refund decision needed");
    for (const id of ["sub_2", "sub_1", "pay2", "pay1"]) expect(text).toContain(id);
    expect(text).toContain("Nothing was refunded");
    expect(about).toEqual({ userId: "u1" });
    // No «started» notice and no refund notice
    const titles = notifyMock.notify.mock.calls.map((c) => c[0].title);
    expect(titles).not.toContain("أصبحت عضوية Pro فعّالة");
    expect(titles).not.toContain("تم استرداد المبلغ");
  });

  it("an admin refund later takes back exactly that payment's credits and leaves the kept membership alone", async () => {
    await firstMembership();
    await handleProInvoicePaid(invoice("in_2", "sub_2", "pay2"));
    expect(credits()).toBe(16);
    expect(await applyRefund({ paymentId: "pay2", adminId: "admin1" })).toBe("refunded");
    expect(credits()).toBe(8);
    expect(row("sub_1").status).toBe("ACTIVE");
    expect((await currentProSubscription("u1"))?.stripeSubscriptionId).toBe("sub_1");
  });

  it("the refund notice says credits were removed only when some were (Minor 8)", async () => {
    await firstMembership();
    await handleProInvoicePaid(invoice("in_2", "sub_2", "pay2"));
    s().users[0].matchCredits = 0; // spent meanwhile: nothing left to take back
    notifyMock.notify.mockClear();
    await applyRefund({ paymentId: "pay2", adminId: "admin1" });
    const body = notifyMock.notify.mock.calls.find((c) => c[0].title === "تم استرداد المبلغ")![0].body as string;
    expect(body).toMatch(/^تم استرداد .+ من اشتراك Pro إلى بطاقتك\.$/);
    expect(body).not.toContain("وأُزيل");
  });

  it("a re-delivered invoice grants nothing more and sends no second email", async () => {
    await firstMembership();
    await handleProInvoicePaid(invoice("in_2", "sub_2", "pay2"));
    vi.clearAllMocks();
    stripe.subscriptions.cancel.mockResolvedValue({ status: "canceled" });
    expect(await handleProInvoicePaid(invoice("in_2", "sub_2", "pay2"))).toBe("already");
    expect(s().grants).toHaveLength(2);
    expect(credits()).toBe(16);
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
    expect(row("sub_2").status).toBe("ENDED");
    expect((await currentProSubscription("u1"))?.stripeSubscriptionId).toBe("sub_1");
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith("sub_2", expect.anything());
    expect(stripe.refunds.create).not.toHaveBeenCalled();
    expect(payment("pay2")?.status).toBe("COMPLETED");
  });

  it("a failed Stripe cancel: the admins are asked to cancel by hand; still nothing refunded", async () => {
    await firstMembership();
    stripe.subscriptions.cancel.mockRejectedValue(new Error("timeout"));
    stripe.subscriptions.retrieve.mockResolvedValue({ status: "active" });
    await handleProInvoicePaid(invoice("in_2", "sub_2", "pay2"));
    expect(payment("pay2")?.status).toBe("COMPLETED");
    expect(stripe.refunds.create).not.toHaveBeenCalled();
    const [subject, text] = alert.sendAdminAlert.mock.calls[0];
    expect(subject).toBe("Duplicate Pro subscription: action needed");
    expect(text).toContain("cancel it in the Stripe dashboard");
  });

  it("local mock subscriptions: nothing is sent to Stripe, only the local rows change", async () => {
    s().payments.push({ id: "payM", userId: "u1", type: "SUBSCRIPTION", planName: "pro_monthly", amount: 4, currency: "JOD", provider: "STRIPE", status: "PENDING", providerTxId: null, proSubscriptionId: null, createdAt: new Date() });
    await firstMembership();
    await handleProInvoicePaid(invoice("mock_in_2", "mock_sub_payM", "payM"));
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
    expect(stripe.refunds.create).not.toHaveBeenCalled();
    expect(payment("payM")?.status).toBe("COMPLETED");
    expect(row("mock_sub_payM").status).toBe("ENDED");
    expect(alert.sendAdminAlert.mock.calls[0][1]).toContain("Local mock");
  });

  it("the live membership's own renewal is never taken for a duplicate", async () => {
    await firstMembership();
    await handleProInvoicePaid(invoice("in_2", "sub_2", "pay2"));
    vi.clearAllMocks();
    await handleProInvoicePaid(invoice("in_3", "sub_1", "pay1", { start: NOW + MONTH, end: NOW + 2 * MONTH }));
    expect(credits()).toBe(24);
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

describe("a renewal paid after Pro ended here (I1)", () => {
  const renewal = () => invoice("in_9", "sub_1", "pay1", { start: NOW + MONTH, end: NOW + 2 * MONTH });

  it.each(["ENDED", "CANCELED"])("%s: Pro is not revived, Stripe is cancelled, the credits are granted, nothing refunded, admins emailed", async (status) => {
    await firstMembership();
    const endBefore = row("sub_1").currentPeriodEnd;
    row("sub_1").status = status;
    alert.sendAdminAlert.mockClear();

    expect(await handleProInvoicePaid(renewal())).toBe("ok");
    expect(row("sub_1").status).toBe(status);
    expect(row("sub_1").currentPeriodEnd).toEqual(endBefore);
    expect(await currentProSubscription("u1")).toBeNull();
    expect(credits()).toBe(16);
    const paid = s().payments.find((p) => p.providerTxId === "in_9");
    expect(paid).toMatchObject({ status: "COMPLETED", proSubscriptionId: row("sub_1").id });

    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith("sub_1", { invoice_now: false, prorate: false });
    expect(stripe.refunds.create).not.toHaveBeenCalled();
    expect(alert.sendAdminAlert).toHaveBeenCalledTimes(1);
    const [subject, text] = alert.sendAdminAlert.mock.calls[0];
    expect(subject).toBe("Pro renewal paid after Pro ended: refund decision needed");
    expect(text).toContain("in_9");
    expect(text).toContain(paid!.id);
    expect(text).toContain("Nothing was refunded");
    const titles = notifyMock.notify.mock.calls.map((c) => c[0].title);
    expect(titles).not.toContain("أصبحت عضوية Pro فعّالة");
  });

  it("a re-delivery of that renewal grants nothing more and sends no second email", async () => {
    await firstMembership();
    row("sub_1").status = "ENDED";
    await handleProInvoicePaid(renewal());
    alert.sendAdminAlert.mockClear();
    expect(await handleProInvoicePaid(renewal())).toBe("already");
    expect(credits()).toBe(16);
    expect(alert.sendAdminAlert).not.toHaveBeenCalled();
    expect(stripe.refunds.create).not.toHaveBeenCalled();
  });

  it("a mock subscription only changes locally", async () => {
    s().payments.push({ id: "payM", userId: "u1", type: "SUBSCRIPTION", planName: "pro_monthly", amount: 4, currency: "JOD", provider: "STRIPE", status: "PENDING", providerTxId: null, proSubscriptionId: null, createdAt: new Date() });
    expect(await handleProInvoicePaid(invoice("mock_in_1", "mock_sub_payM", "payM"))).toBe("ok");
    row("mock_sub_payM").status = "CANCELED";
    await handleProInvoicePaid(invoice("mock_in_2", "mock_sub_payM", "payM", { start: NOW + MONTH, end: NOW + 2 * MONTH }));
    expect(row("mock_sub_payM").status).toBe("CANCELED");
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
    expect(stripe.refunds.create).not.toHaveBeenCalled();
  });
});

describe("Stripe unpaid / paused end Pro here and are cancelled at Stripe (I1)", () => {
  const stripeSub = (id: string, status: string) =>
    ({ id, status, cancel_at_period_end: false, metadata: meta("pay1"), items: { data: [] } }) as never;

  it.each(["unpaid", "paused"])("%s: CANCELED here, cancelled at Stripe, the member told once", async (status) => {
    await firstMembership();
    expect(await handleProSubscriptionChanged(stripeSub("sub_1", status))).toBe("ok");
    expect(row("sub_1").status).toBe("CANCELED");
    expect(await currentProSubscription("u1")).toBeNull();
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith("sub_1", { invoice_now: false, prorate: false });
    expect(stripe.refunds.create).not.toHaveBeenCalled();
    expect(alert.sendAdminAlert).not.toHaveBeenCalled();
  });

  it("a repeat of the event tries the cancel again (an earlier one may have failed)", async () => {
    await firstMembership();
    stripe.subscriptions.cancel.mockRejectedValueOnce(new Error("timeout"));
    stripe.subscriptions.retrieve.mockResolvedValueOnce({ status: "unpaid" });
    await handleProSubscriptionChanged(stripeSub("sub_1", "unpaid"));
    expect(alert.sendAdminAlert).toHaveBeenCalledTimes(1);
    expect(alert.sendAdminAlert.mock.calls[0][0]).toBe("Pro subscription: cancel it in Stripe");
    expect(await handleProSubscriptionChanged(stripeSub("sub_1", "unpaid"))).toBe("already");
    expect(stripe.subscriptions.cancel).toHaveBeenCalledTimes(2);
    expect(alert.sendAdminAlert).toHaveBeenCalledTimes(1);
  });

  it("past_due and canceled are not cancelled again at Stripe; a mock subscription never reaches Stripe", async () => {
    await firstMembership();
    await handleProSubscriptionChanged(stripeSub("sub_1", "past_due"));
    await handleProSubscriptionChanged(stripeSub("sub_1", "canceled"));
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
    s().payments.push({ id: "payM", userId: "u2", type: "SUBSCRIPTION", planName: "pro_monthly", amount: 4, currency: "JOD", provider: "STRIPE", status: "PENDING", providerTxId: null, proSubscriptionId: null, createdAt: new Date() });
    s().users.push({ id: "u2", matchCredits: 0 });
    await handleProInvoicePaid(fakeProInvoice({
      id: "mock_in_1", subscriptionId: "mock_sub_payM", customerId: "cus_2", metadata: { ...meta("payM"), userId: "u2" },
      periodStart: NOW - 60, periodEnd: NOW + MONTH, amountPaid: 564, currency: "usd", billingReason: "subscription_create",
    }));
    await handleProSubscriptionChanged({ id: "mock_sub_payM", status: "unpaid", cancel_at_period_end: false, metadata: { ...meta("payM"), userId: "u2" }, items: { data: [] } } as never);
    expect(row("mock_sub_payM").status).toBe("CANCELED");
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
  });
});
