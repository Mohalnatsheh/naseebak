/**
 * A member with no suggestions: which of their own «شروط أساسية» shuts out the most suitable people, and how many they
 * would gain by easing it (owner request 2026-11-05: on 5 Nov, 38 of the 149 most active members had nobody left, about
 * 200 people available and their own dealbreakers leaving about 8). Read-only: it never changes a member's filters.
 */
import { db } from "@/lib/db";
import { CANDIDATE_FALLBACK_DAYS, recentlySeenWhere } from "@/lib/activity";
import { NOT_ENGAGED } from "@/lib/intro/followup";
import { minSuggestionScore, pairAvailability, scoringSelect } from "@/lib/matching/auto-suggest";
import { calculateCompatibility, DEALBREAKER_LABELS, mutuallyAcceptable, type DealbreakerKey } from "@/lib/matching/score";
import { meetsSuggestionGate } from "@/lib/profile-completeness";
import { getCycleFlags } from "@/lib/settings";
import { isTestPhone, testPhones } from "@/lib/test-accounts";

/** Fewer than this isn't worth asking a member to change a filter they chose */
const MIN_GAIN = 3;

export interface FilterTip {
  key: DealbreakerKey;
  gain: number;
}

/** «12 شخصاً مناسباً» / «5 أشخاص مناسبين» */
function people(n: number): string {
  return n > 10 ? `${n} شخصاً مناسباً` : `${n} أشخاص مناسبين`;
}

export function filterTipText(tip: FilterTip, female: boolean): string {
  const label = DEALBREAKER_LABELS[tip.key];
  return female
    ? `لو خففتِ شرط «${label}» يظهر لكِ ${people(tip.gain)}.`
    : `لو خففت شرط «${label}» يظهر لك ${people(tip.gain)}.`;
}

export async function filterTip(userId: string, now = new Date()): Promise<FilterTip | null> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { ...scoringSelect, phone: true } });
  const keys = (user?.profile?.dealbreakers ?? []) as DealbreakerKey[];
  if (!user?.profile || keys.length === 0) return null;
  const flags = await getCycleFlags();

  const [past, matches, blocks] = await Promise.all([
    db.suggestion.findMany({
      where: { OR: [{ recipientId: userId }, { candidateId: userId }] },
      select: { recipientId: true, candidateId: true, status: true, recipientDecision: true, candidateDecision: true, expiresAt: true, updatedAt: true },
    }),
    db.mutualMatch.findMany({ where: { OR: [{ femaleId: userId }, { maleId: userId }] }, select: { femaleId: true, maleId: true } }),
    db.block.findMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] }, select: { blockerId: true, blockedId: true } }),
  ]);
  const excluded = new Set<string>([
    ...[...pairAvailability(userId, past, now)].filter(([, a]) => a === "no").map(([id]) => id),
    ...matches.flatMap((m) => [m.femaleId, m.maleId]),
    ...blocks.flatMap((b) => [b.blockerId, b.blockedId]),
  ]);
  excluded.delete(userId);

  const pool = await db.user.findMany({
    where: {
      role: "USER",
      isDeactivated: false,
      status: { not: "SUSPENDED" },
      isFlagged: false,
      ...recentlySeenWhere(CANDIDATE_FALLBACK_DAYS, now),
      gender: user.gender === "MALE" ? "FEMALE" : "MALE",
      country: user.country,
      profile: { isComplete: true },
      ...NOT_ENGAGED,
      phone: isTestPhone(user.phone) ? { in: testPhones() } : { notIn: testPhones() },
      ...(excluded.size > 0 && { id: { notIn: [...excluded] } }),
    },
    select: scoringSelect,
  });
  // Only people the score would let through: easing a filter must really bring cards
  const min = minSuggestionScore(flags, user.country);
  const shutOut = pool
    .filter((c) => meetsSuggestionGate(c, flags.introRequests))
    .filter((c) => !mutuallyAcceptable(user, c) && calculateCompatibility(user, c) >= min);

  let best: FilterTip | null = null;
  for (const key of keys) {
    const eased = { ...user, profile: { ...user.profile, dealbreakers: keys.filter((k) => k !== key) } };
    const gain = shutOut.filter((c) => mutuallyAcceptable(eased, c)).length;
    if (gain >= MIN_GAIN && (!best || gain > best.gain)) best = { key, gain };
  }
  return best;
}
