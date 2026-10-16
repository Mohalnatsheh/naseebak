/**
 * Simultaneous suggestions (switch `new_suggestions_flow`): one Suggestion row is shown to both
 * people, each records "مهتم" or "لا" once, and a mutual match is created only when both say yes.
 * Nobody is told about the other's answer: no notification on a decline, and the feed hides rows
 * by the viewer's own decision and the expiry date only.
 */
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { IntroError } from "@/lib/intro/errors";
import { createMutualMatch } from "@/lib/intro/match";

/** A MUTUAL suggestion stays open this long; after that "waiting" ends without a word. */
export const MUTUAL_SUGGESTION_DAYS = 14;
export const MUTUAL_SUGGESTION_MS = MUTUAL_SUGGESTION_DAYS * 24 * 60 * 60 * 1000;

const notFound = () => new IntroError("NOT_FOUND", "الاقتراح غير موجود");

/** MUTUAL rows where `userId` still has to decide (either side, not expired). */
export function openMutualWhere(userId: string, now = new Date()): Prisma.SuggestionWhereInput {
  return {
    flow: "MUTUAL",
    status: "PENDING",
    expiresAt: { gt: now },
    OR: [
      { recipientId: userId, recipientDecision: null },
      { candidateId: userId, candidateDecision: null },
    ],
  };
}

/** Lazily close MUTUAL rows of this user whose time ran out. */
export async function expireMutualSuggestions(userId: string): Promise<void> {
  await db.suggestion.updateMany({
    where: {
      flow: "MUTUAL",
      status: "PENDING",
      expiresAt: { lte: new Date() },
      OR: [{ recipientId: userId }, { candidateId: userId }],
    },
    data: { status: "EXPIRED" },
  });
}

export async function decideSuggestion(args: {
  suggestionId: string;
  userId: string;
  interested: boolean;
}): Promise<{ match: boolean; matchId?: string }> {
  const { suggestionId, userId, interested } = args;
  const now = new Date();

  const s = await db.suggestion.findUnique({ where: { id: suggestionId } });
  if (!s || s.flow !== "MUTUAL" || s.status !== "PENDING") throw notFound();
  if (!s.expiresAt || s.expiresAt <= now) throw notFound();
  const side = s.recipientId === userId ? "recipient" : s.candidateId === userId ? "candidate" : null;
  if (!side) throw notFound();
  if ((side === "recipient" ? s.recipientDecision : s.candidateDecision) !== null) throw notFound();

  const otherId = side === "recipient" ? s.candidateId : s.recipientId;
  const blocked = await db.block.findFirst({
    where: {
      OR: [
        { blockerId: userId, blockedId: otherId },
        { blockerId: otherId, blockedId: userId },
      ],
    },
    select: { id: true },
  });
  if (blocked) throw notFound();

  // Record my decision once (a concurrent second tap loses here)
  const decision = interested ? "INTERESTED" : "DECLINED";
  const recorded = await db.suggestion.updateMany({
    where:
      side === "recipient"
        ? { id: s.id, flow: "MUTUAL", status: "PENDING", expiresAt: { gt: now }, recipientDecision: null }
        : { id: s.id, flow: "MUTUAL", status: "PENDING", expiresAt: { gt: now }, candidateDecision: null },
    data:
      side === "recipient"
        ? { recipientDecision: decision, recipientDecidedAt: now }
        : { candidateDecision: decision, candidateDecidedAt: now },
  });
  if (recorded.count === 0) throw notFound();

  // Re-read: the other side may have decided at the same moment
  const after = await db.suggestion.findUnique({ where: { id: s.id } });
  if (!after) return { match: false };

  if (after.recipientDecision === "INTERESTED" && after.candidateDecision === "INTERESTED") {
    // Only one of two simultaneous callers closes the row and creates the match
    const closed = await db.suggestion.updateMany({
      where: { id: s.id, status: "PENDING" },
      data: { status: "ACCEPTED" },
    });
    if (closed.count === 0) return { match: true };
    const me = await db.user.findUnique({ where: { id: userId }, select: { gender: true } });
    const femaleId = me?.gender === "FEMALE" ? userId : otherId;
    const maleId = femaleId === userId ? otherId : userId;
    const { matchId } = await createMutualMatch({ femaleId, maleId, suggestionId: s.id });
    return { match: true, matchId };
  }

  if (after.recipientDecision !== null && after.candidateDecision !== null) {
    await db.suggestion.updateMany({ where: { id: s.id, status: "PENDING" }, data: { status: "REJECTED" } });
  }
  return { match: false };
}
