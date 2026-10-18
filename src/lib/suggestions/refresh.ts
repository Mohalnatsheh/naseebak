/**
 * After a person's own data changes (admin-approved profile edit, a profile save, the personality
 * quiz): bring the shared suggestions they haven't answered yet up to date.
 *
 * - Every such row gets the match % recalculated with the new data.
 * - A row that no longer fits (fails either side's «شروط أساسية», or drops under the minimum score)
 *   is closed, also when the other person already said «مهتم» on it: their credit comes back
 *   (`refundUnansweredInterests`, same rule as the dealbreaker sweep). Closing tells nobody why, like an expiry.
 * - Admin hand-picks are never closed for the score (an admin may pick a lower pair on purpose).
 * - Freed slots are topped up right away.
 * Rows the person already answered are left alone.
 */
import { db } from "@/lib/db";
import { calculateCompatibility, mutuallyAcceptable, type UserForScoring } from "@/lib/matching/score";
import { autoSuggestForUser, minSuggestionScore, scoringSelect } from "@/lib/matching/auto-suggest";
import { getCycleFlags } from "@/lib/settings";
import { refundUnansweredInterests } from "@/lib/suggestions/mutual";

export interface RefreshResult {
  rescored: number;
  closed: number;
}

export async function refreshOpenSuggestions(userId: string, now = new Date()): Promise<RefreshResult> {
  const result: RefreshResult = { rescored: 0, closed: 0 };
  const flags = await getCycleFlags();
  // Older flow: nothing shared to refresh, only the usual top-up
  if (!flags.mutualSuggestions) {
    await autoSuggestForUser(userId);
    return result;
  }

  const me = await db.user.findUnique({ where: { id: userId }, select: scoringSelect });
  if (!me?.profile) return result;

  const rows = await db.suggestion.findMany({
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
      id: true,
      source: true,
      compatibilityScore: true,
      recipientId: true,
      recipient: { select: scoringSelect },
      candidate: { select: scoringSelect },
    },
  });

  const minScore = minSuggestionScore(flags);
  const toClose: string[] = [];
  for (const row of rows) {
    const iAmRecipient = row.recipientId === userId;
    const other = (iAmRecipient ? row.candidate : row.recipient) as UserForScoring;
    // Same order as when the row was created (recipient first)
    const recipient = (iAmRecipient ? me : other) as UserForScoring;
    const candidate = (iAmRecipient ? other : me) as UserForScoring;
    const score = calculateCompatibility(recipient, candidate);

    const fits =
      mutuallyAcceptable(me as UserForScoring, other) && (row.source === "ADMIN" || score >= minScore);
    if (!fits) {
      toClose.push(row.id);
      continue;
    }
    if (score !== row.compatibilityScore) {
      // Still undecided by me (a decision a moment ago keeps the row as it was)
      const myUndecided = iAmRecipient ? { recipientDecision: null } : { candidateDecision: null };
      const { count } = await db.suggestion.updateMany({
        where: { id: row.id, status: "PENDING", ...myUndecided },
        data: { compatibilityScore: score },
      });
      result.rescored += count;
    }
  }

  if (toClose.length > 0) {
    // Re-checked in the update: a row I decided on a moment ago is left as it is
    // expiresAt = now so the refund pass (closed, past-expiry rows) gives back the other side's «مهتم»
    const { count } = await db.suggestion.updateMany({
      where: {
        id: { in: toClose },
        status: "PENDING",
        OR: [
          { recipientId: userId, recipientDecision: null },
          { candidateId: userId, candidateDecision: null },
        ],
      },
      data: { status: "EXPIRED", expiresAt: now },
    });
    result.closed = count;
    if (count > 0) await refundUnansweredInterests({ userId, now }).catch((e) => console.error("[suggestions] refresh refunds:", e));
  }

  // Fills the freed slots (and any that were already free)
  await autoSuggestForUser(userId);
  return result;
}

/** Fire-and-forget wrapper for routes: never blocks or fails the save that triggered it. */
export function refreshOpenSuggestionsInBackground(userId: string): void {
  refreshOpenSuggestions(userId).catch((e) => console.error("[suggestions] refresh after profile change:", userId, e));
}
