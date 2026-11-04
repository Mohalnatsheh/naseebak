import { describe, it, expect, vi } from "vitest";

const stripe = vi.hoisted(() => ({ paymentIntents: { retrieve: vi.fn() } }));
vi.mock("@/lib/stripe", () => ({ getStripe: () => stripe }));

import { declineOf, failureReasonFor } from "@/lib/payments/failure";

describe("payment failure reasons", () => {
  it("a refused card gives DECLINED with Stripe's code", () => {
    expect(declineOf({ last_payment_error: { decline_code: "insufficient_funds", code: "card_declined" } } as never)).toBe("DECLINED:insufficient_funds");
    expect(declineOf({ last_payment_error: { code: "expired_card" } } as never)).toBe("DECLINED:expired_card");
    expect(declineOf({ last_payment_error: null } as never)).toBeNull();
  });

  it("no card tried: how the checkout ended", async () => {
    expect(await failureReasonFor({ payment_intent: null } as never, "CANCELLED")).toBe("CANCELLED");
    expect(await failureReasonFor(null, "EXPIRED")).toBe("EXPIRED");
  });

  it("reads the payment from Stripe; a refusal wins; Stripe down falls back", async () => {
    stripe.paymentIntents.retrieve.mockResolvedValueOnce({ last_payment_error: { decline_code: "do_not_honor" } });
    expect(await failureReasonFor({ payment_intent: "pi_1" } as never, "CANCELLED")).toBe("DECLINED:do_not_honor");
    stripe.paymentIntents.retrieve.mockRejectedValueOnce(new Error("down"));
    expect(await failureReasonFor({ payment_intent: "pi_2" } as never, "EXPIRED")).toBe("EXPIRED");
  });
});
