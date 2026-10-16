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

import { getSuggestionFeed } from "@/lib/suggestions/feed";

const DAY = 24 * 60 * 60 * 1000;
const person = (id: string, gender: "MALE" | "FEMALE", profile: object = {}) => ({
  id, firstName: id, isVerified: false, gender, personalityResult: null,
  profile: { city: "عمان", dateOfBirth: new Date("1995-01-01"), prefCity: ["عمان"], dealbreakers: ["city"], ...profile },
});
const me = person("me", "MALE");
const mutualRow = (id: string, other = person("f1", "FEMALE"), iAmRecipient = false) => ({
  id, compatibilityScore: 70, createdAt: new Date(Date.now() - DAY),
  recipientId: iAmRecipient ? "me" : other.id,
  recipient: iAmRecipient ? me : other,
  candidate: iAmRecipient ? other : me,
});

beforeEach(() => {
  vi.clearAllMocks();
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
    expect(items[0].reason).toContain("المدينة");
    // only rows where *I* haven't decided, and not expired
    const where = db.suggestion.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ flow: "MUTUAL", status: "PENDING" });
    expect(where.OR).toEqual([
      { recipientId: "me", recipientDecision: null },
      { candidateId: "me", candidateDecision: null },
    ]);
  });

  it("expires overdue rows first", async () => {
    await getSuggestionFeed("me", "new", 1);
    expect(db.suggestion.updateMany.mock.calls[0][0].data).toEqual({ status: "EXPIRED" });
  });

  it("includes legacy suggestions and unanswered legacy interests", async () => {
    db.suggestion.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "L1", compatibilityScore: 60, createdAt: new Date(), candidate: person("f2", "FEMALE") }]);
    db.like.findMany
      .mockResolvedValueOnce([
        { id: "like1", createdAt: new Date(), suggestionId: "x", fromUser: person("f3", "FEMALE") },
        { id: "like2", createdAt: new Date(), suggestionId: "y", fromUser: person("f4", "FEMALE") },
      ])
      .mockResolvedValueOnce([{ toUserId: "f4" }]); // already answered f4
    const { items } = await getSuggestionFeed("me", "new", 1);
    expect(items.map((i) => [i.kind, i.id]).sort()).toEqual([["legacy_interest", "like1"], ["legacy_suggestion", "L1"]]);
    expect(db.suggestion.findMany.mock.calls[1][0].where).toEqual({ flow: "LEGACY", recipientId: "me", status: "PENDING" });
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
