import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  suggestion: { findMany: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
  user: { findUnique: vi.fn() },
  block: { findMany: vi.fn() },
  like: { findMany: vi.fn() },
  mutualMatch: { findMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/intro/match", () => ({ createMutualMatch: vi.fn() }));
const settings = vi.hoisted(() => ({ getCycleFlags: vi.fn() }));
vi.mock("@/lib/settings", () => settings);

import { getSuggestionFeed, type OpenFeedItem } from "@/lib/suggestions/feed";

const DAY = 24 * 60 * 60 * 1000;
const person = (id: string, gender: "MALE" | "FEMALE", profile: object = {}) => ({
  id, firstName: id, isVerified: false, gender, personalityResult: null,
  profile: { city: "عمان", dateOfBirth: new Date("1995-01-01"), prefCity: ["عمان"], dealbreakers: ["city"], ...profile },
});
const me = { ...person("me", "MALE"), matchCredits: 3 };
const mutualRow = (id: string, other = person("f1", "FEMALE"), iAmRecipient = false) => ({
  id, compatibilityScore: 70, createdAt: new Date(Date.now() - DAY),
  recipientId: iAmRecipient ? "me" : other.id,
  recipient: iAmRecipient ? me : other,
  candidate: iAmRecipient ? other : me,
});

beforeEach(() => {
  vi.clearAllMocks();
  settings.getCycleFlags.mockResolvedValue({ introRequests: true, chat: true, mutualSuggestions: true, creditOnInterest: false });
  db.user.findUnique.mockResolvedValue(me);
  db.block.findMany.mockResolvedValue([]);
  db.suggestion.updateMany.mockResolvedValue({ count: 0 });
  db.suggestion.findMany.mockResolvedValue([]);
  db.like.findMany.mockResolvedValue([]);
  db.mutualMatch.findMany.mockResolvedValue([]);
});

describe("getSuggestionFeed — new", () => {
  it("shows an undecided mutual row with the other person, whichever side I am", async () => {
    db.suggestion.findMany.mockResolvedValueOnce([mutualRow("s1")]).mockResolvedValueOnce([]);
    const { items, total } = await getSuggestionFeed("me", "new", 1);
    expect(total).toBe(1);
    expect(items[0]).toMatchObject({ kind: "mutual", id: "s1", candidate: { id: "f1", city: "عمان" } });
    expect((items[0] as OpenFeedItem).reason).toContain("المدينة");
    // only rows where *I* haven't decided, and not expired
    const where = db.suggestion.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ flow: "MUTUAL", status: "PENDING" });
    expect(where.OR).toEqual([
      // A partner who left doesn't fill a slot (hidden in the feed anyway)
      { recipientId: "me", recipientDecision: null, candidate: { isDeactivated: false, status: { not: "SUSPENDED" } } },
      // A card made while I was full stays hidden from me until the other says «مهتم» or I have room
      { candidateId: "me", candidateDecision: null, recipient: { isDeactivated: false, status: { not: "SUSPENDED" } }, hiddenFromCandidate: false },
    ]);
  });

  it("closes older rows one side declined, then expires overdue rows first", async () => {
    await getSuggestionFeed("me", "new", 1);
    const [declined, expired] = db.suggestion.updateMany.mock.calls.map((c) => c[0]);
    expect(declined.data).toEqual({ status: "REJECTED" });
    expect(declined.where.AND).toEqual([{ OR: [{ recipientDecision: "DECLINED" }, { candidateDecision: "DECLINED" }] }]);
    expect(expired.data).toEqual({ status: "EXPIRED" });
  });

  it("includes legacy suggestions in «new» and unanswered legacy interests in «interested»", async () => {
    db.suggestion.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "L1", compatibilityScore: 60, createdAt: new Date(), candidate: person("f2", "FEMALE") }]);
    const { items } = await getSuggestionFeed("me", "new", 1);
    expect(items.map((i) => [i.kind, i.id])).toEqual([["legacy_suggestion", "L1"]]);
    expect(db.suggestion.findMany.mock.calls[1][0].where).toEqual({ flow: "LEGACY", recipientId: "me", status: "PENDING" });
    db.like.findMany
      .mockResolvedValueOnce([
        { id: "like1", createdAt: new Date(), suggestionId: "x", fromUser: person("f3", "FEMALE") },
        { id: "like2", createdAt: new Date(), suggestionId: "y", fromUser: person("f4", "FEMALE") },
      ])
      .mockResolvedValueOnce([{ toUserId: "f4" }]); // already answered f4
    const interested = await getSuggestionFeed("me", "interested", 1);
    expect(interested.items.map((i) => [i.kind, i.id, i.likedYou])).toEqual([["legacy_interest", "like1", true]]);
  });

  it("hides blocked people", async () => {
    db.block.findMany.mockResolvedValue([{ blockerId: "me", blockedId: "f1" }]);
    db.suggestion.findMany.mockResolvedValueOnce([mutualRow("s1")]).mockResolvedValueOnce([]);
    expect((await getSuggestionFeed("me", "new", 1)).total).toBe(0);
  });

  it("hides people who deactivated their account or were suspended", async () => {
    db.suggestion.findMany
      .mockResolvedValueOnce([
        mutualRow("s1", { ...person("f1", "FEMALE"), isDeactivated: true, status: "VERIFIED" } as never),
        mutualRow("s2", { ...person("f2", "FEMALE"), isDeactivated: false, status: "SUSPENDED" } as never),
        mutualRow("s3", { ...person("f3", "FEMALE"), isDeactivated: false, status: "VERIFIED" } as never),
      ])
      .mockResolvedValueOnce([]);
    const { items, total } = await getSuggestionFeed("me", "new", 1);
    expect(total).toBe(1);
    expect(items[0].id).toBe("s3");
    expect(JSON.stringify(items)).not.toContain("isDeactivated");
  });

  it("never exposes preferences, dealbreakers, decisions or status", async () => {
    db.suggestion.findMany.mockResolvedValueOnce([{ ...mutualRow("s1"), status: "PENDING", candidateDecision: "DECLINED" }]).mockResolvedValueOnce([]);
    const json = JSON.stringify((await getSuggestionFeed("me", "new", 1)).items);
    for (const key of ["prefCity", "dealbreakers", "Decision", "status", "dateOfBirth"]) expect(json).not.toContain(key);
  });
});

describe("getSuggestionFeed — waiting", () => {
  it("lists my yes rows whether the other side said no or nothing yet", async () => {
    db.suggestion.findMany
      .mockResolvedValueOnce([mutualRow("s1", person("f1", "FEMALE"), true), mutualRow("s2", person("f2", "FEMALE"))])
      .mockResolvedValueOnce([]);
    const { items } = await getSuggestionFeed("me", "waiting", 1);
    expect(items.map((i) => i.id).sort()).toEqual(["s1", "s2"]);
    const where = db.suggestion.findMany.mock.calls[0][0].where;
    expect(where.status).toEqual({ in: ["PENDING", "REJECTED"] });
    expect(where.OR).toEqual([
      { recipientId: "me", recipientDecision: "INTERESTED" },
      { candidateId: "me", candidateDecision: "INTERESTED" },
    ]);
    expect(where.expiresAt.gt).toBeInstanceOf(Date);
  });

  it("shows legacy sent interests that haven't matched", async () => {
    db.suggestion.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: "L1", compatibilityScore: 50, updatedAt: new Date(), candidate: person("f5", "FEMALE") },
        { id: "L2", compatibilityScore: 50, updatedAt: new Date(), candidate: person("f6", "FEMALE") },
      ]);
    db.mutualMatch.findMany.mockResolvedValue([{ femaleId: "f6", maleId: "me" }]);
    const { items } = await getSuggestionFeed("me", "waiting", 1);
    expect(items.map((i) => [i.kind, i.id])).toEqual([["legacy_sent", "L1"]]);
  });
});

describe("getSuggestionFeed — ordering", () => {
  it("orders by compatibilityScore desc then createdAt desc when credit-on-interest is on", async () => {
    settings.getCycleFlags.mockResolvedValue({ introRequests: true, chat: true, mutualSuggestions: true, creditOnInterest: true });
    const older = { ...mutualRow("low", person("f1", "FEMALE")), compatibilityScore: 60 };
    const best = { ...mutualRow("best", person("f2", "FEMALE")), compatibilityScore: 90, createdAt: new Date(Date.now() - 5 * DAY) };
    const tie = { ...mutualRow("tie", person("f3", "FEMALE")), compatibilityScore: 60, createdAt: new Date() };
    db.suggestion.findMany.mockResolvedValueOnce([older, best, tie]).mockResolvedValueOnce([]);
    const { items } = await getSuggestionFeed("me", "new", 1);
    expect(db.suggestion.findMany.mock.calls[0][0].orderBy).toEqual([{ compatibilityScore: "desc" }, { createdAt: "desc" }]);
    expect(items.map((i) => i.id)).toEqual(["best", "tie", "low"]);
  });

  it("«new» holds only cards nobody answered; cards the other side said «مهتم» to move to «interested» with likedYou", async () => {
    settings.getCycleFlags.mockResolvedValue({ introRequests: true, chat: true, mutualSuggestions: true, creditOnInterest: true });
    const best = { ...mutualRow("best", person("f1", "FEMALE")), compatibilityScore: 95 };
    const liked = { ...mutualRow("liked", person("f3", "FEMALE")), compatibilityScore: 61, recipientDecision: "INTERESTED" };
    const likedBetter = { ...mutualRow("likedBetter", person("f4", "MALE"), true), compatibilityScore: 80, candidateDecision: "INTERESTED" };
    db.suggestion.findMany.mockResolvedValueOnce([best, likedBetter, liked]).mockResolvedValueOnce([]);
    const fresh = await getSuggestionFeed("me", "new", 1);
    expect(fresh.items.map((i) => i.id)).toEqual(["best"]);
    expect(fresh.items[0]).not.toHaveProperty("likedYou");
    db.suggestion.findMany.mockResolvedValueOnce([best, likedBetter, liked]).mockResolvedValueOnce([]);
    const interested = await getSuggestionFeed("me", "interested", 1);
    expect(interested.items.map((i) => [i.id, i.likedYou])).toEqual([["likedBetter", true], ["liked", true]]);
    // The raw decisions and the row status never reach the client
    for (const i of [...fresh.items, ...interested.items]) {
      expect(JSON.stringify(i)).not.toContain("Decision");
      expect(i).not.toHaveProperty("status");
    }
  });

  it("the «interested» tab doesn't depend on the credit-on-interest flag", async () => {
    const liked = { ...mutualRow("liked", person("f2", "FEMALE")), recipientDecision: "INTERESTED" };
    db.suggestion.findMany.mockResolvedValueOnce([liked]).mockResolvedValueOnce([]);
    expect((await getSuggestionFeed("me", "new", 1)).items).toEqual([]);
    db.suggestion.findMany.mockResolvedValueOnce([liked]).mockResolvedValueOnce([]);
    expect((await getSuggestionFeed("me", "interested", 1)).items[0]).toMatchObject({ id: "liked", likedYou: true });
  });

  it("stays newest-first when the flag is off", async () => {
    const old = { ...mutualRow("old", person("f1", "FEMALE")), compatibilityScore: 95, createdAt: new Date(Date.now() - 5 * DAY) };
    const fresh = { ...mutualRow("fresh", person("f2", "FEMALE")), compatibilityScore: 40, createdAt: new Date() };
    db.suggestion.findMany.mockResolvedValueOnce([old, fresh]).mockResolvedValueOnce([]);
    const { items } = await getSuggestionFeed("me", "new", 1);
    expect(db.suggestion.findMany.mock.calls[0][0].orderBy).toEqual([{ createdAt: "desc" }]);
    expect(items.map((i) => i.id)).toEqual(["fresh", "old"]);
  });
});

describe("getSuggestionFeed — at 0 credits", () => {
  const on = { introRequests: true, chat: true, mutualSuggestions: true, creditOnInterest: true };
  const broke = { ...me, matchCredits: 0 };
  const withDecision = (id: string, otherDecision: "INTERESTED" | "DECLINED" | null) => ({
    ...mutualRow(id, person(`f-${id}`, "FEMALE")),
    expiresAt: new Date(Date.now() + 5 * DAY),
    recipientDecision: otherDecision,
    candidateDecision: null,
  });

  it("keeps the full card at 0 credits (only «مهتم» waits for a recharge)", async () => {
    settings.getCycleFlags.mockResolvedValue(on);
    db.user.findUnique.mockResolvedValue(broke);
    db.suggestion.findMany.mockResolvedValueOnce([withDecision("s1", null)]).mockResolvedValueOnce([]);
    const { items, total } = await getSuggestionFeed("me", "new", 1);
    expect(total).toBe(1);
    expect(items[0]).toMatchObject({ kind: "mutual", id: "s1", candidate: expect.objectContaining({ firstName: expect.any(String) }) });
    expect(items[0]).not.toHaveProperty("locked");
    expect(JSON.stringify(items)).not.toContain("Decision");
  });

  it("«new» at 0 credits: no likedYou, and an undecided card looks the same whatever the other side did", async () => {
    settings.getCycleFlags.mockResolvedValue(on);
    db.user.findUnique.mockResolvedValue(broke);
    db.suggestion.findMany
      .mockResolvedValueOnce([withDecision("yes", "INTERESTED"), withDecision("no", "DECLINED"), withDecision("none", null)])
      .mockResolvedValueOnce([]);
    const { items } = await getSuggestionFeed("me", "new", 1);
    const byId = Object.fromEntries(items.map((i) => [i.id, i]));
    expect(byId.yes).toBeUndefined();
    expect(byId.no).not.toHaveProperty("likedYou");
    expect(byId.none).not.toHaveProperty("likedYou");
    expect(Object.keys(byId.no).sort()).toEqual(Object.keys(byId.none).sort());
  });

  it("«interested» keeps the full card and the likedYou tag at 0 credits too", async () => {
    settings.getCycleFlags.mockResolvedValue(on);
    db.user.findUnique.mockResolvedValue(broke);
    db.suggestion.findMany.mockResolvedValueOnce([withDecision("s1", "INTERESTED")]).mockResolvedValueOnce([]);
    const { items } = await getSuggestionFeed("me", "interested", 1);
    expect(items[0]).toMatchObject({ id: "s1", likedYou: true, candidate: { id: "f-s1" } });
    expect(items[0]).not.toHaveProperty("locked");
    expect(JSON.stringify(items)).not.toContain("Decision");
  });

  it("«waiting» marks a card the other side declined, and only that one", async () => {
    settings.getCycleFlags.mockResolvedValue(on);
    const mine = (id: string, otherDecision: "DECLINED" | null) => ({
      ...mutualRow(id, person(`f-${id}`, "FEMALE"), true),
      expiresAt: new Date(Date.now() + 5 * DAY),
      recipientDecision: "INTERESTED",
      candidateDecision: otherDecision,
    });
    db.suggestion.findMany.mockResolvedValueOnce([mine("no", "DECLINED"), mine("open", null)]).mockResolvedValueOnce([]);
    const { items } = await getSuggestionFeed("me", "waiting", 1);
    const byId = Object.fromEntries(items.map((i) => [i.id, i]));
    expect(byId.no).toMatchObject({ declined: true });
    expect(byId.open).not.toHaveProperty("declined");
    expect(JSON.stringify(items)).not.toContain("Decision");
  });

  it("unlocked at ≥1", async () => {
    settings.getCycleFlags.mockResolvedValue(on);
    db.user.findUnique.mockResolvedValue({ ...me, matchCredits: 1 });
    db.suggestion.findMany.mockResolvedValueOnce([withDecision("s1", null)]).mockResolvedValueOnce([]);
    const { items } = await getSuggestionFeed("me", "new", 1);
    expect(items[0]).toMatchObject({ kind: "mutual", id: "s1", candidate: { id: "f-s1" } });
    expect(items[0]).not.toHaveProperty("locked");
  });

  it("flag off: a card the other side said «مهتم» to still goes to «interested», not «new»", async () => {
    db.user.findUnique.mockResolvedValue(broke);
    db.suggestion.findMany.mockResolvedValueOnce([withDecision("s1", "INTERESTED")]).mockResolvedValueOnce([]);
    expect((await getSuggestionFeed("me", "new", 1)).items).toEqual([]);
  });

  it("older-style items are hidden while credit on interest is on; the waiting tab shows full cards", async () => {
    settings.getCycleFlags.mockResolvedValue(on);
    db.user.findUnique.mockResolvedValue(broke);
    db.suggestion.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "L1", compatibilityScore: 60, createdAt: new Date(), candidate: person("f2", "FEMALE") }]);
    const fresh = await getSuggestionFeed("me", "new", 1);
    expect(fresh.items).toEqual([]);
    db.suggestion.findMany.mockReset().mockResolvedValue([]);
    db.suggestion.findMany.mockResolvedValueOnce([withDecision("w1", null)]).mockResolvedValueOnce([]);
    const waiting = await getSuggestionFeed("me", "waiting", 1);
    expect(waiting.items[0]).toMatchObject({ kind: "mutual", id: "w1", candidate: { id: "f-w1" } });
  });
});
