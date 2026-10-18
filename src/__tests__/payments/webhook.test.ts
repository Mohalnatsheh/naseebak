import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({ payment: { updateMany: vi.fn() } }));
const refund = vi.hoisted(() => ({ handleChargeRefunded: vi.fn(), flagDispute: vi.fn() }));
const event = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/payments/refund", () => refund);
vi.mock("@/lib/payments/fulfil", () => ({
  fulfilCheckoutSession: vi.fn(),
  isOurSession: (s: { metadata?: { app?: string } }) => s.metadata?.app === "naseebak",
}));
vi.mock("@/lib/stripe", () => ({ getStripe: () => ({ webhooks: { constructEvent: () => event.current } }) }));

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
    expect(db.payment.updateMany).toHaveBeenCalledWith({ where: { id: "p1", status: "PENDING" }, data: { status: "FAILED" } });
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
});
