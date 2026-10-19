/**
 * Server-side checks for an admin hand-picked suggestion (POST /api/admin/suggestions).
 * Returns null when the pair is allowed, otherwise an error for the admin and an HTTP status.
 */
import { isTestPhone } from "@/lib/test-accounts";
import { db } from "@/lib/db";
import { scoringSelect } from "@/lib/matching/auto-suggest";
import { mutuallyAcceptable, type UserForScoring } from "@/lib/matching/score";
import { isEngaged } from "@/lib/intro/followup";

export interface PairError {
  error: string;
  status: 400 | 404 | 409;
}

export async function checkSuggestionPair(recipientId: string, candidateId: string): Promise<PairError | null> {
  if (recipientId === candidateId) return { error: "Pick two different people", status: 400 };

  const users = await db.user.findMany({
    where: { id: { in: [recipientId, candidateId] } },
    select: { id: true, gender: true, role: true, status: true, isDeactivated: true, isFlagged: true, phone: true },
  });
  const recipient = users.find((u) => u.id === recipientId);
  const candidate = users.find((u) => u.id === candidateId);
  if (!recipient || !candidate) return { error: "User not found", status: 404 };
  if (recipient.role !== "USER" || candidate.role !== "USER") return { error: "Only users can be suggested", status: 400 };
  if (recipient.gender === candidate.gender) return { error: "Both people have the same gender", status: 400 };
  if (isTestPhone(recipient.phone) !== isTestPhone(candidate.phone)) {
    return { error: "Test accounts can only be paired with other test accounts", status: 400 };
  }
  for (const u of [recipient, candidate]) {
    if (u.status === "SUSPENDED") return { error: "One of them is suspended", status: 400 };
    if (u.isDeactivated) return { error: "One of them has deactivated their account", status: 400 };
  }
  // Same rules as automatic suggestions, so the card isn't culled (and refunded) by the next profile save
  if (recipient.isFlagged || candidate.isFlagged) {
    return { error: "One of them is flagged (reports): flagged members get no new suggestions", status: 409 };
  }
  if ((await isEngaged(recipientId)) || (await isEngaged(candidateId))) {
    return { error: "One of them said «تمت الخطبة» (engaged): suggestions are paused for them", status: 409 };
  }
  const scoring = (await db.user.findMany({
    where: { id: { in: [recipientId, candidateId] } },
    select: scoringSelect,
  })) as unknown as UserForScoring[];
  const a = scoring.find((u) => u.id === recipientId);
  const b = scoring.find((u) => u.id === candidateId);
  if (!a?.profile || !b?.profile) return { error: "One of them has no profile yet", status: 400 };
  if (!mutuallyAcceptable(a, b)) {
    return { error: "This pair breaks a dealbreaker (شروطي الأساسية) of one of them", status: 409 };
  }

  const either = <A extends string, B extends string>(a: A, b: B) => [
    { [a]: recipientId, [b]: candidateId },
    { [a]: candidateId, [b]: recipientId },
  ];

  const [block, match, existing] = await Promise.all([
    db.block.findFirst({ where: { OR: either("blockerId", "blockedId") }, select: { id: true } }),
    db.mutualMatch.findFirst({ where: { OR: either("femaleId", "maleId") }, select: { id: true } }),
    db.suggestion.findFirst({ where: { OR: either("recipientId", "candidateId") }, select: { id: true, status: true } }),
  ]);
  if (block) return { error: "One of them blocked the other", status: 409 };
  if (match) return { error: "They are already matched", status: 409 };
  if (existing) return { error: `They already have a suggestion (${existing.status})`, status: 409 };
  return null;
}
