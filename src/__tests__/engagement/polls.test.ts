import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

const db = vi.hoisted(() => ({
  poll: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  pollVote: { findFirst: vi.fn(), create: vi.fn(), groupBy: vi.fn() },
  user: { update: vi.fn() },
  $transaction: vi.fn(),
}));
const SETTINGS: Record<string, string> = { poll_round_days: "3", poll_reward_credits: "1", engagement_polls_enabled: "true" };
const settings = vi.hoisted(() => ({ getSetting: vi.fn() }));
const credits = vi.hoisted(() => ({ recordCredit: vi.fn() }));
const alert = vi.hoisted(() => ({ sendAdminAlert: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/settings", () => settings);
vi.mock("@/lib/credits", () => credits);
vi.mock("@/lib/admin-alert", () => alert);

import {
  PollError,
  buildResults,
  castVote,
  nextPollSlug,
  pollRewardCredits,
  pollRoundDays,
  publicView,
  rotatePollsIfDue,
  runPollRotation,
  tallyPoll,
} from "@/lib/engagement/polls";
import { MIN_POLL_RESULTS, percentsOf, pollShareUrl } from "@/lib/engagement/poll-types";

const OPTIONS = [
  { id: "o1", label: "تعارف عائلي" },
  { id: "o2", label: "محادثة أولاً" },
];
type Row = Parameters<typeof publicView>[0];
const poll = (over: Partial<Row> = {}): Row => ({ id: "p1", slug: "2026-10-27", country: "JO", question: "سؤال؟", options: OPTIONS, note: null, status: "ACTIVE", endsAt: null, ...over });
const group = (optionId: string, n: number, gender: string | null = null, source = "page") => ({ optionId, gender, source, _count: { _all: n } });

beforeEach(() => {
  vi.clearAllMocks();
  settings.getSetting.mockImplementation(async (k: string) => SETTINGS[k] ?? "");
  db.pollVote.findFirst.mockResolvedValue(null);
  db.pollVote.groupBy.mockResolvedValue([]);
  db.pollVote.create.mockResolvedValue({ id: "v1" });
  db.$transaction.mockImplementation(async (fn: unknown) => (typeof fn === "function" ? fn(db) : Promise.all(fn as Promise<unknown>[])));
});

describe("percentsOf", () => {
  it("adds up to exactly 100", () => {
    const p = percentsOf({ a: 1, b: 1, c: 1 }, ["a", "b", "c"]);
    expect(p.a + p.b + p.c).toBe(100);
  });
  it("is all zero with no votes", () => {
    expect(percentsOf({}, ["a", "b"])).toEqual({ a: 0, b: 0 });
  });
});

describe("pollShareUrl", () => {
  it("tags the link for Instagram", () => {
    expect(pollShareUrl("https://naseebak.com/")).toBe(
      "https://naseebak.com/poll?utm_source=instagram&utm_medium=story&utm_campaign=naseebak_question",
    );
  });
});

describe("settings", () => {
  it("defaults to 3 days and 1 credit, and keeps values in range", async () => {
    expect(await pollRoundDays()).toBe(3);
    expect(await pollRewardCredits()).toBe(1);
    settings.getSetting.mockImplementation(async (k: string) => ({ poll_round_days: "0", poll_reward_credits: "99" })[k] ?? "");
    expect(await pollRoundDays()).toBe(1);
    expect(await pollRewardCredits()).toBe(5);
    settings.getSetting.mockImplementation(async () => "x");
    expect(await pollRoundDays()).toBe(3);
    expect(await pollRewardCredits()).toBe(1);
  });
});

describe("castVote", () => {
  it("records a member vote with the gender and gives the reward with the vote", async () => {
    db.poll.findUnique.mockResolvedValue(poll());
    const r = await castVote({ pollId: "p1", optionId: "o1", userId: "u1", gender: "FEMALE", visitorKey: "v", source: "dashboard", reward: 1 });
    expect(r).toMatchObject({ vote: { optionId: "o1", rewardCredits: 1 }, created: true });
    expect(db.pollVote.create).toHaveBeenCalledWith({
      data: { pollId: "p1", optionId: "o1", userId: "u1", visitorKey: null, gender: "FEMALE", source: "dashboard", rewardCredits: 1 },
    });
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { matchCredits: { increment: 1 } } });
    expect(credits.recordCredit).toHaveBeenCalledWith({ userId: "u1", delta: 1, reason: "POLL_REWARD", refId: "v1" }, db);
  });

  it("never rewards a visitor, nor a repeat answer", async () => {
    db.poll.findUnique.mockResolvedValue(poll());
    await castVote({ pollId: "p1", optionId: "o1", visitorKey: "v", source: "page", reward: 1 });
    expect(db.pollVote.create).toHaveBeenCalledWith({ data: expect.objectContaining({ rewardCredits: 0, userId: null }) });
    expect(db.user.update).not.toHaveBeenCalled();

    db.pollVote.findFirst.mockResolvedValue({ optionId: "o1", rewardCredits: 1 });
    const again = await castVote({ pollId: "p1", optionId: "o2", userId: "u1", source: "dashboard", reward: 1 });
    expect(again).toMatchObject({ vote: { optionId: "o1", rewardCredits: 1 }, created: false });
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("gives nothing when the reward is off", async () => {
    db.poll.findUnique.mockResolvedValue(poll());
    await castVote({ pollId: "p1", optionId: "o1", userId: "u1", source: "dashboard", reward: 0 });
    expect(db.user.update).not.toHaveBeenCalled();
    expect(credits.recordCredit).not.toHaveBeenCalled();
  });

  it("keeps the first vote (votes are final)", async () => {
    db.poll.findUnique.mockResolvedValue(poll());
    db.pollVote.findFirst.mockResolvedValue({ optionId: "o2", rewardCredits: 0 });
    const r = await castVote({ pollId: "p1", optionId: "o1", visitorKey: "v", source: "page" });
    expect(r).toMatchObject({ vote: { optionId: "o2" }, created: false });
    expect(db.pollVote.create).not.toHaveBeenCalled();
  });

  it("refuses drafts, closed polls and unknown options", async () => {
    db.poll.findUnique.mockResolvedValue(poll({ status: "DRAFT" }));
    await expect(castVote({ pollId: "p1", optionId: "o1", visitorKey: "v", source: "page" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    db.poll.findUnique.mockResolvedValue(poll({ status: "CLOSED" }));
    await expect(castVote({ pollId: "p1", optionId: "o1", visitorKey: "v", source: "page" })).rejects.toMatchObject({ code: "CLOSED" });
    db.poll.findUnique.mockResolvedValue(poll());
    await expect(castVote({ pollId: "p1", optionId: "o9", visitorKey: "v", source: "page" })).rejects.toBeInstanceOf(PollError);
  });

  it("returns the winning vote when two taps race (one reward)", async () => {
    db.poll.findUnique.mockResolvedValue(poll());
    db.pollVote.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" }));
    db.pollVote.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ optionId: "o1", rewardCredits: 1 });
    const r = await castVote({ pollId: "p1", optionId: "o1", userId: "u1", source: "dashboard", reward: 1 });
    expect(r).toMatchObject({ vote: { optionId: "o1", rewardCredits: 1 }, created: false });
    expect(db.user.update).not.toHaveBeenCalled();
  });
});

describe("results", () => {
  it("leaves test-account votes out of the tally query", async () => {
    await tallyPoll("p1");
    expect(db.pollVote.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: { pollId: "p1", source: { not: "test" } } }));
  });

  it("hides results before voting, and below the minimum after", async () => {
    const before = await publicView(poll(), null, 1);
    expect(before.results).toBeNull();
    expect(before.offerCredits).toBe(1);
    db.pollVote.groupBy.mockResolvedValue([group("o1", 3)]);
    const v = await publicView(poll(), { optionId: "o1", rewardCredits: 0 });
    expect(v.results).toBeNull();
    expect(v.votesNeeded).toBe(MIN_POLL_RESULTS - 3);
  });

  it("shows percentages from the minimum, and the women/men split only when both groups are big enough", async () => {
    db.pollVote.groupBy.mockResolvedValue([group("o1", 12, "FEMALE"), group("o2", 3, null)]);
    const v = await publicView(poll(), { optionId: "o1", rewardCredits: 1 }, 1);
    expect(v.rewardCredits).toBe(1);
    expect(v.offerCredits).toBe(0);
    expect(v.results).toMatchObject({ total: 15, percents: { o1: 80, o2: 20 }, split: null });

    const both = buildResults(
      { all: { o1: 20, o2: 10 }, women: { o1: 8, o2: 2 }, men: { o1: 6, o2: 4 }, members: {}, instagram: {} },
      OPTIONS,
    );
    expect(both.split).toEqual({ women: { o1: 80, o2: 20 }, men: { o1: 60, o2: 40 } });
  });

  it("shows a closed poll's results without a vote, and offers nothing on it", async () => {
    db.pollVote.groupBy.mockResolvedValue([group("o1", 10)]);
    const v = await publicView(poll({ status: "CLOSED" }), null, 1);
    expect(v.results?.total).toBe(10);
    expect(v.offerCredits).toBe(0);
  });
});

describe("rotation every poll_round_days", () => {
  const NOW = new Date("2026-10-30T09:00:00Z");

  it("does nothing before the end time", async () => {
    db.poll.findFirst.mockResolvedValueOnce({ id: "a", endsAt: new Date("2026-10-31T09:00:00Z") });
    expect(await rotatePollsIfDue("JO", NOW)).toEqual({ rotated: false, queueEmpty: false });
    expect(db.poll.updateMany).not.toHaveBeenCalled();
  });

  it("closes the due question and starts the oldest draft for 3 days", async () => {
    db.poll.findFirst.mockResolvedValueOnce({ id: "a", endsAt: new Date("2026-10-30T08:00:00Z") }).mockResolvedValueOnce({ id: "b" });
    db.poll.updateMany.mockResolvedValue({ count: 1 });
    expect(await rotatePollsIfDue("JO", NOW)).toEqual({ rotated: true, queueEmpty: false });
    expect(db.poll.findFirst).toHaveBeenLastCalledWith({ where: { status: "DRAFT", country: "JO" }, orderBy: { createdAt: "asc" }, select: { id: true } });
    expect(db.poll.updateMany).toHaveBeenNthCalledWith(1, { where: { id: "a", status: "ACTIVE" }, data: { status: "CLOSED", closedAt: NOW } });
    expect(db.poll.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: "b", status: "DRAFT" },
      data: { status: "ACTIVE", startedAt: NOW, endsAt: new Date("2026-11-02T09:00:00Z"), closedAt: null },
    });
  });

  it("keeps the question running when the queue is empty, and the daily job alerts the admins", async () => {
    db.poll.findFirst.mockResolvedValueOnce({ id: "a", endsAt: new Date("2026-10-30T08:00:00Z") }).mockResolvedValueOnce(null);
    expect(await rotatePollsIfDue("JO", NOW)).toEqual({ rotated: false, queueEmpty: true });
    expect(db.poll.updateMany).not.toHaveBeenCalled();

    db.poll.findFirst
      .mockResolvedValueOnce({ id: "a", endsAt: new Date("2026-10-30T08:00:00Z") })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ endsAt: new Date("2026-10-30T08:00:00Z") });
    expect(await runPollRotation(NOW)).toEqual({ rotated: 0, queueEmpty: 1 });
    expect(alert.sendAdminAlert).toHaveBeenCalledTimes(1);
  });

  it("a second request at the same moment rotates nothing more", async () => {
    db.poll.findFirst.mockResolvedValueOnce({ id: "a", endsAt: new Date("2026-10-30T08:00:00Z") }).mockResolvedValueOnce({ id: "b" });
    db.poll.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await rotatePollsIfDue("JO", NOW)).toEqual({ rotated: false, queueEmpty: false });
    expect(db.poll.updateMany).toHaveBeenCalledTimes(1);
  });
});

describe("nextPollSlug", () => {
  it("uses the Amman day, then a counter", async () => {
    const now = new Date("2026-10-26T22:30:00Z"); // 27 Oct in Amman
    db.poll.findMany.mockResolvedValue([]);
    expect(await nextPollSlug(now)).toBe("2026-10-27");
    db.poll.findMany.mockResolvedValue([{ slug: "2026-10-27" }, { slug: "2026-10-27-2" }]);
    expect(await nextPollSlug(now)).toBe("2026-10-27-3");
  });
});
