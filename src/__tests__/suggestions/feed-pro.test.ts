import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  suggestion: { findMany: vi.fn(), updateMany: vi.fn(), count: vi.fn(), groupBy: vi.fn() },
  user: { findUnique: vi.fn() },
  block: { findMany: vi.fn() },
  like: { findMany: vi.fn() },
  mutualMatch: { findMany: vi.fn() },
  proSubscription: { findMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/intro/match", () => ({ createMutualMatch: vi.fn() }));
const settings = vi.hoisted(() => ({ getCycleFlags: vi.fn() }));
vi.mock("@/lib/settings", () => settings);

import { getSuggestionFeed } from "@/lib/suggestions/feed";

const DAY = 24 * 60 * 60 * 1000;
const person = (id: string) => ({
  id, firstName: id, isVerified: false, gender: "FEMALE", personalityResult: null,
  profile: { city: "عمان", dateOfBirth: new Date("1995-01-01"), prefCity: ["عمان"], dealbreakers: ["city"] },
});
const me = { ...person("me"), gender: "MALE", matchCredits: 3 };
const row = (id: string, other: string, score: number) => ({
  id, compatibilityScore: score, createdAt: new Date(Date.now() - DAY), recipientId: other,
  recipient: person(other), candidate: me,
});

beforeEach(() => {
  vi.clearAllMocks();
  settings.getCycleFlags.mockResolvedValue({ introRequests: true, chat: true, mutualSuggestions: true, creditOnInterest: true });
  db.user.findUnique.mockResolvedValue(me);
  db.block.findMany.mockResolvedValue([]);
  db.suggestion.updateMany.mockResolvedValue({ count: 0 });
  db.suggestion.groupBy.mockResolvedValue([]);
  db.like.findMany.mockResolvedValue([]);
  db.mutualMatch.findMany.mockResolvedValue([]);
  db.suggestion.findMany.mockImplementation(async () => []);
});

const rows = () => [row("s1", "a", 80), row("s2", "b", 75), row("s3", "c", 65)];
const feed = async (pro: string[]) => {
  db.suggestion.findMany.mockReset().mockResolvedValueOnce(rows()).mockResolvedValue([]);
  db.proSubscription.findMany.mockResolvedValue(pro.map((userId) => ({ userId })));
  return getSuggestionFeed("me", "new", 1);
};

describe("feed Pro badge", () => {
  it("marks cards whose other person is Pro, with one lookup for the page", async () => {
    const { items } = await feed(["b"]);
    expect(items.map((i) => [i.id, i.isPro ?? false])).toEqual([["s1", false], ["s2", true], ["s3", false]]);
    expect(db.proSubscription.findMany).toHaveBeenCalledTimes(1);
  });

  it("never changes the order or who is shown", async () => {
    const without = (await feed([])).items.map((i) => i.id);
    const withPro = (await feed(["c", "a", "b"])).items.map((i) => i.id);
    expect(withPro).toEqual(without);
    expect(withPro).toEqual(["s1", "s2", "s3"]);
  });

  it("still returns the feed, without badges, when the Pro lookup fails", async () => {
    db.suggestion.findMany.mockReset().mockResolvedValueOnce(rows()).mockResolvedValue([]);
    db.proSubscription.findMany.mockRejectedValue(new Error("db"));
    const { items } = await getSuggestionFeed("me", "new", 1);
    expect(items).toHaveLength(3);
    expect(items.some((i) => i.isPro)).toBe(false);
  });
});
