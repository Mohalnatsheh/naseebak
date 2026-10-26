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
    expect(db.payment.updateMany).toHaveBeenCalledWith({ where: { id: "p1", status: "PENDING" }, data: { status: "FAILED" } });
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

  it("checkout charges a Saudi member in SAR and refuses Jordanian packages", async () => {
    db.user.findUnique.mockResolvedValue({ country: "SA" });
    stripe.create.mockResolvedValue({ id: "cs_sa", client_secret: "sec" });
    const res = await checkout(post({ packageId: "sa_25" }));
    expect(res.status).toBe(200);
    expect(stripe.create.mock.calls[0][0].line_items[0].price_data).toMatchObject({ currency: "sar", unit_amount: 3000 });
    expect(db.payment.create.mock.calls[0][0].data).toMatchObject({ amount: 30, currency: "SAR", planName: "sa_25" });
    const refused = await checkout(post({ packageId: "launch_25" }));
    expect(refused.status).toBe(400);
  });
});
