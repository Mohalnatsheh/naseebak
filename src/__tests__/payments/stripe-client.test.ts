import { describe, it, expect, vi } from "vitest";

const loadStripe = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock("@stripe/stripe-js", () => ({ loadStripe }));

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
