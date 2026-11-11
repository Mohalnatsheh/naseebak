import { describe, expect, it } from "vitest";
import {
  chargeFor,
  findPackage,
  formatCharge,
  formatPaidAmount,
  formatPaidCharge,
  fromMinor,
  minorUnits,
  packagesFor,
} from "@/lib/payments/packages";
import { proOffersFor } from "@/lib/pro/plans";
import { refundAmountText } from "@/lib/admin/refund-preview";

describe("JOD charging (switch jod_charging)", () => {
  it("charges Jordan in USD at 1.41 without the switch (today)", () => {
    expect(chargeFor(3, "JOD")).toEqual({ chargeCurrency: "usd", chargeAmount: 423 });
  });

  it("charges Jordan the dinar price in fils with the switch", () => {
    expect(chargeFor(3, "JOD", true)).toEqual({ chargeCurrency: "jod", chargeAmount: 3000 });
    expect(chargeFor(2.99, "JOD", true).chargeAmount).toBe(2990);
  });

  it("never changes Saudi or Lebanese charges", () => {
    expect(chargeFor(15, "SAR", true)).toEqual({ chargeCurrency: "sar", chargeAmount: 1500 });
    expect(chargeFor(3, "USD", true)).toEqual({ chargeCurrency: "usd", chargeAmount: 300 });
    expect(packagesFor("SA", null, true)).toEqual(packagesFor("SA"));
    expect(packagesFor("LB", null, true)).toEqual(packagesFor("LB"));
  });

  it("charges every Jordanian package in JOD with the switch, admin prices too", () => {
    for (const p of packagesFor("JO", null, true)) expect(p).toMatchObject({ chargeCurrency: "jod", chargeAmount: p.price * 1000 });
    expect(findPackage("launch_10", "JO", null, true)).toMatchObject({ chargeCurrency: "jod", chargeAmount: 3000 });
    expect(findPackage("launch_10", "JO", { launch_10: 4 }, true)).toMatchObject({ price: 4, chargeCurrency: "jod", chargeAmount: 4000 });
    expect(findPackage("launch_10", "JO", null)).toMatchObject({ chargeCurrency: "usd", chargeAmount: 423 });
  });

  it("charges Jordanian Pro offers in JOD with the switch", () => {
    const plans = { monthly: { enabled: true, price: 10, credits: 20 } };
    expect(proOffersFor("JO", plans, true)[0]).toMatchObject({ chargeCurrency: "jod", chargeAmount: 10000 });
    expect(proOffersFor("JO", plans)[0]).toMatchObject({ chargeCurrency: "usd", chargeAmount: 1410 });
    expect(proOffersFor("SA", plans, true)[0]).toMatchObject({ chargeCurrency: "sar", chargeAmount: 1000 });
  });

  it("formats a JOD charge in dinars", () => {
    expect(formatCharge({ chargeCurrency: "jod", chargeAmount: 3000 })).toBe("3 د.أ");
    expect(formatCharge({ chargeCurrency: "jod", chargeAmount: 2990 })).toBe("2.99 د.أ");
  });

  it("shows a past payment by the currency it was really charged in; old rows as today", () => {
    expect(formatPaidAmount({ amount: "6", currency: "JOD" })).toBe("6 د.أ (8.46$)");
    expect(formatPaidAmount({ amount: "6", currency: "JOD", chargeCurrency: null })).toBe("6 د.أ (8.46$)");
    expect(formatPaidAmount({ amount: "6", currency: "JOD", chargeCurrency: "usd" })).toBe("6 د.أ (8.46$)");
    expect(formatPaidAmount({ amount: "6", currency: "JOD", chargeCurrency: "jod" })).toBe("6 د.أ");
    expect(formatPaidCharge({ amount: "6", currency: "JOD", chargeCurrency: "jod" })).toBe("6 د.أ");
    expect(formatPaidAmount({ amount: "15", currency: "SAR", chargeCurrency: "sar" })).toBe("15 ر.س");
  });

  it("admin refund preview: dollars only for a dollar charge", () => {
    expect(refundAmountText({ amount: "6", currency: "JOD" })).toBe("6.00 JOD (8.46 USD charged)");
    expect(refundAmountText({ amount: "6", currency: "JOD", chargeCurrency: "usd" })).toBe("6.00 JOD (8.46 USD charged)");
    expect(refundAmountText({ amount: "6", currency: "JOD", chargeCurrency: "jod" })).toBe("6.00 JOD");
  });

  it("knows minor units per currency", () => {
    expect(minorUnits("jod")).toBe(1000);
    expect(minorUnits("JOD")).toBe(1000);
    expect(minorUnits("sar")).toBe(100);
    expect(fromMinor(3000, "jod")).toBe(3);
    expect(fromMinor(423, "USD")).toBe(4.23);
  });
});
