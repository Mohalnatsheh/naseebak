import { db } from "@/lib/db";

/** My matches, newest first (id breaks ties so pages are stable). */
export const myMatchesWhere = (userId: string) => ({ OR: [{ femaleId: userId }, { maleId: userId }] });
export const MATCHES_ORDER = [{ createdAt: "desc" as const }, { id: "desc" as const }];

/**
 * My matches minus those with a partner in `hiddenPartnerIds` (people who blocked me: the match
 * disappears for the blocked side). Same shape as `myMatchesWhere` when nothing is hidden.
 */
export function visibleMatchesWhere(userId: string, hiddenPartnerIds: string[] = []) {
  if (hiddenPartnerIds.length === 0) return myMatchesWhere(userId);
  return {
    AND: [
      myMatchesWhere(userId),
      { femaleId: { notIn: hiddenPartnerIds } },
      { maleId: { notIn: hiddenPartnerIds } },
    ],
  };
}

/**
 * The page (1-based) that holds `matchId` in my match list, for links like
 * /dashboard/matches?match=<id>. null when the match isn't mine (or is hidden from me).
 */
export async function pageForMatch(
  userId: string,
  matchId: string,
  pageSize: number,
  hiddenPartnerIds: string[] = []
): Promise<number | null> {
  const visible = visibleMatchesWhere(userId, hiddenPartnerIds);
  const match = await db.mutualMatch.findFirst({
    where: { id: matchId, ...visible },
    select: { id: true, createdAt: true },
  });
  if (!match) return null;
  const before = await db.mutualMatch.count({
    where: {
      AND: [
        visible,
        { OR: [{ createdAt: { gt: match.createdAt } }, { createdAt: match.createdAt, id: { gt: match.id } }] },
      ],
    },
  });
  return Math.floor(before / pageSize) + 1;
}
