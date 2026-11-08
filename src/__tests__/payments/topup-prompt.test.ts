import { describe, it, expect, vi, beforeEach } from "vitest";

const flags = vi.hoisted(() => ({ creditOnInterest: true, selling: true, freeInterestReply: false }));
vi.mock("@/lib/settings", () => ({ getCycleFlags: async () => ({ creditOnInterest: flags.creditOnInterest, freeInterestReply: flags.creditOnInterest && flags.freeInterestReply }) }));
vi.mock("@/lib/countries/settings", () => ({ getCountrySettings: async () => ({}), purchasesAvailable: () => flags.selling }));

import { replyNoticeLine, smallestPackage, topUpLine } from "@/lib/payments/topup-prompt";

const member = { matchCredits: 0, country: "JO", gender: "MALE", phone: "962791234567" };

beforeEach(() => {
  flags.creditOnInterest = true;
  flags.selling = true;
  flags.freeInterestReply = false;
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

describe("replyNoticeLine (the line under «شخص أبدى اهتمامه بك» / «شخص ينتظر ردّك»)", () => {
  it("switch off: the 0-credit top-up line, nothing with credits", async () => {
    expect(await replyNoticeLine(member)).toContain("اشحن");
    expect(await replyNoticeLine({ ...member, matchCredits: 2 })).toBe("");
  });

  it("free reply on: says the reply is free to everyone and never asks to recharge", async () => {
    flags.freeInterestReply = true;
    for (const m of [member, { ...member, gender: "FEMALE" }, { ...member, matchCredits: 4 }]) {
      const line = await replyNoticeLine(m);
      expect(line).toBe(" الرد بـ«مهتم» مجاني.");
      expect(line).not.toContain("اشح");
    }
  });
});
