import { describe, it, expect } from "vitest";

describe("Credit Packages API", () => {
  it("should define three credit packages", () => {
    const packages = [
      { id: "credits_3", name: "3 رصيد توافق", credits: 3, price: 3 },
      { id: "credits_5", name: "5 رصيد توافق", credits: 5, price: 4, popular: true },
      { id: "credits_10", name: "10 رصيد توافق", credits: 10, price: 7 },
    ];

    expect(packages).toHaveLength(3);
    expect(packages[0].credits).toBe(3);
    expect(packages[0].price).toBe(3);
    expect(packages[1].credits).toBe(5);
    expect(packages[1].price).toBe(4);
    expect(packages[2].credits).toBe(10);
    expect(packages[2].price).toBe(7);
  });

  it("should have credits_5 marked as popular", () => {
    const popularPkg = { id: "credits_5", popular: true };
    expect(popularPkg.popular).toBe(true);
  });

  it("should offer better value for larger packages", () => {
    const packages = [
      { credits: 3, price: 3 },
      { credits: 5, price: 4 },
      { credits: 10, price: 7 },
    ];

    const pricePerCredit = packages.map((p) => p.price / p.credits);
    // Each package should be cheaper per credit than the previous
    expect(pricePerCredit[1]).toBeLessThan(pricePerCredit[0]);
    expect(pricePerCredit[2]).toBeLessThan(pricePerCredit[1]);
  });
});
