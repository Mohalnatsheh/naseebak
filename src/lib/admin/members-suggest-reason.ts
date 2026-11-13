/**
 * Why a member has no suggestions, for the admin member page. READ-ONLY on purpose:
 * `autoSuggestWithReason` creates cards, reveals hidden ones and sends notifications, so an admin
 * opening a page must never call it. This repeats its checks in the same order, with counts only:
 * keep it in step with `generate` in src/lib/matching/auto-suggest.ts.
 */
import { db } from "@/lib/db";
import { activeWhere, CANDIDATE_ACTIVE_DAYS, CANDIDATE_FALLBACK_DAYS, isActive, recentlySeenWhere } from "@/lib/activity";
import { WEEKLY_FREE_SUGGESTIONS } from "@/lib/credits";
import { NOT_ENGAGED, isEngaged } from "@/lib/intro/followup";
import {
  minSuggestionScore,
  nextSuggestionsAtFor,
  openSuggestionCount,
  pairAvailability,
  scoringSelect,
  secondChanceCards,
  weeklyCounts,
} from "@/lib/matching/auto-suggest";
import { calculateCompatibility, mutuallyAcceptable, passesDealbreakers } from "@/lib/matching/score";
import { religionsMatch } from "@/lib/profile-religion";
import { meetsSuggestionGate } from "@/lib/profile-completeness";
import { getCycleFlags } from "@/lib/settings";
import { isTestPhone, testPhones } from "@/lib/test-accounts";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** `weekly_cap` and `no_candidates` as in auto-suggest; `ready` = people are available, cards come on their next visit */
export type NoSuggestionsReason =
  | "not_a_member"
  | "deactivated"
  | "suspended"
  | "flagged"
  | "engaged"
  | "idle"
  | "setup_unfinished"
  | "no_credits"
  | "weekly_cap"
  | "no_candidates"
  | "ready";

export interface MemberSuggestStatus {
  lastActiveAt: Date | null;
  /** Cards filling this member's slots */
  openSuggestions: number;
  /** Their «مهتم» still waiting for the other side's answer */
  openInterests: number;
  /** Only filled in when `openSuggestions` is 0 */
  reason: NoSuggestionsReason | null;
  /** Suitable people found (`ready`), counting cards hidden until this member has room */
  candidates: number | null;
  /** At the weekly cap: when the next card can arrive */
  nextSuggestionsAt: Date | null;
  /** Only with `no_candidates`: people who pass everything else and are kept apart only by «الديانة» */
  blockedByReligion: number | null;
}

async function suitableCandidates(
  user: Parameters<typeof calculateCompatibility>[0] & { id: string; gender: "MALE" | "FEMALE"; country: string; phone: string | null },
  flags: Awaited<ReturnType<typeof getCycleFlags>>,
  now: Date,
): Promise<{ count: number; blockedByReligion: number }> {
  const { introRequests: perRequestCredits, mutualSuggestions: mutual, creditOnInterest } = flags;
  const pastSelect = {
    recipientId: true, candidateId: true, status: true, recipientDecision: true, candidateDecision: true, expiresAt: true, updatedAt: true, closedByChange: true,
  } as const;
  const [suggested, matches, blocks, hidden] = await Promise.all([
    db.suggestion.findMany({ where: { OR: [{ recipientId: user.id }, { candidateId: user.id }] }, select: pastSelect }),
    db.mutualMatch.findMany({ where: { OR: [{ femaleId: user.id }, { maleId: user.id }] }, select: { femaleId: true, maleId: true } }),
    db.block.findMany({ where: { OR: [{ blockerId: user.id }, { blockedId: user.id }] }, select: { blockerId: true, blockedId: true } }),
    // Already made for this member while they were full: shown as soon as they have room
    creditOnInterest
      ? db.suggestion.count({
          where: { flow: "MUTUAL", status: "PENDING", expiresAt: { gt: now }, candidateId: user.id, hiddenFromCandidate: true, candidateDecision: null },
        })
      : 0,
  ]);
  const availability = mutual ? pairAvailability(user.id, suggested, now) : null;
  const excluded = new Set<string>([
    ...(availability
      ? [...availability].filter(([, a]) => a === "no").map(([id]) => id)
      : suggested.flatMap((s) => [s.recipientId, s.candidateId])),
    ...matches.flatMap((m) => [m.femaleId, m.maleId]),
    ...blocks.flatMap((b) => [b.blockerId, b.blockedId]),
  ]);
  excluded.delete(user.id);

  const candidates = await db.user.findMany({
    where: {
      role: "USER",
      isDeactivated: false,
      status: { not: "SUSPENDED" },
      isFlagged: false,
      // `generate` tries 7 days, then 14: anyone here would be found by one of the two
      ...(mutual ? recentlySeenWhere(CANDIDATE_FALLBACK_DAYS, now) : activeWhere(undefined, now)),
      gender: user.gender === "MALE" ? "FEMALE" : "MALE",
      country: user.country,
      profile: { isComplete: true },
      ...NOT_ENGAGED,
      phone: isTestPhone(user.phone) ? { in: testPhones() } : { notIn: testPhones() },
      ...(excluded.size > 0 && { id: { notIn: [...excluded] } }),
    },
    select: scoringSelect,
  });
  const minScore = minSuggestionScore(flags, user.country);
  const gated = candidates.filter((c) => meetsSuggestionGate(c, perRequestCredits));
  // Mirrors `rank` in generate: shared flow = every rule incl. «الديانة»; legacy = «الديانة» only
  const accepted = gated.filter((c) => (mutual ? mutuallyAcceptable(user, c) : religionsMatch(user.profile, c.profile)));
  // Everything else holds and only «الديانة» fails
  const blockedByReligion = gated.filter(
    (c) =>
      !religionsMatch(user.profile, c.profile) &&
      (!mutual || (!!user.profile && !!c.profile && passesDealbreakers(user.profile, c.profile, c.gender) && passesDealbreakers(c.profile, user.profile, user.gender))) &&
      calculateCompatibility(user, c) >= minScore,
  ).length;
  let ranked = accepted.filter((c) => calculateCompatibility(user, c) >= minScore);
  // Per-request mode skips people who already got their weekly share; credit on interest never skips
  if (mutual && !creditOnInterest && ranked.length > 0) {
    const busy = await weeklyCounts(ranked.map((c) => c.id), new Date(now.getTime() - WEEK_MS));
    ranked = ranked.filter((c) => (busy.get(c.id) ?? 0) < WEEKLY_FREE_SUGGESTIONS);
  }
  const waiting = creditOnInterest ? await secondChanceCards(user, flags, now) : [];
  return { count: ranked.length + hidden + waiting.length, blockedByReligion };
}

export async function memberSuggestStatus(userId: string, now = new Date()): Promise<MemberSuggestStatus | null> {
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
      phone: true,
    },
  });
  if (!user) return null;

  const [openSuggestions, openInterests] = await Promise.all([
    openSuggestionCount(userId),
    db.suggestion.count({
      where: {
        flow: "MUTUAL",
        status: "PENDING",
        expiresAt: { gt: now },
        OR: [
          { recipientId: userId, recipientDecision: "INTERESTED", candidateDecision: null },
          { candidateId: userId, candidateDecision: "INTERESTED", recipientDecision: null },
        ],
      },
    }),
  ]);
  const status: MemberSuggestStatus = {
    lastActiveAt: user.lastActiveAt,
    openSuggestions,
    openInterests,
    reason: null,
    candidates: null,
    nextSuggestionsAt: null,
    blockedByReligion: null,
  };
  if (openSuggestions > 0) return status;

  const stop = (reason: NoSuggestionsReason): MemberSuggestStatus => ({ ...status, reason });
  if (user.role !== "USER") return stop("not_a_member");
  if (user.isDeactivated) return stop("deactivated");
  if (!user.profile?.isComplete) return stop("setup_unfinished");
  if (user.status === "SUSPENDED") return stop("suspended");
  if (user.isFlagged) return stop("flagged");
  if (await isEngaged(userId)) return stop("engaged");
  if (!isActive(user, undefined, now)) return stop("idle");

  const flags = await getCycleFlags();
  const { introRequests: perRequestCredits, mutualSuggestions: mutual, creditOnInterest } = flags;
  if (!perRequestCredits && user.matchCredits <= 0) return stop("no_credits");
  if (!meetsSuggestionGate(user, perRequestCredits)) return stop("setup_unfinished");
  if (creditOnInterest && !isActive(user, CANDIDATE_ACTIVE_DAYS, now)) return stop("idle");

  if (perRequestCredits && !creditOnInterest) {
    const weekAgo = new Date(now.getTime() - WEEK_MS);
    const thisWeek = await db.suggestion.count({
      where: mutual
        ? { OR: [{ recipientId: userId }, { candidateId: userId }], createdAt: { gte: weekAgo } }
        : { recipientId: userId, createdAt: { gte: weekAgo } },
    });
    if (WEEKLY_FREE_SUGGESTIONS - thisWeek <= 0) {
      return { ...stop("weekly_cap"), nextSuggestionsAt: await nextSuggestionsAtFor(userId, now) };
    }
  }

  const { count: candidates, blockedByReligion } = await suitableCandidates(user, flags, now);
  return { ...stop(candidates > 0 ? "ready" : "no_candidates"), candidates, blockedByReligion: candidates > 0 ? null : blockedByReligion };
}
