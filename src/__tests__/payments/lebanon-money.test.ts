import { describe, it, expect } from "vitest";
import { purchasesAvailable, defaultCountrySettings } from "@/lib/countries/settings";
import {
  PRICES_APPROVED,
  chargeFor,
  findPackage,
  formatPaidAmount,
  formatPaidCharge,
  formatPrice,
  packagesFor,
} from "@/lib/payments/packages";
import { proOffersFor } from "@/lib/pro/plans";
import { proPlansError } from "@/lib/validations/country-settings";
import { checkoutMessage } from "@/lib/payments/checkout-branding";

describe("Lebanon credit packages (USD)", () => {
  const lb = packagesFor("LB");
  it("has the three draft packages, charged in dollars as shown", () => {
    expect(lb.map((p) => p.id)).toEqual(["lb_10", "lb_25", "lb_50"]);
    expect(lb.every((p) => p.chargeCurrency === "usd" && p.currency === "USD" && p.country === "LB")).toBe(true);
    expect(lb.find((p) => p.id === "lb_25")?.chargeAmount).toBe(600);
    expect(formatPrice(lb[0])).toBe("3 $");
  });
  it("is a draft: prices not approved, purchases unavailable", () => {
    expect(PRICES_APPROVED.LB).toBe(false);
    expect(purchasesAvailable({ ...defaultCountrySettings("LB"), code: "LB", active: true, purchasesEnabled: true, pricesApproved: null })).toBe(false);
  });
  it("chargeFor USD is cents with no conversion", () => {
    expect(chargeFor(3, "USD")).toEqual({ chargeCurrency: "usd", chargeAmount: 300 });
    expect(chargeFor(0.5, "USD")).toEqual({ chargeCurrency: "usd", chargeAmount: 50 });
  });
  it("an admin price re-computes the dollar charge", () => {
    expect(findPackage("lb_10", "LB", { lb_10: 4.5 })?.chargeAmount).toBe(450);
  });
  it("past USD payments are shown as dollars, never dinars", () => {
    expect(formatPaidCharge({ amount: 3, currency: "USD" })).toBe("3.00$");
    expect(formatPaidAmount({ amount: 3, currency: "USD" })).toBe("3 $");
    expect(checkoutMessage(lb[0])).not.toContain("تُخصم");
    expect(checkoutMessage(lb[0])).not.toContain("د.أ");
  });
});

describe("Lebanon Pro (USD)", () => {
  it("offers in USD", () => {
    const [o] = proOffersFor("LB", { monthly: { enabled: true, price: 5, credits: 20 } });
    expect(o.currency).toBe("USD");
    expect(o.chargeCurrency).toBe("usd");
    expect(o.chargeAmount).toBe(500);
  });
  it("refuses a price under 0.5 USD", () => {
    const plans = { monthly: { enabled: true, price: 0.4, credits: 20 } };
    expect(proPlansError(plans, "LB")).toMatch(/0\.5 USD/);
    expect(proPlansError({ monthly: { enabled: true, price: 0.5, credits: 20 } }, "LB")).toBeNull();
  });
});

describe("Jordan and Saudi money is unchanged", () => {
  it("Jordan: launch_10 shown in JOD, charged 423 USD cents", () => {
    const p = findPackage("launch_10", "JO")!;
    expect(p).toMatchObject({ price: 3, currency: "JOD", chargeCurrency: "usd", chargeAmount: 423 });
    expect(formatPrice(p)).toBe("3 د.أ");
    expect(formatPaidCharge({ amount: 3, currency: "JOD" })).toBe("4.23$");
    expect(checkoutMessage(p)).toContain("تُخصم");
  });
  it("Saudi: sa_25 shown and charged in SAR", () => {
    const p = findPackage("sa_25", "SA")!;
    expect(p).toMatchObject({ price: 30, currency: "SAR", chargeCurrency: "sar", chargeAmount: 3000 });
    expect(formatPrice(p)).toBe("30 ر.س");
  });
  it("Pro offers keep their currencies", () => {
    const plan = { monthly: { enabled: true, price: 10, credits: 20 } };
    expect(proOffersFor("JO", plan)[0]).toMatchObject({ currency: "JOD", chargeCurrency: "usd", chargeAmount: 1410 });
    expect(proOffersFor("SA", plan)[0]).toMatchObject({ currency: "SAR", chargeCurrency: "sar", chargeAmount: 1000 });
  });
  it("Jordan and Saudi Pro minimums are unchanged", () => {
    expect(proPlansError({ monthly: { enabled: true, price: 0.3, credits: 1 } }, "JO")).toMatch(/0\.36 JOD/);
    expect(proPlansError({ monthly: { enabled: true, price: 1, credits: 1 } }, "SA")).toMatch(/2 SAR/);
  });
});
