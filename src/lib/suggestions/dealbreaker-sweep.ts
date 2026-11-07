/**
 * After a user changes their «شروط أساسية»: close the open suggestions nobody has answered that now
 * break them (either side's conditions), then top up (same rule as the profile refresh, `refresh.ts`).
 * Rows either side already answered are kept: my own «مهتم» was paid with the old conditions, and a
 * card the other person said «مهتم» on stays in my «مهتمون بك» (owner, 2026-11-07).
 */
import { db } from "@/lib/db";
import { mutuallyAcceptable, type UserForScoring } from "@/lib/matching/score";
import { refundUnansweredInterests } from "@/lib/suggestions/mutual";

const scoring = { id: true, gender: true, profile: true } as const;

export async function closeSuggestionsBreakingDealbreakers(userId: string, now = new Date()): Promise<number> {
  const me = await db.user.findUnique({ where: { id: userId }, select: scoring });
  if (!me?.profile) return 0;

  const open = await db.suggestion.findMany({
    where: {
      flow: "MUTUAL",
      status: "PENDING",
      expiresAt: { gt: now },
      OR: [
        { recipientId: userId, recipientDecision: null },
        { candidateId: userId, candidateDecision: null },
      ],
    },
    select: {
      id: true, recipientId: true, recipientDecision: true, candidateDecision: true,
      recipient: { select: scoring }, candidate: { select: scoring },
    },
  });

  const breaking = open
    .filter((s) => s.recipientDecision === null && s.candidateDecision === null)
    .filter((s) => {
      const other = s.recipientId === userId ? s.candidate : s.recipient;
      return !mutuallyAcceptable(me as UserForScoring, other as UserForScoring);
    })
    .map((s) => s.id);
  if (breaking.length === 0) return 0;

  // Still unanswered on both sides (a decision a moment ago keeps the row)
  const { count } = await db.suggestion.updateMany({
    where: { id: { in: breaking }, status: "PENDING", recipientDecision: null, candidateDecision: null },
    data: { status: "EXPIRED", expiresAt: now, closedByChange: true },
  });
  await refundUnansweredInterests({ userId, now });
  return count;
}
