import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  user: { findMany: vi.fn() },
  suggestion: { findMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/test-accounts", () => ({ isTestPhone: (p: string) => p === "test", testPhones: () => ["test"] }));
vi.mock("@/lib/admin/members-suggest-reason", () => ({ memberSuggestStatus: vi.fn() }));

import { stuckMembers, supplyGaps } from "@/lib/admin/insights";

const now = new Date("2026-11-05T12:00:00Z");
const person = (id: string, over: object = {}) => ({
  id, firstName: id, lastName: "", phone: id, gender: "FEMALE", role: "USER", status: "VERIFIED", isDeactivated: false, matchCredits: 0, lastActiveAt: now, ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("stuckMembers: 0 credits with a «مهتم» waiting", () => {
  it("counts the side that hasn't answered, once per member; leaves out credits, test phones and partners who left", async () => {
    const card = (recipient: object, candidate: object, recipientDecision: string | null = null, expiresAt = new Date("2026-11-08T00:00:00Z")) => ({ recipient, candidate, recipientDecision, expiresAt });
    db.suggestion.findMany.mockResolvedValue([
      card(person("w1"), person("m1")),
      card(person("w1"), person("m2"), null, new Date("2026-11-07T00:00:00Z")),
      card(person("w2"), person("m3", { gender: "MALE" }), "INTERESTED"), // m3 owes the answer
      card(person("w3", { matchCredits: 2 }), person("m1")),
      card(person("test"), person("m1")),
      card(person("w4"), person("m4", { isDeactivated: true })),
    ]);
    db.user.findMany.mockResolvedValue([]);
    const { zeroCredit } = await stuckMembers("JO", now);
    expect(zeroCredit).toMatchObject({ total: 2, held: 3, women: 1, men: 1 });
    expect(zeroCredit.rows[0]).toMatchObject({ id: "w1", waiting: 2, soonest: new Date("2026-11-07T00:00:00Z") });
  });
});

describe("supplyGaps", () => {
  it("groups men and women by city and age; test phones don't count", async () => {
    const row = (gender: string, city: string | null, birth: string, phone = "x") => ({ gender, phone, profile: { city, dateOfBirth: new Date(birth) } });
    db.user.findMany.mockResolvedValue([
      row("MALE", "عمّان", "2000-11-05"), // 26 today
      row("MALE", "عمّان", "2001-11-06"), // 24, birthday tomorrow
      row("FEMALE", "عمّان", "1990-01-01"),
      row("FEMALE", null, "1980-01-01"),
      row("MALE", "إربد", "2000-01-01", "test"),
    ]);
    const r = await supplyGaps("JO", now);
    expect(r).toMatchObject({ total: 4, men: 2, women: 2 });
    expect(r.cities).toEqual([{ city: "عمّان", men: 2, women: 1 }, { city: "Not given", men: 0, women: 1 }]);
    expect(r.ages).toEqual([
      { age: "18–24", men: 1, women: 0 },
      { age: "25–29", men: 1, women: 0 },
      { age: "35–39", men: 0, women: 1 },
      { age: "40+", men: 0, women: 1 },
    ]);
  });
});
