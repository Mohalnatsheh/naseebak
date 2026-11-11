import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  payment: { create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
  user: { findUnique: vi.fn(), update: vi.fn() },
  $transaction: vi.fn(),
}));
const stripe = vi.hoisted(() => ({
  sessionsCreate: vi.fn(),
  intentsCreate: vi.fn(),
  intentsRetrieve: vi.fn(),
  intentsCancel: vi.fn(),
}));
const setting = vi.hoisted(() => ({ arabic: "off", jod: false }));
const sideEffects = vi.hoisted(() => ({ recordCredit: vi.fn(), notify: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ session: { user: { id: "u1" } } }) }));
vi.mock("@/lib/settings", () => ({
  getSetting: async (k: string) => (k === "arabic_checkout" ? setting.arabic : ""),
  jodChargingFor: async (c: string | null | undefined) => setting.jod && c === "JO",
}));
vi.mock("@/lib/credits", () => ({ recordCredit: sideEffects.recordCredit }));
vi.mock("@/lib/notify", () => ({ notify: sideEffects.notify }));
vi.mock("@/lib/mobile-config", () => ({ appPaymentsFor: async () => true }));
vi.mock("@/lib/countries/settings", async (orig) => {
  const real = await orig<typeof import("@/lib/countries/settings")>();
  return { ...real, getCountrySettings: async () => ({}), purchasesAvailable: () => true };
});
vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    checkout: { sessions: { create: stripe.sessionsCreate } },
    paymentIntents: { create: stripe.intentsCreate, retrieve: stripe.intentsRetrieve, cancel: stripe.intentsCancel },
  }),
}));

import { POST as checkout } from "@/app/api/payments/checkout/route";
import { POST as cancel } from "@/app/api/payments/cancel/route";
import { fulfilPaymentIntent, payPagePath, paymentIntentParams, tokenMatches } from "@/lib/payments/intent";

const post = (body: unknown) => new Request("http://x", { method: "POST", body: JSON.stringify(body) });
import type Stripe from "stripe";

const intent = (status: Stripe.PaymentIntent.Status, extra: object = {}) => ({
  id: "pi_1",
  status,
  client_secret: "pi_1_secret",
  metadata: { app: "naseebak", paymentId: "p1", userId: "u1", packageId: "launch_25", credits: "25" },
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  setting.arabic = "off";
  process.env.STRIPE_SECRET_KEY = "sk_test";
  process.env.NEXT_PUBLIC_APP_URL = "https://naseebak.com";
  delete process.env.PAYMENTS_MOCK;
  db.user.findUnique.mockResolvedValue({ country: "JO", phone: "962790000001" });
  db.payment.create.mockResolvedValue({});
  db.payment.updateMany.mockResolvedValue({ count: 1 });
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));
  stripe.sessionsCreate.mockResolvedValue({ id: "cs_1", client_secret: "sec", url: "https://checkout.stripe.com/x" });
  stripe.intentsCreate.mockResolvedValue(intent("requires_payment_method"));
});

describe("Arabic payment page: creating a payment", () => {
  it("switch off: the usual Stripe checkout, no intent", async () => {
    const body = await (await checkout(post({ packageId: "launch_25" }))).json();
    expect(body.clientSecret).toBe("sec");
    expect(stripe.intentsCreate).not.toHaveBeenCalled();
  });

  it("switch on, website: an intent with our metadata and statement name, a private /pay link, the row keeps both", async () => {
    setting.arabic = "all";
    const body = await (await checkout(post({ packageId: "launch_25" }))).json();
    expect(stripe.sessionsCreate).not.toHaveBeenCalled();
    const params = stripe.intentsCreate.mock.calls[0][0];
    expect(params).toMatchObject({ amount: 846, currency: "usd", statement_descriptor_suffix: "NASEEBAK", metadata: { app: "naseebak", credits: "25", userId: "u1" } });
    expect(body.payUrl).toMatch(/^\/pay\/[0-9a-f-]+\?t=[\w-]{20,}&from=web$/);
    const row = db.payment.create.mock.calls[0][0].data;
    expect(row).toMatchObject({ stripePaymentIntentId: "pi_1", stripeSessionId: null, status: "PENDING", amount: 6 });
    expect(body.payUrl).toContain(row.payToken);
    expect(row.id).toBe(params.metadata.paymentId);
  });

  it("with jod_charging on: the intent charges the dinar price in fils and the row records jod", async () => {
    setting.arabic = "all";
    setting.jod = true;
    await checkout(post({ packageId: "launch_25" }));
    setting.jod = false;
    expect(stripe.intentsCreate.mock.calls[0][0]).toMatchObject({ amount: 6000, currency: "jod" });
    expect(db.payment.create.mock.calls[0][0].data).toMatchObject({ amount: 6, currency: "JOD", chargeCurrency: "jod" });
  });

  it("switch on, app: a full https link the app can open", async () => {
    setting.arabic = "all";
    const body = await (await checkout(post({ packageId: "launch_25", mode: "hosted" }))).json();
    expect(body.checkoutUrl).toMatch(/^https:\/\/naseebak\.com\/pay\/.+&from=app$/);
  });

  it("«test accounts only»: a normal member still gets the usual checkout", async () => {
    setting.arabic = "test";
    await checkout(post({ packageId: "launch_25" }));
    expect(stripe.intentsCreate).not.toHaveBeenCalled();
    expect(stripe.sessionsCreate).toHaveBeenCalled();
  });

  it("Stripe refuses the intent: the member gets the usual checkout, never an error", async () => {
    setting.arabic = "all";
    stripe.intentsCreate.mockRejectedValue(Object.assign(new Error("down"), { type: "StripeAPIError" }));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await checkout(post({ packageId: "launch_25" }));
    spy.mockRestore();
    expect(res.status).toBe(200);
    expect((await res.json()).clientSecret).toBe("sec");
    expect(db.payment.create.mock.calls[0][0].data).toMatchObject({ stripeSessionId: "cs_1", stripePaymentIntentId: null, payToken: null });
  });
});

describe("Arabic payment page: crediting", () => {
  it("a succeeded intent credits once (the row is claimed in the same transaction)", async () => {
    expect(await fulfilPaymentIntent(intent("succeeded"))).toBe("fulfilled");
    expect(db.payment.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: "p1", userId: "u1", status: { in: ["PENDING", "FAILED"] } },
      data: { status: "COMPLETED", providerTxId: "pi_1" },
    });
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { matchCredits: { increment: 25 } } });
    db.payment.updateMany.mockResolvedValue({ count: 0 });
    expect(await fulfilPaymentIntent(intent("succeeded"))).toBe("already");
    expect(db.user.update).toHaveBeenCalledTimes(1);
  });

  it("not paid yet, or not ours (a Checkout-made intent has no Naseebak metadata): nothing", async () => {
    expect(await fulfilPaymentIntent(intent("processing"))).toBe("not_paid");
    expect(await fulfilPaymentIntent({ id: "pi_x", status: "succeeded", metadata: {} as Stripe.Metadata })).toBe("not_ours");
    expect(db.user.update).not.toHaveBeenCalled();
  });
});

describe("Arabic payment page: cancel («رجوع» in the app)", () => {
  beforeEach(() => db.payment.findFirst.mockResolvedValue({ id: "p1", stripeSessionId: null, stripePaymentIntentId: "pi_1" }));

  it("unpaid: cancelled at Stripe and the row fails as CANCELLED", async () => {
    stripe.intentsRetrieve.mockResolvedValue(intent("requires_payment_method", { last_payment_error: null }));
    await cancel(post({ paymentId: "p1" }));
    expect(stripe.intentsCancel).toHaveBeenCalledWith("pi_1");
    expect(db.payment.updateMany).toHaveBeenCalledWith({ where: { id: "p1", status: "PENDING" }, data: { status: "FAILED", failureReason: "CANCELLED" } });
  });

  it("a card was refused before going back: the reason is the decline", async () => {
    stripe.intentsRetrieve.mockResolvedValue(intent("requires_payment_method", { last_payment_error: { decline_code: "insufficient_funds" } }));
    await cancel(post({ paymentId: "p1" }));
    expect(db.payment.updateMany.mock.calls[0][0].data.failureReason).toBe("DECLINED:insufficient_funds");
  });

  it("already paid: credited, never cancelled", async () => {
    stripe.intentsRetrieve.mockResolvedValue(intent("succeeded"));
    const body = await (await cancel(post({ paymentId: "p1" }))).json();
    expect(body.paid).toBe(true);
    expect(stripe.intentsCancel).not.toHaveBeenCalled();
  });

  it("the bank is still confirming: left alone", async () => {
    stripe.intentsRetrieve.mockResolvedValue(intent("processing"));
    await cancel(post({ paymentId: "p1" }));
    expect(stripe.intentsCancel).not.toHaveBeenCalled();
    expect(db.payment.updateMany).not.toHaveBeenCalled();
  });
});

describe("Arabic payment page: the private link", () => {
  it("token check is exact; the link carries where the member came from", () => {
    expect(tokenMatches("abc", "abc")).toBe(true);
    expect(tokenMatches("abc", "abd")).toBe(false);
    expect(tokenMatches("abc", "ab")).toBe(false);
    expect(tokenMatches(null, "abc")).toBe(false);
    expect(payPagePath("p 1", "t/k", "app")).toBe("/pay/p%201?t=t%2Fk&from=app");
  });

  it("intent params: amount and currency are the package's charge", () => {
    const j = paymentIntentParams({ id: "launch_10", name: "10 أرصدة", credits: 10, chargeCurrency: "jod", chargeAmount: 3000 }, { paymentId: "p", userId: "u" });
    expect(j).toMatchObject({ amount: 3000, currency: "jod" });
    const p = paymentIntentParams({ id: "sa_10", name: "10 أرصدة", credits: 10, chargeCurrency: "sar", chargeAmount: 1500 }, { paymentId: "p", userId: "u" });
    expect(p).toMatchObject({ amount: 1500, currency: "sar", automatic_payment_methods: { enabled: true } });
  });
});
