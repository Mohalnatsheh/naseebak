import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  suggestion: { findUnique: vi.fn(), updateMany: vi.fn() },
  block: { findFirst: vi.fn() },
  user: { findUnique: vi.fn() },
}));
const matchMod = vi.hoisted(() => ({ createMutualMatch: vi.fn() }));
const notifyMod = vi.hoisted(() => ({ notify: vi.fn(), notifyMany: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/intro/match", () => matchMod);
vi.mock("@/lib/notify", () => notifyMod);

import { decideSuggestion } from "@/lib/suggestions/mutual";
import { IntroError } from "@/lib/intro/errors";

const DAY = 24 * 60 * 60 * 1000;
const row = (over: object = {}) => ({
  id: "s1", recipientId: "u1", candidateId: "f1", flow: "MUTUAL", status: "PENDING",
  expiresAt: new Date(Date.now() + DAY), recipientDecision: null, candidateDecision: null, ...over,
});

async function expectNotFound(p: Promise<unknown>) {
  const err = await p.catch((e) => e);
  expect(err).toBeInstanceOf(IntroError);
  expect((err as IntroError).code).toBe("NOT_FOUND");
}

beforeEach(() => {
  vi.clearAllMocks();
  db.block.findFirst.mockResolvedValue(null);
  db.suggestion.updateMany.mockResolvedValue({ count: 1 });
  db.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
    gender: where.id.startsWith("f") ? "FEMALE" : "MALE",
  }));
  matchMod.createMutualMatch.mockResolvedValue({ matchId: "m1" });
});

describe("decideSuggestion", () => {
  it("refuses users who are not part of the suggestion", async () => {
    db.suggestion.findUnique.mockResolvedValue(row());
    await expectNotFound(decideSuggestion({ suggestionId: "s1", userId: "stranger", interested: true }));
    expect(db.suggestion.updateMany).not.toHaveBeenCalled();
  });

  it("refuses legacy rows", async () => {
    db.suggestion.findUnique.mockResolvedValue(row({ flow: "LEGACY" }));
    await expectNotFound(decideSuggestion({ suggestionId: "s1", userId: "u1", interested: true }));
  });

  it("refuses expired and closed rows", async () => {
    db.suggestion.findUnique.mockResolvedValue(row({ expiresAt: new Date(Date.now() - 1000) }));
    await expectNotFound(decideSuggestion({ suggestionId: "s1", userId: "u1", interested: true }));
    db.suggestion.findUnique.mockResolvedValue(row({ status: "REJECTED" }));
    await expectNotFound(decideSuggestion({ suggestionId: "s1", userId: "u1", interested: true }));
  });

  it("refuses when either side blocked the other", async () => {
    db.suggestion.findUnique.mockResolvedValue(row());
    db.block.findFirst.mockResolvedValue({ id: "b1" });
    await expectNotFound(decideSuggestion({ suggestionId: "s1", userId: "f1", interested: true }));
    expect(db.suggestion.updateMany).not.toHaveBeenCalled();
  });

  it("refuses when the other person is deactivated or suspended (no decision recorded)", async () => {
    for (const other of [{ isDeactivated: true, status: "VERIFIED" }, { isDeactivated: false, status: "SUSPENDED" }]) {
      db.suggestion.findUnique.mockResolvedValue(row());
      db.user.findUnique.mockResolvedValue(other);
      await expectNotFound(decideSuggestion({ suggestionId: "s1", userId: "u1", interested: true }));
    }
    expect(db.suggestion.updateMany).not.toHaveBeenCalled();
    expect(matchMod.createMutualMatch).not.toHaveBeenCalled();
  });

  it("never creates a match with someone who deactivated at the last moment", async () => {
    db.suggestion.findUnique
      .mockResolvedValueOnce(row({ candidateDecision: "INTERESTED" }))
      .mockResolvedValueOnce(row({ candidateDecision: "INTERESTED", recipientDecision: "INTERESTED" }));
    db.user.findUnique
      .mockResolvedValueOnce({ isDeactivated: false, status: "VERIFIED" })
      .mockResolvedValueOnce({ isDeactivated: true, status: "VERIFIED" });
    const res = await decideSuggestion({ suggestionId: "s1", userId: "u1", interested: true });
    expect(res).toEqual({ match: false });
    expect(matchMod.createMutualMatch).not.toHaveBeenCalled();
  });

  it("refuses a second decision by the same person", async () => {
    db.suggestion.findUnique.mockResolvedValue(row({ candidateDecision: "INTERESTED" }));
    await expectNotFound(decideSuggestion({ suggestionId: "s1", userId: "f1", interested: false }));
    // and when a concurrent request won the conditional update
    db.suggestion.findUnique.mockResolvedValue(row());
    db.suggestion.updateMany.mockResolvedValueOnce({ count: 0 });
    await expectNotFound(decideSuggestion({ suggestionId: "s1", userId: "f1", interested: false }));
  });

  it("records the first yes without a match or any notification", async () => {
    db.suggestion.findUnique.mockResolvedValueOnce(row()).mockResolvedValueOnce(row({ candidateDecision: "INTERESTED" }));
    const res = await decideSuggestion({ suggestionId: "s1", userId: "f1", interested: true });
    expect(res).toEqual({ match: false });
    expect(db.suggestion.updateMany).toHaveBeenCalledTimes(1);
    expect(db.suggestion.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: "s1", flow: "MUTUAL", status: "PENDING", candidateDecision: null },
      data: { candidateDecision: "INTERESTED" },
    });
    expect(matchMod.createMutualMatch).not.toHaveBeenCalled();
    expect(notifyMod.notify).not.toHaveBeenCalled();
    expect(notifyMod.notifyMany).not.toHaveBeenCalled();
  });

  it("creates the match once both said yes", async () => {
    db.suggestion.findUnique
      .mockResolvedValueOnce(row({ candidateDecision: "INTERESTED" }))
      .mockResolvedValueOnce(row({ candidateDecision: "INTERESTED", recipientDecision: "INTERESTED" }));
    const res = await decideSuggestion({ suggestionId: "s1", userId: "u1", interested: true });
    expect(res).toEqual({ match: true, matchId: "m1" });
    expect(db.suggestion.updateMany.mock.calls[1][0]).toEqual({
      where: { id: "s1", status: "PENDING" },
      data: { status: "ACCEPTED" },
    });
    expect(matchMod.createMutualMatch).toHaveBeenCalledTimes(1);
    expect(matchMod.createMutualMatch).toHaveBeenCalledWith({ femaleId: "f1", maleId: "u1", suggestionId: "s1" });
  });

  it("does not create a second match when the other request already closed it", async () => {
    db.suggestion.findUnique
      .mockResolvedValueOnce(row({ recipientDecision: "INTERESTED" }))
      .mockResolvedValueOnce(row({ candidateDecision: "INTERESTED", recipientDecision: "INTERESTED" }));
    db.suggestion.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const res = await decideSuggestion({ suggestionId: "s1", userId: "f1", interested: true });
    expect(res.match).toBe(true);
    expect(matchMod.createMutualMatch).not.toHaveBeenCalled();
  });

  it("closes the row silently after a no once both decided", async () => {
    db.suggestion.findUnique
      .mockResolvedValueOnce(row({ recipientDecision: "INTERESTED" }))
      .mockResolvedValueOnce(row({ recipientDecision: "INTERESTED", candidateDecision: "DECLINED" }));
    const res = await decideSuggestion({ suggestionId: "s1", userId: "f1", interested: false });
    expect(res).toEqual({ match: false });
    expect(db.suggestion.updateMany.mock.calls[1][0]).toEqual({
      where: { id: "s1", status: "PENDING" },
      data: { status: "REJECTED" },
    });
    expect(matchMod.createMutualMatch).not.toHaveBeenCalled();
    expect(notifyMod.notify).not.toHaveBeenCalled();
  });

  it("keeps the row open after a first no", async () => {
    db.suggestion.findUnique.mockResolvedValueOnce(row()).mockResolvedValueOnce(row({ recipientDecision: "DECLINED" }));
    await decideSuggestion({ suggestionId: "s1", userId: "u1", interested: false });
    expect(db.suggestion.updateMany).toHaveBeenCalledTimes(1);
  });
});
