import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  poll: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  pollVote: { findFirst: vi.fn() },
  countrySetting: { findMany: vi.fn() },
  $transaction: vi.fn(),
}));
const alert = vi.hoisted(() => ({ sendAdminAlert: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/admin-alert", () => alert);
vi.mock("@/lib/credits", () => ({ recordCredit: vi.fn() }));
vi.mock("@/lib/settings", () => ({ getSetting: async (k: string) => (k === "engagement_polls_enabled" ? "true" : "3") }));

import { PollError, activatePoll, castVote, getActivePoll, getPublishedPoll, nextQueuedPoll, pollCountries, rotatePollsIfDue, runPollRotation } from "@/lib/engagement/polls";
import { clearCountrySettingsCache, defaultCountrySettings } from "@/lib/countries/settings";
import { absoluteUrl, localizedPath, switchCountryPath } from "@/lib/site-paths";
import { pollShareUrl } from "@/lib/engagement/poll-types";
import { pollInputSchema } from "@/lib/validations/poll";

const NOW = new Date("2026-11-07T10:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  clearCountrySettingsCache();
  db.poll.findFirst.mockResolvedValue(null);
  db.poll.updateMany.mockResolvedValue({ count: 1 });
  db.countrySetting.findMany.mockResolvedValue([{ ...defaultCountrySettings("SA"), active: true }]);
  db.$transaction.mockResolvedValue([]);
});

describe("questions per country", () => {
  it("the running question is the country's own", async () => {
    await getActivePoll("SA", NOW);
    for (const [args] of db.poll.findFirst.mock.calls) expect(args.where.country).toBe("SA");
  });

  it("a question opens only in its own country", async () => {
    await getPublishedPoll("2026-11-07", "SA");
    expect(db.poll.findFirst.mock.calls.at(-1)![0].where).toMatchObject({ slug: "2026-11-07", country: "SA" });
  });

  it("the queue is the country's own", async () => {
    await nextQueuedPoll("SA");
    expect(db.poll.findFirst.mock.calls[0][0].where).toEqual({ status: "DRAFT", country: "SA" });
  });

  it("rotating one country leaves the other's question running", async () => {
    db.poll.findFirst
      .mockResolvedValueOnce({ id: "sa-old", endsAt: new Date(NOW.getTime() - 1000) })
      .mockResolvedValueOnce({ id: "sa-next" });
    expect(await rotatePollsIfDue("SA", NOW)).toEqual({ rotated: true, queueEmpty: false });
    expect(db.poll.updateMany.mock.calls.map(([a]) => a.where.id)).toEqual(["sa-old", "sa-next"]);
    expect(db.poll.findFirst.mock.calls[0][0].where).toEqual({ status: "ACTIVE", country: "SA" });
  });

  it("a country with nothing running starts its oldest draft", async () => {
    db.poll.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "sa-first" });
    expect(await rotatePollsIfDue("SA", NOW)).toEqual({ rotated: true, queueEmpty: false });
    expect(db.poll.updateMany).toHaveBeenCalledTimes(1);
    expect(db.poll.updateMany.mock.calls[0][0].where).toEqual({ id: "sa-first", status: "DRAFT" });
  });

  it("a country with nothing running and nothing queued stays quiet", async () => {
    expect(await rotatePollsIfDue("SA", NOW)).toEqual({ rotated: false, queueEmpty: false });
  });

  it("nobody votes on a question of a country with the question switched off", async () => {
    db.countrySetting.findMany.mockResolvedValue([{ ...defaultCountrySettings("SA"), active: true, pollsEnabled: false }]);
    db.poll.findUnique.mockResolvedValue({ id: "p", country: "SA", status: "ACTIVE", options: [{ id: "o1", label: "أ" }] });
    await expect(castVote({ pollId: "p", optionId: "o1", visitorKey: "k", source: "page" })).rejects.toBeInstanceOf(PollError);
  });

  it("only countries with a running question are advertised", async () => {
    db.poll.findMany.mockResolvedValue([{ country: "JO" }]);
    expect(await pollCountries()).toEqual(["JO"]);
  });

  it("starting a question closes only its own country's running one", async () => {
    await activatePoll("p2", "SA", NOW);
    expect(db.poll.updateMany.mock.calls[0][0].where).toMatchObject({ status: "ACTIVE", country: "SA" });
  });

  it("an empty queue alerts that country's admins", async () => {
    db.poll.findFirst.mockImplementation(async ({ where }) =>
      where.status === "ACTIVE" && where.country === "SA" ? { id: "s", endsAt: new Date(NOW.getTime() - 1) } : null,
    );
    await runPollRotation(NOW);
    expect(alert.sendAdminAlert).toHaveBeenCalledTimes(1);
    expect(alert.sendAdminAlert.mock.calls[0][2]).toEqual({ country: "SA" });
  });

  it("a member can't vote on another country's question", async () => {
    db.poll.findUnique.mockResolvedValue({ id: "p", country: "JO", status: "ACTIVE", options: [{ id: "o1", label: "أ" }] });
    await expect(castVote({ pollId: "p", optionId: "o1", userId: "u", source: "dashboard", country: "SA" })).rejects.toBeInstanceOf(PollError);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("the admin form takes a country", () => {
    const input = { question: "سؤال؟", options: ["أ", "ب"], country: "SA" };
    expect(pollInputSchema.parse(input).country).toBe("SA");
    expect(pollInputSchema.safeParse({ ...input, country: "EG" }).success).toBe(false);
  });
});

describe("poll URLs per country", () => {
  it("has Saudi URLs for the page and each question", () => {
    expect(localizedPath("/poll", "SA")).toBe("/sa/poll");
    expect(absoluteUrl("/poll/2026-11-07", "SA")).toBe("https://naseebak.com/sa/poll/2026-11-07");
    expect(pollShareUrl("https://naseebak.com", "x", "post", "SA")).toContain("https://naseebak.com/sa/poll/x?");
  });

  it("the country menu goes to the other country's current question", () => {
    expect(switchCountryPath("/poll/2026-11-07", "SA")).toBe("/sa/poll");
  });
});
