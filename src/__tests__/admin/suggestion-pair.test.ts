import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  user: { findMany: vi.fn() },
  block: { findFirst: vi.fn() },
  mutualMatch: { findFirst: vi.fn() },
  suggestion: { findFirst: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));
const followup = vi.hoisted(() => ({ isEngaged: vi.fn(async (id: string) => id === "") }));
vi.mock("@/lib/intro/followup", () => followup);
const score = vi.hoisted(() => ({ mutuallyAcceptable: vi.fn(() => true) }));
vi.mock("@/lib/matching/score", () => score);
vi.mock("@/lib/matching/auto-suggest", () => ({ scoringSelect: { id: true, gender: true, profile: true } }));

import { checkSuggestionPair } from "@/lib/admin/suggestion-pair";

const person = (id: string, gender: string, over: object = {}) => ({
  id, gender, role: "USER", status: "VERIFIED", isDeactivated: false, isFlagged: false, profile: {}, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.user.findMany.mockResolvedValue([person("a", "FEMALE"), person("b", "MALE")]);
  followup.isEngaged.mockResolvedValue(false);
  score.mutuallyAcceptable.mockReturnValue(true);
  db.block.findFirst.mockResolvedValue(null);
  db.mutualMatch.findFirst.mockResolvedValue(null);
  db.suggestion.findFirst.mockResolvedValue(null);
});

describe("checkSuggestionPair, the cycle's rules (G62)", () => {
  it("refuses a pair that breaks one side's dealbreakers, with a clear message", async () => {
    score.mutuallyAcceptable.mockReturnValue(false);
    const r = await checkSuggestionPair("a", "b");
    expect(r).toMatchObject({ status: 409 });
    expect(r?.error).toMatch(/dealbreaker/);
  });

  it("refuses an engaged person", async () => {
    followup.isEngaged.mockImplementation(async (id: string) => id === "b");
    expect(await checkSuggestionPair("a", "b")).toMatchObject({ status: 409, error: expect.stringMatching(/engaged/) });
  });

  it("refuses a flagged person", async () => {
    db.user.findMany.mockResolvedValue([person("a", "FEMALE", { isFlagged: true }), person("b", "MALE")]);
    expect(await checkSuggestionPair("a", "b")).toMatchObject({ status: 409, error: expect.stringMatching(/flagged/) });
  });
});

describe("checkSuggestionPair", () => {
  it("allows a clean opposite-gender pair", async () => {
    expect(await checkSuggestionPair("a", "b")).toBeNull();
  });

  it("refuses the same person", async () => {
    expect(await checkSuggestionPair("a", "a")).toMatchObject({ status: 400 });
  });

  it("refuses the same gender", async () => {
    db.user.findMany.mockResolvedValue([person("a", "MALE"), person("b", "MALE")]);
    expect(await checkSuggestionPair("a", "b")).toMatchObject({ status: 400 });
  });

  it("refuses a missing user", async () => {
    db.user.findMany.mockResolvedValue([person("a", "FEMALE")]);
    expect(await checkSuggestionPair("a", "b")).toMatchObject({ status: 404 });
  });

  it("refuses suspended or deactivated users", async () => {
    db.user.findMany.mockResolvedValue([person("a", "FEMALE", { status: "SUSPENDED" }), person("b", "MALE")]);
    expect(await checkSuggestionPair("a", "b")).toMatchObject({ status: 400 });
    db.user.findMany.mockResolvedValue([person("a", "FEMALE"), person("b", "MALE", { isDeactivated: true })]);
    expect(await checkSuggestionPair("a", "b")).toMatchObject({ status: 400 });
  });

  it("refuses when either blocked the other", async () => {
    db.block.findFirst.mockResolvedValue({ id: "x" });
    expect(await checkSuggestionPair("a", "b")).toMatchObject({ status: 409 });
    expect(db.block.findFirst.mock.calls[0][0].where.OR).toHaveLength(2);
  });

  it("refuses an existing match", async () => {
    db.mutualMatch.findFirst.mockResolvedValue({ id: "m" });
    expect(await checkSuggestionPair("a", "b")).toMatchObject({ status: 409 });
  });

  it("refuses an existing suggestion between them in either direction", async () => {
    db.suggestion.findFirst.mockResolvedValue({ id: "s", status: "PENDING" });
    expect(await checkSuggestionPair("a", "b")).toMatchObject({ status: 409 });
    expect(db.suggestion.findFirst.mock.calls[0][0].where.OR).toHaveLength(2);
  });
});
