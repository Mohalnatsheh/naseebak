import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  payment: { create: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
}));
const stripe = vi.hoisted(() => ({ create: vi.fn(), expire: vi.fn() }));
const mocks = vi.hoisted(() => ({
  getProEnabled: vi.fn(),
  getCountrySettings: vi.fn(),
  purchasesAvailable: vi.fn(),
  currentProSubscription: vi.fn(),
  paymentsMockEnabled: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/stripe", () => ({ getStripe: () => ({ checkout: { sessions: { create: stripe.create, expire: stripe.expire } } }) }));
vi.mock("@/lib/settings", () => ({ getProEnabled: mocks.getProEnabled }));
vi.mock("@/lib/countries/settings", () => ({ getCountrySettings: mocks.getCountrySettings, purchasesAvailable: mocks.purchasesAvailable }));
vi.mock("@/lib/pro/status", () => ({ currentProSubscription: mocks.currentProSubscription }));
vi.mock("@/lib/payments/mock", () => ({ MOCK_SESSION_PREFIX: "mock_", paymentsMockEnabled: mocks.paymentsMockEnabled }));

vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ session: { user: { id: "u1" } } }) }));
vi.mock("@/lib/mobile-config", () => ({ appPaymentsFor: async () => true }));

import { ProError, startProCheckout } from "@/lib/pro/checkout";
import { POST as checkoutRoute } from "@/app/api/pro/checkout/route";
import { CHECKOUT_TTL_MS } from "@/lib/payments/packages";

const plans = { monthly: { enabled: true, price: 4, credits: 8 } };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getProEnabled.mockResolvedValue(true);
  mocks.purchasesAvailable.mockReturnValue(true);
  mocks.getCountrySettings.mockResolvedValue({ proPlans: plans });
  mocks.currentProSubscription.mockResolvedValue(null);
  mocks.paymentsMockEnabled.mockReturnValue(false);
  db.user.findUnique.mockResolvedValue({ country: "JO" });
  db.payment.create.mockResolvedValue({});
  db.payment.findMany.mockResolvedValue([]);
  db.payment.updateMany.mockResolvedValue({ count: 1 });
  stripe.expire.mockResolvedValue({});
  stripe.create.mockResolvedValue({ id: "cs_1", url: "https://stripe.test/c" });
});

async function code(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(ProError);
    return (e as ProError).code;
  }
  return null;
}

describe("startProCheckout", () => {
  it("refuses while the switch is off", async () => {
    mocks.getProEnabled.mockResolvedValue(false);
    expect(await code(startProCheckout("u1", "monthly"))).toBe("DISABLED");
    expect(stripe.create).not.toHaveBeenCalled();
  });

  it("refuses when the country isn't selling (Saudi prices not approved)", async () => {
    db.user.findUnique.mockResolvedValue({ country: "SA" });
    mocks.purchasesAvailable.mockReturnValue(false);
    expect(await code(startProCheckout("u1", "monthly"))).toBe("UNAVAILABLE");
  });

  it("refuses an active subscription", async () => {
    mocks.currentProSubscription.mockResolvedValue({ id: "s1", cancelAtPeriodEnd: false });
    expect(await code(startProCheckout("u1", "monthly"))).toBe("ALREADY_PRO");
  });

  it("refuses a cancelled subscription that hasn't ended yet", async () => {
    mocks.currentProSubscription.mockResolvedValue({ id: "s1", cancelAtPeriodEnd: true });
    expect(await code(startProCheckout("u1", "monthly"))).toBe("ALREADY_PRO");
  });

  it("refuses a plan that isn't on sale", async () => {
    expect(await code(startProCheckout("u1", "weekly"))).toBe("UNKNOWN_PLAN");
    expect(await code(startProCheckout("u1", "bogus" as never))).toBe("UNKNOWN_PLAN");
  });

  it("creates a subscription session and a pending payment", async () => {
    const r = await startProCheckout("u1", "monthly");
    expect(r.url).toBe("https://stripe.test/c");
    const arg = stripe.create.mock.calls[0][0];
    expect(arg.mode).toBe("subscription");
    expect(arg.line_items[0].price_data.recurring.interval).toBe("month");
    expect(arg.line_items[0].price_data.unit_amount).toBe(564);
    expect(arg.line_items[0].price_data.currency).toBe("usd");
    expect(arg.metadata).toMatchObject({ app: "naseebak", kind: "pro", userId: "u1", plan: "monthly", country: "JO", paymentId: r.paymentId });
    // The offer's credits travel with the checkout (a plan changed in the checkout window never alters what was bought)
    expect(arg.metadata.credits).toBe("8");
    expect(arg.subscription_data.metadata).toEqual(arg.metadata);
    expect(arg.success_url).toContain("/dashboard/pro?pro=success");
    expect(arg.cancel_url).toContain("/dashboard/pro?pro=cancel");
    expect(db.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: r.paymentId, userId: "u1", type: "SUBSCRIPTION", planName: "pro_monthly", amount: 4, currency: "JOD",
        status: "PENDING", stripeSessionId: "cs_1",
      }),
    });
  });

  it("with the mock on: no Stripe call, a mock_pro_ session id", async () => {
    mocks.paymentsMockEnabled.mockReturnValue(true);
    const r = await startProCheckout("u1", "monthly");
    expect(stripe.create).not.toHaveBeenCalled();
    expect(r.url).toBe(`/dashboard/pro?mockPro=${r.paymentId}`);
    expect(db.payment.create.mock.calls[0][0].data.stripeSessionId).toMatch(/^mock_pro_/);
  });

  it("the session expires after CHECKOUT_TTL_MS (not Stripe's 24 h default)", async () => {
    const before = Date.now();
    await startProCheckout("u1", "monthly");
    const at = stripe.create.mock.calls[0][0].expires_at as number;
    expect(at * 1000).toBeGreaterThanOrEqual(before + CHECKOUT_TTL_MS - 1000);
    expect(at * 1000).toBeLessThanOrEqual(Date.now() + CHECKOUT_TTL_MS);
    // Stripe refuses less than 30 minutes
    expect(CHECKOUT_TTL_MS).toBeGreaterThanOrEqual(30 * 60 * 1000);
  });

  it("expires the member's other open Pro checkouts first (best effort) and closes their rows", async () => {
    db.payment.findMany.mockResolvedValue([
      { id: "old1", stripeSessionId: "cs_old1" },
      { id: "old2", stripeSessionId: "cs_old2" },
      { id: "old3", stripeSessionId: "mock_pro_x" },
    ]);
    // cs_old2 is already expired (or was paid meanwhile): Stripe refuses, which is ignored
    stripe.expire.mockImplementation(async (id: string) => {
      if (id === "cs_old2") throw Object.assign(new Error("Only open sessions can be expired"), { code: "resource_missing" });
      return {};
    });
    const r = await startProCheckout("u1", "monthly");
    expect(r.url).toBe("https://stripe.test/c");
    const where = db.payment.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ userId: "u1", status: "PENDING", planName: { in: ["pro_weekly", "pro_monthly", "pro_yearly"] }, stripeSessionId: { not: null } });
    expect(where.createdAt.gte).toBeInstanceOf(Date);
    expect(stripe.expire).toHaveBeenCalledWith("cs_old1");
    expect(stripe.expire).toHaveBeenCalledWith("cs_old2");
    // A mock session is never sent to Stripe
    expect(stripe.expire).not.toHaveBeenCalledWith("mock_pro_x");
    const closed = db.payment.updateMany.mock.calls.map((c) => c[0]);
    expect(closed).toEqual([
      { where: { id: "old1", status: "PENDING" }, data: { status: "FAILED", failureReason: "CANCELLED" } },
      { where: { id: "old3", status: "PENDING" }, data: { status: "FAILED", failureReason: "CANCELLED" } },
    ]);
    // Expired before the new session is made
    expect(stripe.expire.mock.invocationCallOrder[0]).toBeLessThan(stripe.create.mock.invocationCallOrder[0]);
  });

  it("a failed lookup of old sessions never blocks the new checkout", async () => {
    db.payment.findMany.mockRejectedValue(new Error("db down"));
    const r = await startProCheckout("u1", "monthly");
    expect(r.url).toBe("https://stripe.test/c");
  });
});

describe("POST /api/pro/checkout", () => {
  const post = (body: unknown) => checkoutRoute(new Request("http://x/api/pro/checkout", { method: "POST", body: JSON.stringify(body) }));

  it("an unknown plan is refused with its code, without a cast-only check", async () => {
    const res = await post({ plan: "daily" });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("UNKNOWN_PLAN");
  });

  it("a Stripe failure answers 502 with a code the app can read", async () => {
    stripe.create.mockRejectedValue(Object.assign(new Error("boom"), { type: "StripeAPIError" }));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post({ plan: "monthly" });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "تعذّر بدء عملية الدفع الآن. حاول مرة أخرى بعد قليل.", code: "CHECKOUT_FAILED" });
    spy.mockRestore();
  });
});
