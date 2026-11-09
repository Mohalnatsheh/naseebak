import { describe, expect, it } from "vitest";
import { PRO_PLAN_LABELS, planFromName, proOffersFor, proPlanName, readProPlans } from "@/lib/pro/plans";

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
  it("is empty without plans or country", () => {
    expect(proOffersFor("JO", null)).toEqual([]);
    expect(proOffersFor("XX", { weekly: { enabled: true, price: 1, credits: 1 } })).toEqual([]);
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
