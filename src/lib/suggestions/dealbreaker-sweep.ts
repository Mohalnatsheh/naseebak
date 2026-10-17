/**
 * After a user changes their «شروط أساسية»: close the open suggestions that now break them (either
 * side's conditions), refund the other side's unanswered «مهتم» on those rows, then top up.
 * Rows the user already decided on are kept: they paid / chose with the old conditions.
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
    select: { id: true, recipientId: true, recipient: { select: scoring }, candidate: { select: scoring } },
  });

  const breaking = open
    .filter((s) => {
      const other = s.recipientId === userId ? s.candidate : s.recipient;
      return !mutuallyAcceptable(me as UserForScoring, other as UserForScoring);
    })
    .map((s) => s.id);
  if (breaking.length === 0) return 0;

  // expiresAt = now so the refund pass (which only looks at closed, past-expiry rows) picks them up
  const { count } = await db.suggestion.updateMany({
    where: { id: { in: breaking }, status: "PENDING" },
    data: { status: "EXPIRED", expiresAt: now },
  });
  await refundUnansweredInterests({ userId, now });
  return count;
}
