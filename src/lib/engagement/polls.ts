// «سؤال نصيبك» (switch engagement_polls_enabled): one question asked on Instagram, on the public page /poll and
// on the dashboard home. A new question every poll_round_days (3): queued drafts go live oldest first, lazily and from
// the daily job. One vote per member or per visitor browser, final. A member's answer earns poll_reward_credits (1),
// once per question, in the same transaction as the vote. Test accounts vote and earn but are never counted.
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { recordCredit } from "@/lib/credits";
import { sendAdminAlert } from "@/lib/admin-alert";
import {
  MIN_GENDER_RESULTS,
  MIN_POLL_RESULTS,
  percentsOf,
  type PollOption,
  type PollResults,
  type PollSource,
  type PollStatusValue,
  type PublicPoll,
} from "@/lib/engagement/poll-types";

export const POLLS_SETTING = "engagement_polls_enabled";
export const ROUND_DAYS_SETTING = "poll_round_days";
export const REWARD_SETTING = "poll_reward_credits";
/** Source of votes left out of every count (test accounts) */
export const TEST_SOURCE = "test";
const DAY = 24 * 60 * 60 * 1000;

export async function pollsEnabled(): Promise<boolean> {
  return (await getSetting(POLLS_SETTING)) === "true";
}

const intSetting = async (key: string, fallback: number, max: number) => {
  const n = Number.parseInt(await getSetting(key), 10);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : fallback;
};
/** Days each question runs before the next queued one replaces it (1–30) */
export const pollRoundDays = async () => Math.max(1, await intSetting(ROUND_DAYS_SETTING, 3, 30));
/** Credits a member gets for answering a question (0 = off, at most 5) */
export const pollRewardCredits = () => intSetting(REWARD_SETTING, 1, 5);

const POLL_SELECT = { id: true, slug: true, question: true, options: true, note: true, status: true, endsAt: true } as const;
type PollRow = { id: string; slug: string; question: string; options: Prisma.JsonValue; note: string | null; status: PollStatusValue; endsAt: Date | null };

export function parseOptions(json: Prisma.JsonValue): PollOption[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((o) =>
    o && typeof o === "object" && !Array.isArray(o) && typeof o.id === "string" && typeof o.label === "string"
      ? [{ id: o.id, label: o.label }]
      : [],
  );
}

export function visitorKeyOf(cookieValue: string): string {
  return createHash("sha256").update(`poll-visitor:${cookieValue}`).digest("hex");
}

/** The next question in the queue: the oldest draft */
export function nextQueuedPoll() {
  return db.poll.findFirst({ where: { status: "DRAFT" }, orderBy: { createdAt: "asc" }, select: { id: true } });
}

/**
 * When the running question's time is up and a draft is queued: close it and start the draft (claimed with
 * conditional updates, so two requests at once rotate once). With nothing queued the question keeps running.
 */
export async function rotatePollsIfDue(now = new Date()): Promise<{ rotated: boolean; queueEmpty: boolean }> {
  const active = await db.poll.findFirst({ where: { status: "ACTIVE" }, select: { id: true, endsAt: true } });
  if (!active?.endsAt || active.endsAt > now) return { rotated: false, queueEmpty: false };
  const next = await nextQueuedPoll();
  if (!next) return { rotated: false, queueEmpty: true };
  const closed = await db.poll.updateMany({ where: { id: active.id, status: "ACTIVE" }, data: { status: "CLOSED", closedAt: now } });
  if (closed.count === 0) return { rotated: false, queueEmpty: false };
  const days = await pollRoundDays();
  await db.poll.updateMany({
    where: { id: next.id, status: "DRAFT" },
    data: { status: "ACTIVE", startedAt: now, endsAt: new Date(now.getTime() + days * DAY), closedAt: null },
  });
  return { rotated: true, queueEmpty: false };
}

export async function getActivePoll(now = new Date()): Promise<PollRow | null> {
  await rotatePollsIfDue(now).catch((error) => console.error("[polls] rotation failed:", error));
  return db.poll.findFirst({ where: { status: "ACTIVE" }, orderBy: { startedAt: "desc" }, select: POLL_SELECT });
}

/** A question that has been shown (active or closed); drafts are admin-only */
export async function getPublishedPoll(slug: string): Promise<PollRow | null> {
  await rotatePollsIfDue().catch((error) => console.error("[polls] rotation failed:", error));
  return db.poll.findFirst({ where: { slug, status: { in: ["ACTIVE", "CLOSED"] } }, select: POLL_SELECT });
}

/** Counted votes per option, and members' votes per option by gender */
export async function tallyPoll(pollId: string) {
  const rows = await db.pollVote.groupBy({
    by: ["optionId", "gender", "source"],
    where: { pollId, source: { not: TEST_SOURCE } },
    _count: { _all: true },
  });
  const all: Record<string, number> = {};
  const women: Record<string, number> = {};
  const men: Record<string, number> = {};
  const instagram: Record<string, number> = {};
  const members: Record<string, number> = {};
  for (const r of rows) {
    const n = r._count._all;
    all[r.optionId] = (all[r.optionId] ?? 0) + n;
    if (r.source === "instagram") instagram[r.optionId] = (instagram[r.optionId] ?? 0) + n;
    if (r.gender) members[r.optionId] = (members[r.optionId] ?? 0) + n;
    if (r.gender === "FEMALE") women[r.optionId] = (women[r.optionId] ?? 0) + n;
    if (r.gender === "MALE") men[r.optionId] = (men[r.optionId] ?? 0) + n;
  }
  return { all, women, men, members, instagram };
}

const sum = (c: Record<string, number>) => Object.values(c).reduce((a, b) => a + b, 0);

export function buildResults(tally: Awaited<ReturnType<typeof tallyPoll>>, options: PollOption[]): PollResults {
  const ids = options.map((o) => o.id);
  const splitShown = sum(tally.women) >= MIN_GENDER_RESULTS && sum(tally.men) >= MIN_GENDER_RESULTS;
  return {
    total: sum(tally.all),
    percents: percentsOf(tally.all, ids),
    split: splitShown ? { women: percentsOf(tally.women, ids), men: percentsOf(tally.men, ids) } : null,
  };
}

export type MyVote = { optionId: string; rewardCredits: number } | null;

/**
 * The voter's view: results only after voting (or once closed), and only from MIN_POLL_RESULTS votes.
 * `offer`: credits a member would get for answering (0 for visitors, never shown on public pages).
 */
export async function publicView(poll: PollRow, mine: MyVote, offer = 0): Promise<PublicPoll> {
  const options = parseOptions(poll.options);
  const base = {
    id: poll.id,
    slug: poll.slug,
    question: poll.question,
    options,
    note: poll.note,
    status: poll.status,
    endsAt: poll.status === "ACTIVE" && poll.endsAt ? poll.endsAt.toISOString() : null,
    myVote: mine?.optionId ?? null,
    rewardCredits: mine?.rewardCredits ?? 0,
    offerCredits: mine || poll.status !== "ACTIVE" ? 0 : offer,
  };
  if (!mine && poll.status !== "CLOSED") return { ...base, results: null, votesNeeded: 0 };
  const results = buildResults(await tallyPoll(poll.id), options);
  if (results.total < MIN_POLL_RESULTS) return { ...base, results: null, votesNeeded: MIN_POLL_RESULTS - results.total };
  return { ...base, results, votesNeeded: 0 };
}

export async function findMyVote(pollId: string, who: { userId?: string | null; visitorKey?: string | null }): Promise<MyVote> {
  const or: Prisma.PollVoteWhereInput[] = [];
  if (who.userId) or.push({ userId: who.userId });
  if (who.visitorKey) or.push({ visitorKey: who.visitorKey });
  if (or.length === 0) return null;
  return db.pollVote.findFirst({ where: { pollId, OR: or }, select: { optionId: true, rewardCredits: true } });
}

export class PollError extends Error {
  constructor(public code: "NOT_FOUND" | "CLOSED" | "BAD_OPTION") {
    super(code);
  }
}

/**
 * Records one vote. A second vote by the same member or browser keeps the first one (votes are final) and
 * returns it. A member's first answer earns `reward` credits in the same transaction (balance + ledger), so the
 * one-vote-per-question rule also means one reward per question.
 */
export async function castVote(input: {
  pollId: string;
  optionId: string;
  userId?: string | null;
  gender?: "MALE" | "FEMALE" | null;
  visitorKey?: string | null;
  source: PollSource | typeof TEST_SOURCE;
  reward?: number;
}): Promise<{ poll: PollRow; vote: NonNullable<MyVote>; created: boolean }> {
  const poll = await db.poll.findUnique({ where: { id: input.pollId }, select: POLL_SELECT });
  if (!poll || poll.status === "DRAFT") throw new PollError("NOT_FOUND");
  const existing = await findMyVote(poll.id, input);
  if (existing) return { poll, vote: existing, created: false };
  if (poll.status !== "ACTIVE") throw new PollError("CLOSED");
  if (!parseOptions(poll.options).some((o) => o.id === input.optionId)) throw new PollError("BAD_OPTION");
  const reward = input.userId ? Math.max(0, input.reward ?? 0) : 0;
  try {
    await db.$transaction(async (tx) => {
      const vote = await tx.pollVote.create({
        data: {
          pollId: poll.id,
          optionId: input.optionId,
          userId: input.userId ?? null,
          visitorKey: input.userId ? null : (input.visitorKey ?? null),
          gender: input.userId ? (input.gender ?? null) : null,
          source: input.source,
          rewardCredits: reward,
        },
      });
      if (reward > 0 && input.userId) {
        await tx.user.update({ where: { id: input.userId }, data: { matchCredits: { increment: reward } } });
        await recordCredit({ userId: input.userId, delta: reward, reason: "POLL_REWARD", refId: vote.id }, tx);
      }
    });
    return { poll, vote: { optionId: input.optionId, rewardCredits: reward }, created: true };
  } catch (error) {
    // Two taps at once: the other request won (and got the reward), keep its vote
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const won = await findMyVote(poll.id, input);
      if (won) return { poll, vote: won, created: false };
    }
    throw error;
  }
}

/** Activating a question closes the one running before it; it then runs for poll_round_days */
export async function activatePoll(id: string, now = new Date()): Promise<void> {
  const days = await pollRoundDays();
  await db.$transaction([
    db.poll.updateMany({ where: { status: "ACTIVE", id: { not: id } }, data: { status: "CLOSED", closedAt: now } }),
    db.poll.update({ where: { id }, data: { status: "ACTIVE", startedAt: now, endsAt: new Date(now.getTime() + days * DAY), closedAt: null } }),
  ]);
}

/** URL name from the creation day: 2026-10-27, then 2026-10-27-2 … */
export async function nextPollSlug(now = new Date()): Promise<string> {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Amman" }).format(now);
  const taken = new Set((await db.poll.findMany({ where: { slug: { startsWith: day } }, select: { slug: true } })).map((p) => p.slug));
  if (!taken.has(day)) return day;
  let n = 2;
  while (taken.has(`${day}-${n}`)) n++;
  return `${day}-${n}`;
}

/** Daily job: rotate if due, and tell the admins when the queue is empty and a new question is due within a day */
export async function runPollRotation(now = new Date()): Promise<Record<string, number>> {
  if (!(await pollsEnabled())) return { skipped: 1 };
  const { rotated, queueEmpty } = await rotatePollsIfDue(now);
  const active = await db.poll.findFirst({ where: { status: "ACTIVE" }, select: { endsAt: true } });
  const dueSoon = !!active?.endsAt && active.endsAt.getTime() - now.getTime() < DAY;
  const empty = queueEmpty || (dueSoon && !(await nextQueuedPoll()));
  if (empty) {
    await sendAdminAlert(
      "«سؤال نصيبك»: no question queued",
      "The running question is due to be replaced, but there is no draft in the queue, so it keeps running.\nAdd the next question in Admin → Naseebak Question («Add to queue»; it goes live on its own).",
    );
  }
  return { rotated: rotated ? 1 : 0, queueEmpty: empty ? 1 : 0 };
}
