import { describe, it, expect, vi, beforeEach } from "vitest";

// The real refund/dispute handlers behind the real webhook route: the Stripe account is shared, so another site's
// charge event must answer 200 even when looking up its invoice fails, never 500 (retries, endpoint disabled)
const db = vi.hoisted(() => ({ payment: { findFirst: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() } }));
const event = vi.hoisted(() => ({ current: null as unknown }));
const invoices = vi.hoisted(() => ({ invoiceIdForPaymentIntent: vi.fn(), paymentIntentForInvoice: vi.fn() }));
const alert = vi.hoisted(() => ({ sendAdminAlert: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/pro/invoice-payments", () => invoices);
vi.mock("@/lib/admin-alert", () => alert);
vi.mock("@/lib/notify", () => ({ notify: vi.fn() }));
vi.mock("@/lib/stripe", () => ({ getStripe: () => ({ webhooks: { constructEvent: () => event.current } }) }));

import { POST } from "@/app/api/payments/webhook/route";

const call = () => POST(new Request("http://x", { method: "POST", body: "{}", headers: { "stripe-signature": "sig" } }));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_WEBHOOK_SECRET = "whsec";
  db.payment.findFirst.mockResolvedValue(null);
  invoices.invoiceIdForPaymentIntent.mockRejectedValue(new Error("Stripe API unavailable"));
});

describe("Stripe webhook: another site's charge", () => {
  it.each([
    ["charge.refunded", { id: "ch_x", payment_intent: "pi_other", refunded: true }],
    ["charge.dispute.created", { id: "dp_x", payment_intent: "pi_other", reason: "fraudulent", amount: 100, currency: "usd" }],
  ])("%s with a failing invoice lookup answers 200 and changes nothing", async (type, object) => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    event.current = { id: "evt_x", type, data: { object } };
    expect((await call()).status).toBe(200);
    expect(db.payment.updateMany).not.toHaveBeenCalled();
    expect(alert.sendAdminAlert).not.toHaveBeenCalled();
    expect(err.mock.calls.some((c) => String(c[0]).includes("treated as not ours"))).toBe(true);
  });
});
