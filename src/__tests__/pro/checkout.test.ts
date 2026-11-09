import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  payment: { create: vi.fn() },
}));
const stripe = vi.hoisted(() => ({ create: vi.fn() }));
const mocks = vi.hoisted(() => ({
  getProEnabled: vi.fn(),
  getCountrySettings: vi.fn(),
  purchasesAvailable: vi.fn(),
  currentProSubscription: vi.fn(),
  paymentsMockEnabled: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/stripe", () => ({ getStripe: () => ({ checkout: { sessions: { create: stripe.create } } }) }));
vi.mock("@/lib/settings", () => ({ getProEnabled: mocks.getProEnabled }));
vi.mock("@/lib/countries/settings", () => ({ getCountrySettings: mocks.getCountrySettings, purchasesAvailable: mocks.purchasesAvailable }));
vi.mock("@/lib/pro/status", () => ({ currentProSubscription: mocks.currentProSubscription }));
vi.mock("@/lib/payments/mock", () => ({ MOCK_SESSION_PREFIX: "mock_", paymentsMockEnabled: mocks.paymentsMockEnabled }));

import { ProError, startProCheckout } from "@/lib/pro/checkout";

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
    expect(arg.subscription_data.metadata).toEqual(arg.metadata);
    expect(arg.success_url).toContain("/dashboard/payments?pro=success");
    expect(arg.cancel_url).toContain("/dashboard/payments?pro=cancel");
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
    expect(r.url).toBe(`/dashboard/payments?mockPro=${r.paymentId}`);
    expect(db.payment.create.mock.calls[0][0].data.stripeSessionId).toMatch(/^mock_pro_/);
  });
});
