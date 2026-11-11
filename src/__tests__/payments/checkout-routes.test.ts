import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  payment: { create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
  user: { findUnique: vi.fn() },
}));
const stripe = vi.hoisted(() => ({ create: vi.fn(), expire: vi.fn(), retrieve: vi.fn() }));
const fulfil = vi.hoisted(() => ({ fulfilCheckoutSession: vi.fn(), CHECKOUT_APP: "naseebak" }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ session: { user: { id: "u1" } } }) }));
vi.mock("@/lib/payments/fulfil", () => fulfil);
// Lets a test act as if a country's prices were approved and sales switched on (null = the real rule)
const gate = vi.hoisted(() => ({ selling: null as null | boolean }));
vi.mock("@/lib/countries/settings", async (orig) => {
  const real = await orig<typeof import("@/lib/countries/settings")>();
  return { ...real, purchasesAvailable: (s: Parameters<typeof real.purchasesAvailable>[0]) => gate.selling ?? real.purchasesAvailable(s) };
});
// Switch jod_charging (null = the real setting, off here)
const jod = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/settings", async (orig) => {
  const real = await orig<typeof import("@/lib/settings")>();
  return { ...real, jodChargingFor: async (c: string | null | undefined) => jod.on && c === "JO" };
});
vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({ checkout: { sessions: { create: stripe.create, expire: stripe.expire, retrieve: stripe.retrieve } } }),
}));

import { POST as checkout } from "@/app/api/payments/checkout/route";
import { POST as cancel } from "@/app/api/payments/cancel/route";

const post = (body: unknown) => new Request("http://x", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_SECRET_KEY = "sk_test";
  db.payment.updateMany.mockResolvedValue({ count: 1 });
  db.user.findUnique.mockResolvedValue({ country: "JO" });
  jod.on = false;
});

describe("POST /api/payments/checkout, switch jod_charging", () => {
  it("off: Jordan is charged in USD and the row records usd", async () => {
    stripe.create.mockResolvedValue({ id: "cs_1", client_secret: "sec" });
    await checkout(post({ packageId: "launch_10" }));
    expect(stripe.create.mock.calls[0][0].line_items[0].price_data).toMatchObject({ currency: "usd", unit_amount: 423 });
    expect(db.payment.create.mock.calls[0][0].data).toMatchObject({ amount: 3, currency: "JOD", chargeCurrency: "usd" });
  });

  it("on: Jordan is charged the dinar price in fils, no dollars on the page, and the row records jod", async () => {
    jod.on = true;
    stripe.create.mockResolvedValue({ id: "cs_1", url: "https://checkout.stripe.com/x" });
    await checkout(post({ packageId: "launch_10", mode: "hosted" }));
    const args = stripe.create.mock.calls[0][0];
    expect(args.line_items[0].price_data).toMatchObject({ currency: "jod", unit_amount: 3000 });
    expect(args.custom_text.submit.message).toContain("10 أرصدة مقابل 3 د.أ");
    expect(args.custom_text.submit.message).not.toContain("$");
    expect(args.custom_text.submit.message).not.toContain("بالدولار");
    expect(db.payment.create.mock.calls[0][0].data).toMatchObject({ amount: 3, currency: "JOD", chargeCurrency: "jod" });
  });

  it("on: a Saudi member is still charged in SAR", async () => {
    jod.on = true;
    db.user.findUnique.mockResolvedValue({ country: "SA" });
    gate.selling = true;
    stripe.create.mockResolvedValue({ id: "cs_1", client_secret: "sec" });
    await checkout(post({ packageId: "sa_10" }));
    gate.selling = null;
    expect(stripe.create.mock.calls[0][0].line_items[0].price_data).toMatchObject({ currency: "sar", unit_amount: 1500 });
    expect(db.payment.create.mock.calls[0][0].data).toMatchObject({ currency: "SAR", chargeCurrency: "sar" });
  });
});

describe("POST /api/payments/checkout", () => {
  it("writes the PENDING row only after Stripe returns a session, with its id", async () => {
    stripe.create.mockResolvedValue({ id: "cs_1", client_secret: "sec" });
    const res = await checkout(post({ packageId: "launch_25" }));
    expect(res.status).toBe(200);
    const args = stripe.create.mock.calls[0][0];
    expect(args.line_items[0].price_data).toMatchObject({ currency: "usd", unit_amount: 846 });
    expect(args.expires_at).toBeGreaterThan(Date.now() / 1000 + 30 * 60);
    const row = db.payment.create.mock.calls[0][0].data;
    expect(row).toMatchObject({ status: "PENDING", stripeSessionId: "cs_1", amount: 6, planName: "launch_25", userId: "u1" });
    expect(row.id).toBe(args.metadata.paymentId);
  });

  it("shows Naseebak on the checkout: name, logo, Arabic price line, statement name, Arabic product", async () => {
    stripe.create.mockResolvedValue({ id: "cs_1", url: "https://checkout.stripe.com/x" });
    await checkout(post({ packageId: "launch_25", mode: "hosted" }));
    const args = stripe.create.mock.calls[0][0];
    expect(args.branding_settings).toMatchObject({ display_name: "نصيبك (Naseebak)", logo: { type: "url" }, icon: { type: "url" } });
    expect(args.custom_text.submit.message).toContain("25 رصيداً مقابل 6 د.أ");
    expect(args.custom_text.submit.message).toContain("8.46$");
    expect(args.payment_intent_data.statement_descriptor_suffix).toBe("NASEEBAK");
    expect(args.line_items[0].price_data.product_data.name).toBe("نصيبك · 25 رصيداً");
  });

  it("website (embedded) form: no logo/name settings — Stripe refuses a logo there — but the Arabic line and statement name", async () => {
    stripe.create.mockResolvedValue({ id: "cs_1", client_secret: "sec" });
    await checkout(post({ packageId: "launch_25" }));
    const args = stripe.create.mock.calls[0][0];
    expect(args.ui_mode).toBe("embedded");
    expect(args.branding_settings).toBeUndefined();
    expect(args.custom_text.submit.message).toContain("25 رصيداً");
    expect(args.payment_intent_data.statement_descriptor_suffix).toBe("NASEEBAK");
  });

  it("app (hosted) page: also the Naseebak name, logo and colour", async () => {
    stripe.create.mockResolvedValue({ id: "cs_1", url: "https://checkout.stripe.com/x" });
    await checkout(post({ packageId: "launch_25", mode: "hosted" }));
    expect(stripe.create.mock.calls[0][0].branding_settings).toMatchObject({ display_name: "نصيبك (Naseebak)", logo: { type: "url" } });
  });

  it("Stripe refuses a request that names no field (the 14:38 embedded-logo error): the plain checkout is created", async () => {
    stripe.create
      .mockRejectedValueOnce(Object.assign(new Error("You cannot set `logo` when `ui_mode` is `embedded`."), { type: "StripeInvalidRequestError" }))
      .mockResolvedValueOnce({ id: "cs_3", client_secret: "sec" });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await checkout(post({ packageId: "launch_10" }));
    errSpy.mockRestore();
    expect(res.status).toBe(200);
    expect(stripe.create.mock.calls[1][0].custom_text).toBeUndefined();
    expect(db.payment.create.mock.calls[0][0].data.stripeSessionId).toBe("cs_3");
  });

  it("if Stripe refuses one of the extras, the plain checkout is created instead (payments never break)", async () => {
    stripe.create
      .mockRejectedValueOnce(Object.assign(new Error("bad"), { type: "StripeInvalidRequestError", param: "branding_settings[logo][url]" }))
      .mockResolvedValueOnce({ id: "cs_2", client_secret: "sec" });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await checkout(post({ packageId: "launch_25" }));
    errSpy.mockRestore();
    expect(res.status).toBe(200);
    expect(stripe.create).toHaveBeenCalledTimes(2);
    expect(stripe.create.mock.calls[1][0].branding_settings).toBeUndefined();
    expect(db.payment.create.mock.calls[0][0].data.stripeSessionId).toBe("cs_2");
  });

  it("leaves no row behind when Stripe fails", async () => {
    stripe.create.mockRejectedValue(Object.assign(new Error("No such key"), { type: "StripeAuthenticationError" }));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await checkout(post({ packageId: "launch_25" }));
    expect(res.status).toBe(502);
    expect(db.payment.create).not.toHaveBeenCalled();
    expect(errSpy.mock.calls[0][0]).toContain("Stripe checkout session failed");
    errSpy.mockRestore();
  });

  it("refuses an unknown package", async () => {
    expect((await checkout(post({ packageId: "free" }))).status).toBe(400);
  });
});

describe("POST /api/payments/cancel («رجوع»)", () => {
  it("expires the Stripe session and fails that row", async () => {
    db.payment.findFirst.mockResolvedValue({ id: "p1", stripeSessionId: "cs_1" });
    await cancel(post({ paymentId: "p1" }));
    expect(stripe.expire).toHaveBeenCalledWith("cs_1");
    expect(db.payment.updateMany).toHaveBeenCalledWith({ where: { id: "p1", status: "PENDING" }, data: { status: "FAILED", failureReason: "CANCELLED" } });
  });

  it("credits a session that was paid meanwhile instead of failing it", async () => {
    db.payment.findFirst.mockResolvedValue({ id: "p1", stripeSessionId: "cs_1" });
    stripe.expire.mockRejectedValue(new Error("session is complete"));
    stripe.retrieve.mockResolvedValue({ id: "cs_1", status: "complete", payment_status: "paid" });
    const res = await cancel(post({ paymentId: "p1" }));
    expect((await res.json()).paid).toBe(true);
    expect(fulfil.fulfilCheckoutSession).toHaveBeenCalled();
    expect(db.payment.updateMany).not.toHaveBeenCalled();
  });

  it("does nothing for someone else's or a finished payment", async () => {
    db.payment.findFirst.mockResolvedValue(null);
    await cancel(post({ paymentId: "p2" }));
    expect(db.payment.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "p2", userId: "u1", status: "PENDING" } }));
    expect(stripe.expire).not.toHaveBeenCalled();
    expect(db.payment.updateMany).not.toHaveBeenCalled();
  });
});

describe("opening-offer packages", () => {
  it("sells 10 credits for 3 JD and keeps old packages for refunds only", async () => {
    const { CREDIT_PACKAGES, findPackage, findAnyPackage, discountPercent, packagesSentence } = await import("@/lib/payments/packages");
    expect(CREDIT_PACKAGES[0]).toMatchObject({ credits: 10, price: 3, currency: "JOD", chargeCurrency: "usd", chargeAmount: 423 });
    expect(findPackage("credits_5")).toBeUndefined();
    expect(findAnyPackage("credits_5")?.credits).toBe(5);
    expect(discountPercent(CREDIT_PACKAGES[0])).toBe(57);
    expect(packagesSentence()).toContain("10 أرصدة بـ 3 د.أ");
  });
});

describe("packages per country", () => {
  it("Saudi members see SAR packages charged in SAR, and can't buy the Jordanian ones", async () => {
    const { packagesFor, findPackage, packagesSentence, formatCharge } = await import("@/lib/payments/packages");
    expect(packagesFor("SA").map((p) => p.price)).toEqual([15, 30, 50]);
    expect(packagesFor("SA")[0]).toMatchObject({ currency: "SAR", chargeCurrency: "sar", chargeAmount: 1500 });
    expect(findPackage("launch_10", "SA")).toBeUndefined();
    expect(findPackage("sa_10", "JO")).toBeUndefined();
    expect(packagesSentence("SA")).toContain("10 أرصدة بـ 15 ر.س");
    expect(formatCharge(packagesFor("SA")[0])).toBe("15 ر.س");
  });

  it("Saudi checkout is refused while Saudi prices are not approved", async () => {
    db.user.findUnique.mockResolvedValue({ country: "SA" });
    const res = await checkout(post({ packageId: "sa_25" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "PURCHASES_DISABLED" });
    expect(stripe.create).not.toHaveBeenCalled();
  });

  it("once Saudi sales are approved and on: charges in SAR and refuses Jordanian packages", async () => {
    gate.selling = true;
    db.user.findUnique.mockResolvedValue({ country: "SA" });
    stripe.create.mockResolvedValue({ id: "cs_sa", client_secret: "sec" });
    const res = await checkout(post({ packageId: "sa_25" }));
    expect(res.status).toBe(200);
    expect(stripe.create.mock.calls[0][0].line_items[0].price_data).toMatchObject({ currency: "sar", unit_amount: 3000 });
    expect(db.payment.create.mock.calls[0][0].data).toMatchObject({ amount: 30, currency: "SAR", planName: "sa_25" });
    const refused = await checkout(post({ packageId: "launch_25" }));
    expect(refused.status).toBe(400);
    gate.selling = null;
  });
});
