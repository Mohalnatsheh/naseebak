import { describe, expect, it } from "vitest";
import { PRO_PLAN_LABELS, planFromName, proOffersFor, proPlanName, readProPlans, proPlanValues, proDiscountBase } from "@/lib/pro/plans";

describe("readProPlans", () => {
  it("drops invalid entries", () => {
    expect(readProPlans({ weekly: { enabled: true, price: 1.5, credits: 2 }, monthly: { price: -1 } })).toEqual({
      weekly: { enabled: true, price: 1.5, credits: 2 },
    });
  });
  it("returns null for junk", () => {
    expect(readProPlans("x")).toBeNull();
    expect(readProPlans(null)).toBeNull();
    expect(readProPlans([])).toBeNull();
    expect(readProPlans({ weekly: { enabled: true, price: 1, credits: 101 } })).toBeNull();
    expect(readProPlans({ weekly: { enabled: true, price: 1, credits: 1.5 } })).toBeNull();
  });
  it("allows 0 credits", () => {
    expect(readProPlans({ yearly: { enabled: false, price: 10, credits: 0 } })).toEqual({ yearly: { enabled: false, price: 10, credits: 0 } });
  });
});

describe("proOffersFor", () => {
  it("builds a Jordan offer charged in USD cents", () => {
    expect(proOffersFor("JO", { monthly: { enabled: true, price: 4, credits: 8 } })).toEqual([
      { id: "monthly", price: 4, currency: "JOD", chargeCurrency: "usd", chargeAmount: 564, credits: 8, interval: "month" },
    ]);
  });
  it("builds a Saudi offer in halalas", () => {
    const o = proOffersFor("SA", { yearly: { enabled: true, price: 199, credits: 10 } })[0];
    expect(o.chargeAmount).toBe(19900);
    expect(o.interval).toBe("year");
    expect(o.currency).toBe("SAR");
  });
  it("omits disabled plans and keeps order", () => {
    const o = proOffersFor("JO", {
      yearly: { enabled: true, price: 30, credits: 5 },
      monthly: { enabled: false, price: 4, credits: 8 },
      weekly: { enabled: true, price: 1, credits: 1 },
    });
    expect(o.map((x) => x.id)).toEqual(["weekly", "yearly"]);
  });
  it("is empty without plans", () => {
    expect(proOffersFor("JO", null)).toEqual([]);
  });
  it("reads an unknown country as the default one, like toCountry", () => {
    const o = proOffersFor("XX", { weekly: { enabled: true, price: 1, credits: 1 } });
    expect(o.map((x) => [x.id, x.currency])).toEqual([["weekly", "JOD"]]);
    expect(proOffersFor("sa", { weekly: { enabled: true, price: 5, credits: 1 } })[0].currency).toBe("SAR");
  });
  it("skips a price that isn't a finite positive number", () => {
    const plans = {
      weekly: { enabled: true, price: Number.NaN, credits: 1 },
      monthly: { enabled: true, price: Number.POSITIVE_INFINITY, credits: 1 },
      yearly: { enabled: true, price: 0, credits: 1 },
    };
    expect(proOffersFor("JO", plans)).toEqual([]);
  });
});

describe("plan names", () => {
  it("round-trips", () => {
    expect(proPlanName("weekly")).toBe("pro_weekly");
    expect(planFromName("pro_yearly")).toBe("yearly");
    expect(planFromName("launch_10")).toBeNull();
    expect(planFromName(null)).toBeNull();
    expect(PRO_PLAN_LABELS.monthly).toBe("شهري");
  });
});

describe("proPlanValues (the Pro page comparison)", () => {
  const o = (id: "weekly" | "monthly" | "yearly", price: number) => ({ id, price });

  it("Jordan 3 / 10 / 89: a month's cost of each plan and the discount against paying weekly for a year, rounded down", () => {
    const v = proPlanValues([o("weekly", 3), o("monthly", 10), o("yearly", 89)]);
    expect(v.weekly).toEqual({ perMonth: 13, discountPercent: null });
    expect(v.monthly).toEqual({ perMonth: 10, discountPercent: 23 }); // 120 vs 156 a year
    expect(v.yearly).toEqual({ perMonth: 7.42, discountPercent: 42 }); // 89 vs 156: 42.9, never overstated
    expect(proDiscountBase([o("weekly", 3), o("monthly", 10)])).toBe("weekly");
  });

  it("Saudi 6 / 20 / 178: the same percentages", () => {
    const v = proPlanValues([o("weekly", 6), o("monthly", 20), o("yearly", 178)]);
    expect(v.monthly?.discountPercent).toBe(23);
    expect(v.yearly).toEqual({ perMonth: 14.83, discountPercent: 42 });
  });

  it("without a weekly plan the discount is against monthly; no discount when a longer plan costs as much or more", () => {
    const v = proPlanValues([o("monthly", 10), o("yearly", 100)]);
    expect(proDiscountBase([o("monthly", 10), o("yearly", 100)])).toBe("monthly");
    expect(v.monthly?.discountPercent).toBeNull();
    expect(v.yearly?.discountPercent).toBe(16); // 100 vs 120
    expect(proPlanValues([o("weekly", 2), o("monthly", 9)]).monthly?.discountPercent).toBeNull(); // 108 vs 104
    expect(proPlanValues([o("monthly", 10)]).monthly).toEqual({ perMonth: 10, discountPercent: null });
  });
});
