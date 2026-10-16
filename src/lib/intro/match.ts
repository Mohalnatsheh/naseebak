/**
 * Create a mutual match and tell both users.
 * Legacy mode: also opens an admin-handled VisitRequest.
 * New cycle (`intro_requests_enabled`): no admin visit — the match card offers
 * family / chat requests instead.
 */
import { db } from "@/lib/db";
import { notifyMany } from "@/lib/notify";
import { getCycleFlags } from "@/lib/settings";

export async function createMutualMatch(args: {
  femaleId: string;
  maleId: string;
  suggestionId: string | null;
}): Promise<{ matchId: string }> {
  const { femaleId, maleId, suggestionId } = args;

  // A pair can only match once (unique femaleId+maleId)
  const existing = await db.mutualMatch.findUnique({
    where: { femaleId_maleId: { femaleId, maleId } },
    select: { id: true },
  });
  if (existing) return { matchId: existing.id };

  const match = await db.mutualMatch.create({
    data: { femaleId, maleId, suggestionId, revealedByFemale: false },
  });

  const { introRequests } = await getCycleFlags();
  if (!introRequests) {
    await db.visitRequest.create({ data: { matchId: match.id } });
  }

  await notifyMany([femaleId, maleId], {
    type: "MATCH",
    title: "توافق متبادل!",
    body: introRequests
      ? "تهانينا! لديك توافق متبادل جديد. يمكنك الآن إرسال طلب تعارف عائلي أو طلب محادثة."
      : "تهانينا! لديك توافق متبادل جديد. يمكنك الآن رؤية التفاصيل.",
    url: `/dashboard/matches?match=${match.id}`,
    metadata: { matchId: match.id },
  });

  return { matchId: match.id };
}
