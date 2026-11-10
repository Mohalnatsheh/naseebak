import { describe, it, expect, vi } from "vitest";

const loadStripe = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock("@stripe/stripe-js/pure", () => ({ loadStripe }));

describe("getStripe (QA WA-18 / WEB-PAY-18)", () => {
  it("never loads Stripe at import, and answers null without a publishable key", async () => {
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "");
    const { getStripe } = await import("@/lib/stripe-client");
    expect(loadStripe).not.toHaveBeenCalled();
    expect(getStripe()).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "pk_test_x");
    const a = getStripe();
    expect(getStripe()).toBe(a);
    expect(loadStripe).toHaveBeenCalledTimes(1);
    vi.unstubAllEnvs();
  });
});

describe("payment wording (QA WEB-PAY-06, 08)", () => {
  it("pack descriptions use the right Arabic count", async () => {
    const { packPurchaseDescription } = await import("@/lib/payments/packages");
    expect(packPurchaseDescription(25)).toBe("شراء 25 رصيداً في نصيبك");
    expect(packPurchaseDescription(10)).toBe("شراء 10 أرصدة في نصيبك");
    expect(packPurchaseDescription(1)).toBe("شراء رصيد واحد في نصيبك");
  });
  it("a refund names the price as shown and the charge when it differs", async () => {
    const { formatPaidAmount } = await import("@/lib/payments/packages");
    expect(formatPaidAmount({ amount: 35, currency: "JOD" })).toBe("35 د.أ (49.35$)");
    expect(formatPaidAmount({ amount: 15, currency: "SAR" })).toBe("15 ر.س");
  });
});
