/**
 * Automatic suggestions: a user starts receiving suggestions as soon as their profile
 * reaches SUGGESTIONS_MIN_COMPLETENESS, without waiting for an admin "Generate" run.
 * Same scoring, minimum score and exclusion rules as /api/admin/suggestions/generate.
 *
 * Limits per mode: legacy tops up to 3 only when nothing is pending (score >= 30); per-request mode
 * adds the weekly cap (WEEKLY_FREE_SUGGESTIONS per rolling 7 days). Credit-on-interest (switch
 * `credit_on_interest`) has no weekly cap: a person holds at most MAX_OPEN_SUGGESTIONS (5) undecided
 * suggestions (a MUTUAL row counts for both sides), topped up on page open / profile save, after a
 * decision and when a suggestion expires; candidates already holding 5 are skipped; minimum score is
 * `minSuggestionScore()` (50 provisional, 30 otherwise); `emptyReason` is `pending` (5 open) or
 * `no_candidates`, never `weekly_cap`.
 */
import { db } from "@/lib/db";
import { calculateCompatibility, mutuallyAcceptable } from "@/lib/matching/score";
import { meetsSuggestionGate } from "@/lib/profile-completeness";
import { sendPushNotification } from "@/lib/onesignal";
import { notifyCreditsExhausted, recordCredit, refundCredits, reserveCredits, WEEKLY_FREE_SUGGESTIONS } from "@/lib/credits";
import { getCycleFlags, type CycleFlags } from "@/lib/settings";
import { notify, notifyMany } from "@/lib/notify";
import { MUTUAL_SUGGESTION_MS, openMutualWhere } from "@/lib/suggestions/mutual";
import { activeWhere, isActive } from "@/lib/activity";

const MAX_NEW_SUGGESTIONS = 3;
const MIN_SCORE = 30;
/** Credit-on-interest: a person holds at most this many undecided suggestions (replaces the weekly cap) */
export const MAX_OPEN_SUGGESTIONS = 5;
const MIN_SCORE_CREDIT_ON_INTEREST = 50;
// When a run finds no suitable candidate, wait before scanning again (per user, per server process)
const RETRY_COOLDOWN_MS = 30 * 60 * 1000;
const lastEmptyRun = new Map<string, number>();
const inFlight = new Map<string, Promise<SuggestOutcome>>();
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Why a run created nothing (null: created some, or the user isn't eligible at all). */
export type SuggestEmptyReason = "weekly_cap" | "no_candidates" | "pending";
export interface SuggestOutcome {
  created: number;
  reason: SuggestEmptyReason | null;
}
const outcome = (created: number, reason: SuggestEmptyReason | null = null): SuggestOutcome => ({ created, reason });

/** Lowest compatibility score that may be suggested (credit-on-interest raises it, since an "interested" costs a credit). */
export function minSuggestionScore(flags: CycleFlags): number {
  return flags.creditOnInterest ? MIN_SCORE_CREDIT_ON_INTEREST : MIN_SCORE;
}

/** Suggestions waiting for this user's decision: MUTUAL rows they haven't decided on (either side) + legacy PENDING. */
export async function openSuggestionCount(userId: string): Promise<number> {
  const [mutual, legacy] = await Promise.all([
    db.suggestion.count({ where: openMutualWhere(userId) }),
    db.suggestion.count({ where: { recipientId: userId, status: "PENDING", flow: "LEGACY" } }),
  ]);
  return mutual + legacy;
}

/** openSuggestionCount for many users at once (users with none are absent from the map). */
export async function openCounts(userIds: string[]): Promise<Map<string, number>> {
  const now = new Date();
  const open = { flow: "MUTUAL" as const, status: "PENDING" as const, expiresAt: { gt: now } };
  const [asRecipient, asCandidate, legacy] = await Promise.all([
    db.suggestion.groupBy({
      by: ["recipientId"],
      // Same as openMutualWhere: a partner who left doesn't fill a slot
      where: { ...open, recipientId: { in: userIds }, recipientDecision: null, candidate: { isDeactivated: false, status: { not: "SUSPENDED" } } },
      _count: true,
    }),
    db.suggestion.groupBy({
      by: ["candidateId"],
      where: { ...open, candidateId: { in: userIds }, candidateDecision: null, recipient: { isDeactivated: false, status: { not: "SUSPENDED" } } },
      _count: true,
    }),
    db.suggestion.groupBy({
      by: ["recipientId"],
      where: { recipientId: { in: userIds }, status: "PENDING", flow: "LEGACY" },
      _count: true,
    }),
  ]);
  const counts = new Map<string, number>();
  for (const r of [...asRecipient, ...legacy]) counts.set(r.recipientId, (counts.get(r.recipientId) ?? 0) + r._count);
  for (const r of asCandidate) counts.set(r.candidateId, (counts.get(r.candidateId) ?? 0) + r._count);
  return counts;
}

const scoringSelect = {
  id: true,
  gender: true,
  profile: true,
  personalityResult: { select: { vector: true, personalityType: true } },
  photos: { select: { id: true } },
  identityDoc: { select: { status: true } },
  parentInfo: { select: { id: true, parentName: true } },
} as const;

/**
 * Create up to 3 new suggestions for `userId` (as recipient) when they have none pending.
 * Returns the number of suggestions created. Never throws for "nothing to do" cases.
 */
export function autoSuggestForUser(userId: string): Promise<number> {
  return shared(userId).then((o) => o.created);
}

/**
 * Same run as autoSuggestForUser, plus why nothing was created (for the suggestions page empty state)
 * and, at the weekly cap, when the next suggestions can arrive.
 */
export async function autoSuggestWithReason(
  userId: string
): Promise<SuggestOutcome & { nextSuggestionsAt: Date | null }> {
  const o = await shared(userId);
  const nextSuggestionsAt = o.reason === "weekly_cap" ? await nextSuggestionsAtFor(userId) : null;
  return { ...o, nextSuggestionsAt };
}

function shared(userId: string): Promise<SuggestOutcome> {
  // Concurrent requests for the same user share one run (avoids duplicate notifications)
  const running = inFlight.get(userId);
  if (running) return running;
  const run = generate(userId).finally(() => inFlight.delete(userId));
  inFlight.set(userId, run);
  return run;
}

/** When the oldest suggestion of the rolling 7-day window ages out (a free slot opens). */
export async function nextSuggestionsAtFor(userId: string, now = new Date()): Promise<Date | null> {
  const { mutualSuggestions: mutual, creditOnInterest } = await getCycleFlags();
  // Credit-on-interest has no weekly cap, so there is no "next suggestions" date
  if (creditOnInterest) return null;
  const weekAgo = new Date(now.getTime() - WEEK_MS);
  const oldest = await db.suggestion.findFirst({
    where: mutual
      ? { OR: [{ recipientId: userId }, { candidateId: userId }], createdAt: { gte: weekAgo } }
      : { recipientId: userId, createdAt: { gte: weekAgo } },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });
  return oldest ? new Date(oldest.createdAt.getTime() + WEEK_MS) : null;
}

async function generate(userId: string): Promise<SuggestOutcome> {
  const last = lastEmptyRun.get(userId);
  if (last && Date.now() - last < RETRY_COOLDOWN_MS) return outcome(0, "no_candidates");

  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      ...scoringSelect,
      role: true,
      isDeactivated: true,
      status: true,
      matchCredits: true,
      isFlagged: true,
      lastActiveAt: true,
      updatedAt: true,
    },
  });
  if (!user || user.role !== "USER" || user.isDeactivated || !user.profile?.isComplete) return outcome(0);
  if (user.status === "SUSPENDED") return outcome(0);
  // Flagged (3+ reports, or by an admin): no new automatic suggestions until an admin clears the flag.
  // Existing suggestions and matches are left as they are.
  if (user.isFlagged) return outcome(0);
  // Idle 30+ days: nothing new is generated; they get suggestions lazily when they come back
  if (!isActive(user)) return outcome(0);
  // Per-request mode: suggestions are free (capped weekly); credits are spent on intro requests.
  // Legacy mode: each suggestion uses 1 credit — none left means the user must recharge.
  // Simultaneous flow: one row shown to both people, dealbreakers are hard filters
  const flags = await getCycleFlags();
  const { introRequests: perRequestCredits, mutualSuggestions: mutual, creditOnInterest } = flags;
  if (!perRequestCredits && user.matchCredits <= 0) return outcome(0);
  if (!meetsSuggestionGate(user, perRequestCredits)) return outcome(0);

  // Only top up when the user has nothing waiting
  // (credit-on-interest: top up to MAX_OPEN_SUGGESTIONS instead, with no weekly cap)
  const weekAgo = new Date(Date.now() - WEEK_MS);
  let limit = Math.min(MAX_NEW_SUGGESTIONS, user.matchCredits);
  if (creditOnInterest) {
    const open = await openSuggestionCount(userId);
    limit = MAX_OPEN_SUGGESTIONS - open;
    if (limit <= 0) return outcome(0, "pending");
  } else {
    const pending = mutual
      ? await openSuggestionCount(userId)
      : await db.suggestion.count({ where: { recipientId: userId, status: "PENDING" } });
    if (pending > 0) return outcome(0, "pending");
  }
  if (perRequestCredits && !creditOnInterest) {
    // Both people see a MUTUAL row, so it counts on either side
    const thisWeek = await db.suggestion.count({
      where: mutual
        ? { OR: [{ recipientId: userId }, { candidateId: userId }], createdAt: { gte: weekAgo } }
        : { recipientId: userId, createdAt: { gte: weekAgo } },
    });
    limit = Math.min(MAX_NEW_SUGGESTIONS, WEEKLY_FREE_SUGGESTIONS - thisWeek);
    if (limit <= 0) return outcome(0, "weekly_cap");
  }

  const [suggested, matches, blocks] = await Promise.all([
    db.suggestion.findMany({
      where: { OR: [{ recipientId: userId }, { candidateId: userId }] },
      select: { recipientId: true, candidateId: true },
    }),
    db.mutualMatch.findMany({
      where: { OR: [{ femaleId: userId }, { maleId: userId }] },
      select: { femaleId: true, maleId: true },
    }),
    db.block.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      select: { blockerId: true, blockedId: true },
    }),
  ]);
  const excluded = new Set<string>([
    ...suggested.flatMap((s) => [s.recipientId, s.candidateId]),
    ...matches.flatMap((m) => [m.femaleId, m.maleId]),
    ...blocks.flatMap((b) => [b.blockerId, b.blockedId]),
  ]);
  excluded.delete(userId);

  const candidates = await db.user.findMany({
    where: {
      role: "USER",
      isDeactivated: false,
      status: { not: "SUSPENDED" },
      isFlagged: false,
      // Idle 30+ days (COALESCE(lastActiveAt, updatedAt)): not suggested to anyone until they return
      ...activeWhere(),
      gender: user.gender === "MALE" ? "FEMALE" : "MALE",
      profile: { isComplete: true },
      ...(excluded.size > 0 && { id: { notIn: [...excluded] } }),
    },
    select: scoringSelect,
  });

  let ranked = candidates
    .filter((c) => meetsSuggestionGate(c, perRequestCredits))
    .filter((c) => !mutual || mutuallyAcceptable(user, c))
    .map((c) => ({ candidate: c, score: calculateCompatibility(user, c) }))
    .filter(({ score }) => score >= minSuggestionScore(flags))
    .sort((a, b) => b.score - a.score);
  if (mutual && ranked.length > 0) {
    // Skip people who already got their share, so popular profiles aren't flooded
    const ids = ranked.map((r) => r.candidate.id);
    if (creditOnInterest) {
      const busy = await openCounts(ids);
      ranked = ranked.filter((r) => (busy.get(r.candidate.id) ?? 0) < MAX_OPEN_SUGGESTIONS);
    } else {
      const busy = await weeklyCounts(ids, weekAgo);
      ranked = ranked.filter((r) => (busy.get(r.candidate.id) ?? 0) < WEEKLY_FREE_SUGGESTIONS);
    }
  }
  const top = ranked.slice(0, limit);

  if (top.length === 0) {
    lastEmptyRun.set(userId, Date.now());
    return outcome(0, "no_candidates");
  }
  lastEmptyRun.delete(userId);

  // Take the credits first (atomic), then create; unused credits are given back
  if (!perRequestCredits && !(await reserveCredits(userId, top.length))) return outcome(0);

  const created = await db.suggestion.createMany({
    data: top.map(({ candidate, score }) => ({
      recipientId: userId,
      candidateId: candidate.id,
      compatibilityScore: score,
      source: "AI" as const,
      ...(mutual && { flow: "MUTUAL" as const, expiresAt: new Date(Date.now() + MUTUAL_SUGGESTION_MS) }),
    })),
    skipDuplicates: true,
  });
  if (!perRequestCredits) {
    await refundCredits(userId, top.length - created.count);
    await recordCredit({ userId, delta: -created.count, reason: "SUGGESTION", note: "Automatic suggestions" });
  }
  if (created.count === 0) return outcome(0);

  const title = "اقتراحات توافق جديدة";
  const body =
    created.count === 1
      ? "وصلك اقتراح توافق جديد. قم بمراجعته."
      : `وصلك ${created.count} اقتراحات توافق جديدة. قم بمراجعتها.`;
  if (mutual) {
    await notify({ userId, type: "SUGGESTION", title, body, url: "/dashboard/suggestions" });
    // The other people see the same suggestion
    const created = await db.suggestion.findMany({
      where: { recipientId: userId, flow: "MUTUAL", candidateId: { in: top.map((t) => t.candidate.id) } },
      select: { candidateId: true },
    });
    await notifyMany(created.map((c) => c.candidateId), {
      type: "SUGGESTION",
      title: "اقتراح توافق جديد",
      body: "وصلك اقتراح توافق جديد. قم بمراجعته.",
      url: "/dashboard/suggestions",
    });
  } else {
    await db.notification.create({ data: { userId, type: "SUGGESTION", title, body } });
    sendPushNotification({ userId, title, body, url: "/dashboard/suggestions" });
  }

  if (!perRequestCredits && user.matchCredits - created.count <= 0) await notifyCreditsExhausted(userId);

  return outcome(created.count);
}

/** Suggestions per user (either side) since `since`, for the given users. */
export async function weeklyCounts(userIds: string[], since: Date): Promise<Map<string, number>> {
  const [asRecipient, asCandidate] = await Promise.all([
    db.suggestion.groupBy({
      by: ["recipientId"],
      where: { recipientId: { in: userIds }, createdAt: { gte: since } },
      _count: true,
    }),
    db.suggestion.groupBy({
      by: ["candidateId"],
      where: { candidateId: { in: userIds }, createdAt: { gte: since } },
      _count: true,
    }),
  ]);
  const counts = new Map<string, number>();
  for (const r of asRecipient) counts.set(r.recipientId, (counts.get(r.recipientId) ?? 0) + r._count);
  for (const r of asCandidate) counts.set(r.candidateId, (counts.get(r.candidateId) ?? 0) + r._count);
  return counts;
}
