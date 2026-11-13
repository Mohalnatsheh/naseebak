/**
 * Server-side checks for an admin hand-picked suggestion (POST /api/admin/suggestions).
 * Returns null when the pair is allowed, otherwise an error for the admin and an HTTP status.
 */
import { isTestPhone } from "@/lib/test-accounts";
import { db } from "@/lib/db";
import { scoringSelect } from "@/lib/matching/auto-suggest";
import { mutuallyAcceptable, type UserForScoring } from "@/lib/matching/score";
import { isEngaged } from "@/lib/intro/followup";
import { DEFAULT_COUNTRY, countryConfig } from "@/lib/countries";
import { religionsMatch } from "@/lib/profile-religion";
import { meetsSuggestionGate } from "@/lib/profile-completeness";
import { getCycleFlags } from "@/lib/settings";

/** What `meetsSuggestionGate` reads (both cycles) */
const gateSelect = {
  id: true,
  profile: true,
  personalityResult: { select: { vector: true, personalityType: true } },
  photos: { select: { id: true } },
  identityDoc: { select: { status: true } },
  parentInfo: { select: { id: true, parentName: true } },
} as const;

export interface PairError {
  error: string;
  status: 400 | 404 | 409;
}

export async function checkSuggestionPair(recipientId: string, candidateId: string): Promise<PairError | null> {
  if (recipientId === candidateId) return { error: "Pick two different people", status: 400 };

  const users = await db.user.findMany({
    where: { id: { in: [recipientId, candidateId] } },
    select: { id: true, gender: true, role: true, status: true, isDeactivated: true, isFlagged: true, phone: true, country: true },
  });
  const recipient = users.find((u) => u.id === recipientId);
  const candidate = users.find((u) => u.id === candidateId);
  if (!recipient || !candidate) return { error: "User not found", status: 404 };
  if (recipient.role !== "USER" || candidate.role !== "USER") return { error: "Only users can be suggested", status: 400 };
  if (recipient.gender === candidate.gender) return { error: "Both people have the same gender", status: 400 };
  // Members are only paired within their own country (same rule as automatic suggestions).
  // A future system setting `cross_country_matching` (off) will lift this.
  if ((recipient.country ?? DEFAULT_COUNTRY) !== (candidate.country ?? DEFAULT_COUNTRY)) {
    return {
      error: `Different countries (${countryConfig(recipient.country).nameEn} / ${countryConfig(candidate.country).nameEn}): members are only suggested to people from their own country`,
      status: 409,
    };
  }
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
  // QA ADM-09: the same gate as automatic suggestions, for both people (a member mid-setup gets no cards)
  const { introRequests } = await getCycleFlags();
  const gated = await db.user.findMany({ where: { id: { in: [recipientId, candidateId] } }, select: gateSelect });
  for (const id of [recipientId, candidateId]) {
    const u = gated.find((g) => g.id === id);
    if (!u || !meetsSuggestionGate(u, introRequests)) {
      return {
        error: `${id === recipientId ? "The member" : "The candidate"} hasn't finished the setup, so they can't get suggestions yet`,
        status: 409,
      };
    }
  }
  if (!mutuallyAcceptable(a, b)) {
    if (!religionsMatch(a.profile, b.profile)) {
      return { error: "Different religions and one of them wants their own religion (الديانة)", status: 409 };
    }
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
