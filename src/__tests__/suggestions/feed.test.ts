import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  suggestion: { findMany: vi.fn(), updateMany: vi.fn(), count: vi.fn(), groupBy: vi.fn() },
  user: { findUnique: vi.fn() },
  block: { findMany: vi.fn() },
  like: { findMany: vi.fn() },
  mutualMatch: { findMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/intro/match", () => ({ createMutualMatch: vi.fn() }));
const settings = vi.hoisted(() => ({ getCycleFlags: vi.fn(), getReligionEnabled: vi.fn() }));
vi.mock("@/lib/settings", () => settings);

import { ACTIVE_FIRST_GROUP_DAYS, activityGroup, activityLabel, countMutualTabs, countNewItems, getSuggestionFeed, NEW_TAB_LIMIT, type OpenFeedItem } from "@/lib/suggestions/feed";

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
  settings.getReligionEnabled.mockResolvedValue(false);
  db.user.findUnique.mockResolvedValue(me);
  db.block.findMany.mockResolvedValue([]);
  db.suggestion.updateMany.mockResolvedValue({ count: 0 });
  db.suggestion.findMany.mockResolvedValue([]);
  db.suggestion.groupBy.mockResolvedValue([]);
  db.like.findMany.mockResolvedValue([]);
  db.mutualMatch.findMany.mockResolvedValue([]);
});

describe("getSuggestionFeed — religion", () => {
  it("passes the switch to the cards", async () => {
    settings.getReligionEnabled.mockResolvedValue(true);
    db.suggestion.findMany.mockResolvedValueOnce([mutualRow("s1")]).mockResolvedValueOnce([]);
    const { items } = await getSuggestionFeed("me", "new", 1);
    expect((items[0] as OpenFeedItem).candidate.religion).toBe("مسلم");
  });
});

describe("getSuggestionFeed — new", () => {
  it("shows an undecided mutual row with the other person, whichever side I am", async () => {
    db.suggestion.findMany.mockResolvedValueOnce([mutualRow("s1")]).mockResolvedValueOnce([]);
    const { items, total } = await getSuggestionFeed("me", "new", 1);
    expect(total).toBe(1);
    expect(items[0]).toMatchObject({ kind: "mutual", id: "s1", candidate: { id: "f1", city: "عمان" } });
    expect((items[0] as OpenFeedItem).reason).toContain("المدينة");
    // only rows where *I* haven't decided, and not expired
    // (the first of the three activity-group queries; the open-card filter is AND-ed with the group)
    const where = db.suggestion.findMany.mock.calls[0][0].where.AND[0];
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
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "L1", compatibilityScore: 60, createdAt: new Date(), candidate: person("f2", "FEMALE") }]);
    const { items } = await getSuggestionFeed("me", "new", 1);
    expect(items.map((i) => [i.kind, i.id])).toEqual([["legacy_suggestion", "L1"]]);
    expect(db.suggestion.findMany.mock.calls[3][0].where).toEqual({ flow: "LEGACY", recipientId: "me", status: "PENDING" });
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

  it("asks the database for the tab's own cards, so «مهتمون بك» never loses one past the source limit", async () => {
    // Filtering after `take` dropped a «مهتم» ranked under 50 undecided cards of its activity group (the badge counted it)
    await getSuggestionFeed("me", "interested", 1);
    for (const call of db.suggestion.findMany.mock.calls.slice(0, 3)) {
      expect(call[0].where.AND[2]).toEqual({
        OR: [
          { recipientId: "me", candidateDecision: "INTERESTED" },
          { candidateId: "me", recipientDecision: "INTERESTED" },
        ],
      });
    }
    db.suggestion.findMany.mockClear();
    await getSuggestionFeed("me", "new", 1);
    for (const call of db.suggestion.findMany.mock.calls.slice(0, 3)) {
      expect(call[0].where.AND[2]).toEqual({
        OR: [
          { recipientId: "me", candidateDecision: null },
          { candidateId: "me", recipientDecision: null },
        ],
      });
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
      .mockResolvedValueOnce([])
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

describe("countNewItems", () => {
  it("credit on interest: two COUNTs (new + liked me), no feed load", async () => {
    settings.getCycleFlags.mockResolvedValue({ introRequests: true, chat: true, mutualSuggestions: true, creditOnInterest: true });
    db.block.findMany.mockResolvedValue([{ blockerId: "me", blockedId: "f9" }]);
    db.suggestion.count.mockResolvedValueOnce(3).mockResolvedValueOnce(2);
    expect(await countNewItems("me")).toBe(5);
    expect(db.suggestion.findMany).not.toHaveBeenCalled();
    // expiry runs first, like the feed
    expect(db.suggestion.updateMany).toHaveBeenCalledTimes(2);
    const [fresh, liked] = db.suggestion.count.mock.calls.map((c) => c[0].where);
    expect(fresh.OR[0]).toMatchObject({ recipientId: "me", candidateDecision: null, candidateId: { notIn: ["f9"] } });
    expect(liked.OR[1]).toMatchObject({ candidateId: "me", recipientDecision: "INTERESTED", recipientId: { notIn: ["f9"] } });
  });

  it("flag off: counts the two feed tabs (legacy cards included)", async () => {
    db.suggestion.findMany
      .mockResolvedValueOnce([mutualRow("s1")])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "L1", compatibilityScore: 60, createdAt: new Date(), candidate: person("f2", "FEMALE") }]);
    expect(await countNewItems("me")).toBe(2);
    expect(db.suggestion.count).not.toHaveBeenCalled();
  });
});

describe("getSuggestionFeed — countOnly", () => {
  it("gives the same total with no cards and without loading profiles", async () => {
    db.suggestion.findMany.mockResolvedValueOnce([mutualRow("s1"), mutualRow("s2", person("f2", "FEMALE"))]).mockResolvedValueOnce([]);
    db.block.findMany.mockResolvedValue([{ blockerId: "me", blockedId: "f2" }]);
    const r = await getSuggestionFeed("me", "new", 1, 10, { countOnly: true });
    expect(r).toEqual({ items: [], page: 1, totalPages: 1, total: 1 });
    expect(db.suggestion.findMany.mock.calls[0][0].select.candidate).toEqual({ select: { id: true, isDeactivated: true, status: true, lastActiveAt: true } });
  });
});

describe("getSuggestionFeed — recent activity first", () => {
  const now = new Date("2026-11-04T12:00:00Z");
  const seen = (daysAgo: number | null) => (daysAgo === null ? null : new Date(now.getTime() - daysAgo * DAY));

  it("groups: up to 3 days, 3–7 days, longer or never", () => {
    expect(activityGroup(seen(0), now)).toBe(0);
    expect(activityGroup(seen(3), now)).toBe(0);
    expect(activityGroup(seen(3.5), now)).toBe(1);
    expect(activityGroup(seen(7), now)).toBe(1);
    expect(activityGroup(seen(8), now)).toBe(2);
    expect(activityGroup(null, now)).toBe(2);
  });

  it("asks for each group separately: the other side's lastActiveAt, whichever side I am on", async () => {
    await getSuggestionFeed("me", "new", 1);
    const groups = db.suggestion.findMany.mock.calls.slice(0, 3).map((c) => c[0].where.AND[1].OR);
    expect(groups[0][0]).toMatchObject({ recipientId: "me", candidate: { lastActiveAt: { gte: expect.any(Date) } } });
    expect(groups[0][1]).toMatchObject({ candidateId: "me", recipient: { lastActiveAt: { gte: expect.any(Date) } } });
    expect(groups[1][0].candidate.lastActiveAt).toMatchObject({ gte: expect.any(Date), lt: expect.any(Date) });
    expect(groups[2][0].candidate.OR).toEqual([{ lastActiveAt: null }, { lastActiveAt: { lt: expect.any(Date) } }]);
  });

  it("an active person comes before a better score from someone away; the score orders each group", async () => {
    settings.getCycleFlags.mockResolvedValue({ introRequests: true, chat: true, mutualSuggestions: true, creditOnInterest: true });
    const row = (id: string, score: number, daysAgo: number | null) => ({
      ...mutualRow(id, { ...person(id, "FEMALE"), lastActiveAt: seen(daysAgo) } as never),
      compatibilityScore: score,
    });
    db.suggestion.findMany
      .mockResolvedValueOnce([row("active-70", 70, 1), row("active-65", 65, 0)])
      .mockResolvedValueOnce([row("week-80", 80, 5)])
      .mockResolvedValueOnce([row("away-95", 95, 20), row("never-90", 90, null)]);
    vi.useFakeTimers({ now, toFake: ["Date"] });
    try {
      const { items } = await getSuggestionFeed("me", "new", 1);
      expect(items.map((i) => i.id)).toEqual(["active-70", "active-65", "week-80", "away-95", "never-90"]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("getSuggestionFeed — active first, busy last (feed_active_first)", () => {
  const now = new Date("2026-11-07T12:00:00Z");
  const seen = (daysAgo: number | null) => (daysAgo === null ? null : new Date(now.getTime() - daysAgo * DAY));
  const on = { introRequests: true, chat: true, mutualSuggestions: true, creditOnInterest: true, activeFirstFeed: true };
  const row = (id: string, score: number, daysAgo: number | null) => ({
    ...mutualRow(id, { ...person(id, "FEMALE"), lastActiveAt: seen(daysAgo) } as never),
    compatibilityScore: score,
  });
  // `id` holds `n` «مهتم» waiting for her answer (she is the candidate on those cards)
  const waitingOn = (counts: Record<string, number>) =>
    db.suggestion.groupBy.mockImplementation(async (args: { by: string[] }) =>
      args.by[0] === "candidateId" ? Object.entries(counts).map(([candidateId, n]) => ({ candidateId, _count: { _all: n } })) : []
    );
  const run = async (tab: "new" | "interested", opts?: { countOnly?: boolean }) => {
    vi.useFakeTimers({ now, toFake: ["Date"] });
    try {
      return await getSuggestionFeed("me", tab, 1, 10, opts);
    } finally {
      vi.useRealTimers();
    }
  };

  it("groups: up to 1 day, 1–3 days, 3–7 days, longer or never", () => {
    const g = (d: number | null) => activityGroup(seen(d), now, ACTIVE_FIRST_GROUP_DAYS);
    expect([g(0), g(1), g(2), g(3), g(5), g(7), g(8), g(null)]).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });

  it("asks for the four groups separately, the first one the last day", async () => {
    settings.getCycleFlags.mockResolvedValue(on);
    await run("new");
    const groups = db.suggestion.findMany.mock.calls.slice(0, 4).map((c) => c[0].where.AND[1].OR[0].candidate);
    expect(groups[0].lastActiveAt.gte.getTime()).toBe(now.getTime() - DAY);
    expect(groups[1].lastActiveAt).toEqual({ gte: new Date(now.getTime() - 3 * DAY), lt: new Date(now.getTime() - DAY) });
    expect(groups[3].OR).toEqual([{ lastActiveAt: null }, { lastActiveAt: { lt: new Date(now.getTime() - 7 * DAY) } }]);
    // the legacy query follows the four groups
    expect(db.suggestion.findMany.mock.calls[4][0].where).toMatchObject({ flow: "LEGACY" });
  });

  it("today first; inside a group someone with 5+ «مهتم» waiting goes after the rest, whatever the score", async () => {
    settings.getCycleFlags.mockResolvedValue(on);
    db.suggestion.findMany
      .mockResolvedValueOnce([row("today-busy-95", 95, 0.2), row("today-free-70", 70, 0.5), row("today-four-80", 80, 0.1)])
      .mockResolvedValueOnce([row("twodays-free-90", 90, 2)])
      .mockResolvedValueOnce([row("week-busy-99", 99, 5), row("week-free-60", 60, 6)])
      .mockResolvedValueOnce([]);
    waitingOn({ "today-busy-95": 5, "today-four-80": 4, "week-busy-99": 30 });
    const { items } = await run("new");
    expect(items.map((i) => i.id)).toEqual([
      "today-four-80", "today-free-70", "today-busy-95", "twodays-free-90", "week-free-60", "week-busy-99",
    ]);
    // Only the waiting «مهتم» on open cards of the people shown are counted
    const [asCandidate, asRecipient] = db.suggestion.groupBy.mock.calls.map((c) => c[0]);
    expect(asCandidate.where).toMatchObject({
      flow: "MUTUAL", status: "PENDING", recipientDecision: "INTERESTED", candidateDecision: null,
      candidateId: { in: expect.arrayContaining(["today-busy-95", "week-busy-99"]) },
    });
    expect(asRecipient.where).toMatchObject({ candidateDecision: "INTERESTED", recipientDecision: null });
    // Only «مهتم» from people still here count
    expect(asCandidate.where.recipient).toEqual({ isDeactivated: false, status: { not: "SUSPENDED" } });
    expect(asRecipient.where.candidate).toEqual({ isDeactivated: false, status: { not: "SUSPENDED" } });
  });

  it("the busy count never reaches the client", async () => {
    settings.getCycleFlags.mockResolvedValue(on);
    db.suggestion.findMany.mockResolvedValueOnce([row("busy", 70, 0)]);
    waitingOn({ busy: 7777 });
    const { items } = await run("new");
    expect(JSON.stringify(items)).not.toContain("7777");
  });

  it("«مهتمون بك» and the badge count don't look up waiting «مهتم»", async () => {
    settings.getCycleFlags.mockResolvedValue(on);
    await run("interested");
    await run("new", { countOnly: true });
    expect(db.suggestion.groupBy).not.toHaveBeenCalled();
  });

  it("switch off: three groups as before and no waiting lookup", async () => {
    settings.getCycleFlags.mockResolvedValue({ ...on, activeFirstFeed: false });
    await run("new");
    expect(db.suggestion.groupBy).not.toHaveBeenCalled();
    expect(db.suggestion.findMany.mock.calls[3][0].where).toMatchObject({ flow: "LEGACY" });
  });
});

describe("«جديدة» shows the best NEW_TAB_LIMIT cards", () => {
  const rows = (n: number, theirs: "INTERESTED" | null = null) =>
    Array.from({ length: n }, (_, i) => ({
      ...mutualRow(`s${i}`, { ...person(`f${i}`, "FEMALE"), lastActiveAt: new Date() } as never),
      compatibilityScore: 90 - i,
      // mutualRow puts me on the candidate side, so the other person's answer is the recipient's
      recipientDecision: theirs,
    }));

  it("20 open cards: 15 in «جديدة», the best ones, and the pages follow", async () => {
    settings.getCycleFlags.mockResolvedValue({ introRequests: true, chat: true, mutualSuggestions: true, creditOnInterest: true });
    db.suggestion.findMany.mockResolvedValueOnce(rows(20));
    const page1 = await getSuggestionFeed("me", "new", 1, 10);
    expect(NEW_TAB_LIMIT).toBe(15);
    expect(page1.total).toBe(15);
    expect(page1.totalPages).toBe(2);
    expect(page1.items[0].id).toBe("s0");
    db.suggestion.findMany.mockResolvedValueOnce(rows(20));
    const page2 = await getSuggestionFeed("me", "new", 2, 10);
    expect(page2.items.map((i) => i.id)).toEqual(["s10", "s11", "s12", "s13", "s14"]);
  });

  it("«مهتمون بك» is not limited", async () => {
    settings.getCycleFlags.mockResolvedValue({ introRequests: true, chat: true, mutualSuggestions: true, creditOnInterest: true });
    db.suggestion.findMany.mockResolvedValueOnce(rows(20, "INTERESTED"));
    expect((await getSuggestionFeed("me", "interested", 1, 10)).total).toBe(20);
  });

  it("the «جديدة» badge count is limited the same way", async () => {
    db.suggestion.count.mockResolvedValueOnce(40).mockResolvedValueOnce(3);
    expect(await countMutualTabs("me")).toEqual({ fresh: 15, likedYou: 3 });
  });
});

describe("activityLabel", () => {
  const now = new Date("2026-11-07T12:00:00Z");
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000);

  it("says today within a day, in the person's gender", () => {
    expect(activityLabel(hoursAgo(2), "MALE", now)).toBe("نشط اليوم");
    expect(activityLabel(hoursAgo(23), "FEMALE", now)).toBe("نشطة اليوم");
  });

  it("says this week up to 7 days", () => {
    expect(activityLabel(hoursAgo(30), "MALE", now)).toBe("نشط هذا الأسبوع");
    expect(activityLabel(hoursAgo(167), "FEMALE", now)).toBe("نشطة هذا الأسبوع");
  });

  it("says nothing for older or unknown activity", () => {
    expect(activityLabel(hoursAgo(169), "MALE", now)).toBeNull();
    expect(activityLabel(null, "MALE", now)).toBeNull();
  });
});
