import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  mutualMatch: { count: vi.fn(), findMany: vi.fn() },
  suggestion: { findMany: vi.fn(), count: vi.fn() },
  user: { count: vi.fn(), findMany: vi.fn() },
  poll: { findMany: vi.fn() },
  pollVote: { groupBy: vi.fn(), aggregate: vi.fn(), count: vi.fn() },
  $queryRaw: vi.fn(),
}));
const auth = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/auth", () => auth);
vi.mock("@/lib/notify", () => ({ notify: vi.fn(), notifyMany: vi.fn() }));
vi.mock("@/lib/settings", () => ({
  getCycleFlags: vi.fn(async () => ({ introRequests: true, chat: true, mutualSuggestions: true, creditOnInterest: true })),
}));
vi.mock("@/lib/countries/server", () => ({
  getAdminCountry: vi.fn(async () => "JO"),
  userCountryWhere: (c: string) => (c === "ALL" ? {} : { country: c }),
}));
vi.mock("@/lib/engagement/polls", () => ({
  nextPollSlug: vi.fn(),
  pollRewardCredits: vi.fn(async () => 1),
  pollRoundDays: vi.fn(async () => 3),
  pollsEnabled: vi.fn(async () => true),
  rotatePollsIfDue: vi.fn(async () => {}),
  TEST_SOURCE: "test",
}));

import { GET as listMatches } from "@/app/api/admin/matches/route";
import { GET as listSuggestions } from "@/app/api/admin/suggestions/route";
import { GET as audience } from "@/app/api/admin/notifications/audience/route";
import { GET as listNotifications } from "@/app/api/admin/notifications/route";
import { GET as listPolls } from "@/app/api/admin/polls/route";
import { fmtLeft } from "@/lib/admin/matching-time";

const cuid = "cmabcdefghijklmnopqrstuvw";

beforeEach(() => {
  vi.clearAllMocks();
  auth.requireAdmin.mockResolvedValue({ session: { user: { id: "admin1" } } });
  db.mutualMatch.count.mockResolvedValue(0);
  db.mutualMatch.findMany.mockResolvedValue([]);
  db.suggestion.count.mockResolvedValue(0);
  db.suggestion.findMany.mockResolvedValue([]);
});

describe("matches: stalled filters", () => {
  const where = async (qs: string) => {
    await listMatches(new Request(`http://x/api/admin/matches?${qs}`));
    return db.mutualMatch.count.mock.calls[0][0].where;
  };

  it("no request and no chat yet", async () => {
    expect(await where("stalled=no_request")).toMatchObject({ introRequests: { none: {} }, conversation: null });
  });
  it("a request still open", async () => {
    const w = await where("stalled=waiting");
    expect(w.introRequests.some.status).toBe("PENDING");
    expect(w.introRequests.some.expiresAt.gt).toBeInstanceOf(Date);
  });
  it("a chat with no message", async () => {
    expect(await where("stalled=not_started")).toMatchObject({ conversation: { messages: { none: {} } } });
  });
  it("ignores an unknown filter", async () => {
    const w = await where("stalled=nope");
    expect(w.introRequests).toBeUndefined();
    expect(w.conversation).toBeUndefined();
  });
  it("a pasted match id finds that match", async () => {
    const w = await where(`q=${cuid}`);
    expect(w.id).toBe(cuid);
    expect(w.OR).toBeUndefined();
  });
});

describe("suggestions: browse", () => {
  const list = async (qs = "") => {
    const res = await listSuggestions(new Request(`http://x/api/admin/suggestions?${qs}`));
    return { d: await res.json(), args: db.suggestion.findMany.mock.calls[0][0] };
  };

  it("filters by flow and by either person, keeping the country", async () => {
    const { args } = await list("flow=MUTUAL&q=سارة");
    expect(args.where.AND).toContainEqual({ flow: "MUTUAL" });
    expect(args.where.AND).toContainEqual({ recipient: { country: "JO" } });
    expect(args.where.AND.some((c: { OR?: object[] }) => c.OR && "recipient" in c.OR[0])).toBe(true);
  });

  it("the person search doesn't replace the status filter's OR", async () => {
    const { args } = await list("status=PENDING&q=سارة");
    const ors = args.where.AND.filter((c: { OR?: unknown }) => c.OR);
    expect(ors).toHaveLength(2);
  });

  it("expiring within 48 h: open, a deadline ahead, someone hasn't answered, closest first", async () => {
    const { args } = await list("status=EXPIRING_SOON");
    const c = args.where.AND[0];
    expect(c.status).toBe("PENDING");
    expect(c.OR).toEqual([{ recipientDecision: null }, { candidateDecision: null }]);
    expect(c.expiresAt.lte.getTime() - c.expiresAt.gte.getTime()).toBe(48 * 36e5);
    expect(args.orderBy).toEqual({ expiresAt: "asc" });
  });

  it("states the live numbers for the Generate help", async () => {
    const { d } = await list();
    expect(d.rules).toEqual({ minScore: 60, maxOpen: 5, weeklyCap: 3 });
  });
});

describe("notifications", () => {
  it("counts a broadcast's audience read-only, with the country name", async () => {
    db.user.count.mockResolvedValue(1234);
    const res = await audience(new Request("http://x/api/admin/notifications/audience?channel=app"));
    expect(await res.json()).toEqual({ count: 1234, country: "Jordan" });
    const where = db.user.count.mock.calls[0][0].where;
    expect(where).toMatchObject({ role: "USER", isDeactivated: false, country: "JO" });
    expect(where.pushDevices).toBeTruthy();
  });

  it("refuses an unknown channel", async () => {
    const res = await audience(new Request("http://x/api/admin/notifications/audience?channel=sms"));
    expect(res.status).toBe(400);
  });

  it("lists sends and names the member of a one-person send", async () => {
    db.$queryRaw.mockResolvedValue([
      { title: "t", body: "b", sentAt: new Date(), recipients: 120, read: 30, userId: "u1" },
      { title: "x", body: "y", sentAt: new Date(), recipients: 1, read: 0, userId: "u2" },
    ]);
    db.user.findMany.mockResolvedValue([{ id: "u2", firstName: "سارة", lastName: "أ" }]);
    const { sends } = await (await listNotifications(new Request("http://x/api/admin/notifications"))).json();
    expect(sends[0]).toMatchObject({ recipients: 120, read: 30, user: null });
    expect(sends[1].user.id).toBe("u2");
    expect(sends[0].userId).toBeUndefined();
  });
});

describe("polls list", () => {
  it("reports test votes apart, so Delete follows the API rule", async () => {
    db.poll.findMany.mockResolvedValue([{ id: "p1" }, { id: "p2" }]);
    db.pollVote.groupBy.mockImplementation(async (args: { where?: object }) =>
      args.where ? [] : [{ pollId: "p1", _count: { _all: 2 } }],
    );
    db.pollVote.aggregate.mockResolvedValue({ _sum: { rewardCredits: 0 } });
    const { polls } = await (await listPolls()).json();
    expect(polls[0]).toMatchObject({ id: "p1", votes: 0, allVotes: 2 });
    expect(polls[1]).toMatchObject({ id: "p2", votes: 0, allVotes: 0 });
  });
});

describe("fmtLeft", () => {
  const now = new Date("2026-11-05T10:00:00Z");
  const later = (min: number) => new Date(now.getTime() + min * 60000);
  it("reads minutes, hours, then days", () => {
    expect(fmtLeft(later(20), now)).toBe("in 20 min");
    expect(fmtLeft(later(300), now)).toBe("in 5 h");
    expect(fmtLeft(later(60 * 72), now)).toBe("in 3 d");
  });
  it("handles a passed or missing deadline", () => {
    expect(fmtLeft(later(-5), now)).toBe("expired");
    expect(fmtLeft(null, now)).toBe("—");
  });
});
