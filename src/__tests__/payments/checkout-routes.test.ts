import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  payment: { create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
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
});

describe("POST /api/payments/checkout", () => {
  it("writes the PENDING row only after Stripe returns a session, with its id", async () => {
    stripe.create.mockResolvedValue({ id: "cs_1", client_secret: "sec" });
    const res = await checkout(post({ packageId: "credits_5" }));
    expect(res.status).toBe(200);
    const args = stripe.create.mock.calls[0][0];
    expect(args.line_items[0].price_data).toMatchObject({ currency: "usd", unit_amount: 564 });
    expect(args.expires_at).toBeGreaterThan(Date.now() / 1000 + 30 * 60);
    const row = db.payment.create.mock.calls[0][0].data;
    expect(row).toMatchObject({ status: "PENDING", stripeSessionId: "cs_1", amount: 4, planName: "credits_5", userId: "u1" });
    expect(row.id).toBe(args.metadata.paymentId);
  });

  it("leaves no row behind when Stripe fails", async () => {
    stripe.create.mockRejectedValue(Object.assign(new Error("No such key"), { type: "StripeAuthenticationError" }));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await checkout(post({ packageId: "credits_5" }));
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
