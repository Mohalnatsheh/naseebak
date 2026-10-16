/**
 * Automatic suggestions: a user starts receiving suggestions as soon as their profile
 * reaches SUGGESTIONS_MIN_COMPLETENESS, without waiting for an admin "Generate" run.
 * Same scoring, minimum score and exclusion rules as /api/admin/suggestions/generate.
 */
import { db } from "@/lib/db";
import { calculateCompatibility, mutuallyAcceptable } from "@/lib/matching/score";
import { calculateCompleteness, SUGGESTIONS_MIN_COMPLETENESS } from "@/lib/profile-completeness";
import { sendPushNotification } from "@/lib/onesignal";
import { notifyCreditsExhausted, recordCredit, refundCredits, reserveCredits, WEEKLY_FREE_SUGGESTIONS } from "@/lib/credits";
import { getCycleFlags } from "@/lib/settings";
import { notify, notifyMany } from "@/lib/notify";
import { MUTUAL_SUGGESTION_MS, openMutualWhere } from "@/lib/suggestions/mutual";

const MAX_NEW_SUGGESTIONS = 3;
const MIN_SCORE = 30;
// When a run finds no suitable candidate, wait before scanning again (per user, per server process)
const RETRY_COOLDOWN_MS = 30 * 60 * 1000;
const lastEmptyRun = new Map<string, number>();
const inFlight = new Map<string, Promise<number>>();

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
  // Concurrent requests for the same user share one run (avoids duplicate notifications)
  const running = inFlight.get(userId);
  if (running) return running;
  const run = generate(userId).finally(() => inFlight.delete(userId));
  inFlight.set(userId, run);
  return run;
}

async function generate(userId: string): Promise<number> {
  const last = lastEmptyRun.get(userId);
  if (last && Date.now() - last < RETRY_COOLDOWN_MS) return 0;

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { ...scoringSelect, role: true, isDeactivated: true, status: true, matchCredits: true },
  });
  if (!user || user.role !== "USER" || user.isDeactivated || !user.profile?.isComplete) return 0;
  if (user.status === "SUSPENDED") return 0;
  // Per-request mode: suggestions are free (capped weekly); credits are spent on intro requests.
  // Legacy mode: each suggestion uses 1 credit — none left means the user must recharge.
  // Simultaneous flow: one row shown to both people, dealbreakers are hard filters
  const { introRequests: perRequestCredits, mutualSuggestions: mutual } = await getCycleFlags();
  if (!perRequestCredits && user.matchCredits <= 0) return 0;
  if (calculateCompleteness(user).total < SUGGESTIONS_MIN_COMPLETENESS) return 0;

  // Only top up when the user has nothing waiting
  const pending = mutual
    ? (await db.suggestion.count({ where: openMutualWhere(userId) })) +
      (await db.suggestion.count({ where: { recipientId: userId, status: "PENDING", flow: "LEGACY" } }))
    : await db.suggestion.count({ where: { recipientId: userId, status: "PENDING" } });
  if (pending > 0) return 0;

  let limit = Math.min(MAX_NEW_SUGGESTIONS, user.matchCredits);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  if (perRequestCredits) {
    // Both people see a MUTUAL row, so it counts on either side
    const thisWeek = await db.suggestion.count({
      where: mutual
        ? { OR: [{ recipientId: userId }, { candidateId: userId }], createdAt: { gte: weekAgo } }
        : { recipientId: userId, createdAt: { gte: weekAgo } },
    });
    limit = Math.min(MAX_NEW_SUGGESTIONS, WEEKLY_FREE_SUGGESTIONS - thisWeek);
    if (limit <= 0) return 0;
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
      gender: user.gender === "MALE" ? "FEMALE" : "MALE",
      profile: { isComplete: true },
      ...(excluded.size > 0 && { id: { notIn: [...excluded] } }),
    },
    select: scoringSelect,
  });

  let ranked = candidates
    .filter((c) => calculateCompleteness(c).total >= SUGGESTIONS_MIN_COMPLETENESS)
    .filter((c) => !mutual || mutuallyAcceptable(user, c))
    .map((c) => ({ candidate: c, score: calculateCompatibility(user, c) }))
    .filter(({ score }) => score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score);
  if (mutual && ranked.length > 0) {
    // Skip people who already got their weekly suggestions, so popular profiles aren't flooded
    const busy = await weeklyCounts(ranked.map((r) => r.candidate.id), weekAgo);
    ranked = ranked.filter((r) => (busy.get(r.candidate.id) ?? 0) < WEEKLY_FREE_SUGGESTIONS);
  }
  const top = ranked.slice(0, limit);

  if (top.length === 0) {
    lastEmptyRun.set(userId, Date.now());
    return 0;
  }
  lastEmptyRun.delete(userId);

  // Take the credits first (atomic), then create; unused credits are given back
  if (!perRequestCredits && !(await reserveCredits(userId, top.length))) return 0;

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
  if (created.count === 0) return 0;

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

  return created.count;
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
