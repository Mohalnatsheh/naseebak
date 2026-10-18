import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  block: { findMany: vi.fn() },
  mutualMatch: { findMany: vi.fn() },
  introRequest: { updateMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));

import { cancelDeadPendingFor, describeMatch, isUnavailable, loadMatchStates, type MatchFacts } from "@/lib/matches/state";

const DAY = 24 * 60 * 60 * 1000;
const later = () => new Date(Date.now() + DAY);
const facts = (over: Partial<MatchFacts> = {}): MatchFacts => ({
  requests: [],
  conversation: null,
  visitStatus: null,
  partnerUnavailable: false,
  blockedByMe: false,
  chatEnabled: true,
  introEnabled: true,
  ...over,
});
const req = (type: string, status: string, expiresAt = later()) => ({ type, status, expiresAt });

describe("describeMatch", () => {
  it("engaged on another match: closed as engaged for me, as inactive for my other partners", () => {
    expect(describeMatch(facts({ engagedElsewhere: { mine: true, partner: false } })).closed).toBe("engaged");
    expect(describeMatch(facts({ engagedElsewhere: { mine: false, partner: true } })).closed).toBe("inactive");
    // «لم يحصل نصيب» on this match still reads as ended
    expect(describeMatch(facts({ outcomes: { mine: null, partner: "NOT_A_MATCH" }, engagedElsewhere: { mine: true, partner: false } })).closed).toBe("ended");
  });

  it("a fresh match is open and actionable", () => {
    expect(describeMatch(facts())).toEqual({ closed: null, actionable: true, chatEndedByUser: false });
  });

  it("blocked by me / inactive partner close the match with nothing to do", () => {
    expect(describeMatch(facts({ blockedByMe: true }))).toMatchObject({ closed: "blocked", actionable: false });
    expect(describeMatch(facts({ partnerUnavailable: true }))).toMatchObject({ closed: "inactive", actionable: false });
  });

  it("both requests declined → finished", () => {
    const d = describeMatch(facts({ requests: [req("FAMILY", "DECLINED"), req("CHAT", "DECLINED")] }));
    expect(d).toMatchObject({ closed: "finished", actionable: false });
  });

  it("one declined, the other still sendable → open and actionable", () => {
    expect(describeMatch(facts({ requests: [req("CHAT", "DECLINED")] }))).toMatchObject({ closed: null, actionable: true });
  });

  it("chat ended by a user → finished (no family request any more)", () => {
    const d = describeMatch(facts({ conversation: { status: "ENDED", expiresAt: later(), endedById: "u1" } }));
    expect(d).toMatchObject({ closed: "finished", actionable: false, chatEndedByUser: true });
  });

  it("chat expired naturally → family still possible", () => {
    const d = describeMatch(facts({ conversation: { status: "EXPIRED", expiresAt: new Date(Date.now() - DAY), endedById: null } }));
    expect(d).toMatchObject({ closed: null, actionable: true });
  });

  it("an accepted family introduction is never 'finished' but has nothing to send", () => {
    const d = describeMatch(facts({
      requests: [req("FAMILY", "ACCEPTED"), req("CHAT", "DECLINED")],
    }));
    expect(d).toMatchObject({ closed: null, actionable: false });
  });

  it("something pending keeps the match open", () => {
    const d = describeMatch(facts({
      requests: [req("FAMILY", "PENDING"), req("CHAT", "DECLINED")],
      conversation: null,
    }));
    expect(d.closed).toBeNull();
  });

  it("an open chat keeps it open, but nothing is left to choose (the family move isn't nagged)", () => {
    const d = describeMatch(facts({
      requests: [req("CHAT", "ACCEPTED")],
      conversation: { status: "ACTIVE", expiresAt: later(), endedById: null },
    }));
    expect(d).toMatchObject({ closed: null, actionable: false });
  });

  it("an accepted family introduction isn't actionable even though a chat request could still be sent", () => {
    const d = describeMatch(facts({ requests: [req("FAMILY", "ACCEPTED")] }));
    expect(d).toMatchObject({ closed: null, actionable: false });
  });

  it("a pending request means the choice is made: not actionable", () => {
    expect(describeMatch(facts({ requests: [req("FAMILY", "PENDING")] })).actionable).toBe(false);
    expect(describeMatch(facts({ requests: [req("CHAT", "PENDING")] })).actionable).toBe(false);
  });

  it("an expired pending request counts as nothing under way", () => {
    const d = describeMatch(facts({ requests: [req("FAMILY", "PENDING", new Date(Date.now() - DAY))] }));
    expect(d.actionable).toBe(true);
  });

  it("switch off: nothing is actionable", () => {
    expect(describeMatch(facts({ introEnabled: false })).actionable).toBe(false);
  });
});

describe("isUnavailable", () => {
  it("deleted, deactivated or suspended", () => {
    expect(isUnavailable(null)).toBe(true);
    expect(isUnavailable({ isDeactivated: true, status: "VERIFIED" })).toBe(true);
    expect(isUnavailable({ isDeactivated: false, status: "SUSPENDED" })).toBe(true);
    expect(isUnavailable({ isDeactivated: false, status: "VERIFIED" })).toBe(false);
  });
});

describe("loadMatchStates", () => {
  beforeEach(() => vi.resetAllMocks());

  const m = (id: string, partnerId: string, partner: object = { isDeactivated: false, status: "VERIFIED" }) => ({
    id, femaleId: partnerId, maleId: "u1", female: partner, male: { isDeactivated: false, status: "VERIFIED" },
    visitRequest: null, conversation: null, introRequests: [],
  });

  it("hides matches with someone who blocked me, marks my blocks and inactive partners", async () => {
    db.block.findMany.mockImplementation(async ({ where }: { where: { blockedId?: string; blockerId?: string } }) =>
      where.blockedId === "u1" ? [{ blockerId: "f-blocker" }] : [{ id: "blk", blockedId: "f-blocked" }]
    );
    db.mutualMatch.findMany.mockResolvedValue([
      m("m1", "f-ok"),
      m("m2", "f-blocker"),
      m("m3", "f-blocked"),
      m("m4", "f-off", { isDeactivated: true, status: "VERIFIED" }),
    ]);
    const states = await loadMatchStates("u1", { introRequests: true, chat: true });
    expect([...states.keys()]).toEqual(["m1", "m3", "m4"]);
    expect(states.get("m1")).toMatchObject({ closed: null, actionable: true });
    expect(states.get("m3")).toMatchObject({ closed: "blocked", blockId: "blk", actionable: false });
    expect(states.get("m4")).toMatchObject({ closed: "inactive", actionable: false });
    expect([...states.values()].filter((s) => s.actionable)).toHaveLength(1);
  });
});

describe("cancelDeadPendingFor", () => {
  it("cancels pending requests either way with an unavailable or blocked counterpart", async () => {
    db.introRequest.updateMany.mockResolvedValue({ count: 2 });
    await cancelDeadPendingFor("u1");
    const { where, data } = db.introRequest.updateMany.mock.calls[0][0];
    expect(data).toEqual({ status: "CANCELLED" });
    expect(where.status).toBe("PENDING");
    expect(where.OR[0]).toMatchObject({ receiverId: "u1" });
    expect(where.OR[1]).toMatchObject({ senderId: "u1" });
  });
});
