import { describe, it, expect, vi, beforeEach } from "vitest";

const flags = vi.hoisted(() => ({ creditOnInterest: true, selling: true }));
vi.mock("@/lib/settings", () => ({ getCycleFlags: async () => ({ creditOnInterest: flags.creditOnInterest }) }));
vi.mock("@/lib/countries/settings", () => ({ getCountrySettings: async () => ({}), purchasesAvailable: () => flags.selling }));

import { smallestPackage, topUpLine } from "@/lib/payments/topup-prompt";

const member = { matchCredits: 0, country: "JO", gender: "MALE", phone: "962791234567" };

beforeEach(() => {
  flags.creditOnInterest = true;
  flags.selling = true;
});

describe("topUpLine (0 credits, someone's «مهتم» waiting)", () => {
  it("names the smallest package and its price, gendered", async () => {
    const pkg = smallestPackage("JO");
    const line = await topUpLine(member);
    expect(line).toContain("رصيدك صفر: اشحن");
    expect(line).toContain(pkg.name);
    expect(await topUpLine({ ...member, gender: "FEMALE" })).toContain("اشحني");
  });

  it("nothing when: credits left, credit-on-interest off, country not selling", async () => {
    expect(await topUpLine({ ...member, matchCredits: 2 })).toBeNull();
    flags.creditOnInterest = false;
    expect(await topUpLine(member)).toBeNull();
    flags.creditOnInterest = true;
    flags.selling = false;
    expect(await topUpLine(member)).toBeNull();
  });
});
