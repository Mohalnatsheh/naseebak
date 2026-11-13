import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  payment: { create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
  user: { findUnique: vi.fn() },
}));
const stripe = vi.hoisted(() => ({ create: vi.fn() }));
const fulfil = vi.hoisted(() => ({ fulfilCheckoutSession: vi.fn(), CHECKOUT_APP: "naseebak" }));
const offer = vi.hoisted(() => ({ percent: 0 }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ session: { user: { id: "u1" } } }), currentSession: async () => ({ user: { id: "u1" } }) }));
vi.mock("@/lib/payments/fulfil", () => fulfil);
vi.mock("@/lib/settings", async (orig) => {
  const real = await orig<typeof import("@/lib/settings")>();
  return {
    ...real,
    jodChargingFor: async () => false,
    activeOfferFor: async (selling: boolean) =>
      selling && offer.percent > 0 ? { percent: offer.percent, title: "عروض الجمعة البيضاء", endsAt: "2026-11-30T21:59:00.000Z" } : null,
  };
});
vi.mock("@/lib/stripe", () => ({ getStripe: () => ({ checkout: { sessions: { create: stripe.create } } }) }));

import { POST as checkout } from "@/app/api/payments/checkout/route";
import { POST as mockPay } from "@/app/api/dev/mock-checkout/[id]/route";

const post = (body: unknown) => new Request("http://x", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_SECRET_KEY = "sk_test";
  delete process.env.PAYMENTS_MOCK;
  db.user.findUnique.mockResolvedValue({ country: "JO" });
  stripe.create.mockResolvedValue({ id: "cs_1", client_secret: "sec" });
  offer.percent = 0;
});

describe("sale offer at checkout", () => {
  it("adds the bonus to the metadata and the row while the offer is open", async () => {
    offer.percent = 50;
    await checkout(post({ packageId: "launch_10" }));
    expect(stripe.create.mock.calls[0][0].metadata).toMatchObject({ credits: "15", bonusCredits: "5", packageId: "launch_10" });
    const row = db.payment.create.mock.calls[0][0].data;
    expect(row.bonusCredits).toBe(5);
    expect(row.description).toContain("15");
    // What the member reads while paying says the gift too
    const args = stripe.create.mock.calls[0][0];
    expect(args.line_items[0].price_data.product_data.name).toBe("نصيبك · 10 أرصدة + 5 هدية");
    expect(args.payment_intent_data.description).toBe("نصيبك · 10 أرصدة + 5 هدية");
  });

  it("changes nothing while the offer is off", async () => {
    await checkout(post({ packageId: "launch_10" }));
    const meta = stripe.create.mock.calls[0][0].metadata;
    expect(meta.credits).toBe("10");
    expect(meta.bonusCredits).toBeUndefined();
    expect(db.payment.create.mock.calls[0][0].data.bonusCredits).toBeNull();
  });
});

describe("mock checkout (local) with a bonus", () => {
  it("pays the package plus the bonus recorded on the row", async () => {
    db.payment.findFirst.mockResolvedValue({ id: "p1", status: "PENDING", stripeSessionId: "mock_cs_p1", planName: "launch_10", amount: 3, currency: "JOD", createdAt: new Date(), bonusCredits: 5 });
    fulfil.fulfilCheckoutSession.mockResolvedValue("fulfilled");
    process.env.PAYMENTS_MOCK = "true";
    const res = await mockPay(post({ outcome: "paid" }), { params: Promise.resolve({ id: "p1" }) });
    if (res.status !== 200) throw new Error(`mock route ${res.status}: ${await res.text()}`);
    expect(fulfil.fulfilCheckoutSession.mock.calls[0][0].metadata).toMatchObject({ credits: "15", bonusCredits: "5" });
  });
});

describe("Arabic payment page intent with a bonus", () => {
  it("puts package + bonus in the intent metadata", async () => {
    const { paymentIntentParams } = await import("@/lib/payments/intent");
    const pkg = { id: "launch_10", name: "10 أرصدة", credits: 10, chargeCurrency: "usd" as const, chargeAmount: 423 };
    expect(paymentIntentParams(pkg, { paymentId: "p1", userId: "u1" }, 5).metadata).toMatchObject({ credits: "15", bonusCredits: "5" });
    const plain = paymentIntentParams(pkg, { paymentId: "p1", userId: "u1" }).metadata!;
    expect(plain.credits).toBe("10");
    expect(plain.bonusCredits).toBeUndefined();
  });
});
