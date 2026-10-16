import { db } from "@/lib/db";

/** My matches, newest first (id breaks ties so pages are stable). */
export const myMatchesWhere = (userId: string) => ({ OR: [{ femaleId: userId }, { maleId: userId }] });
export const MATCHES_ORDER = [{ createdAt: "desc" as const }, { id: "desc" as const }];

/**
 * The page (1-based) that holds `matchId` in my match list, for links like
 * /dashboard/matches?match=<id>. null when the match isn't mine.
 */
export async function pageForMatch(userId: string, matchId: string, pageSize: number): Promise<number | null> {
  const match = await db.mutualMatch.findFirst({
    where: { id: matchId, ...myMatchesWhere(userId) },
    select: { id: true, createdAt: true },
  });
  if (!match) return null;
  const before = await db.mutualMatch.count({
    where: {
      AND: [
        myMatchesWhere(userId),
        { OR: [{ createdAt: { gt: match.createdAt } }, { createdAt: match.createdAt, id: { gt: match.id } }] },
      ],
    },
  });
  return Math.floor(before / pageSize) + 1;
}
