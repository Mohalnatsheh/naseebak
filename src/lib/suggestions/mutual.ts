/**
 * Simultaneous suggestions (switch `new_suggestions_flow`): one Suggestion row is shown to both
 * people, each records "مهتم" or "لا" once, and a mutual match is created only when both say yes.
 * Nobody is told about the other's answer: no notification on a decline, and the feed hides rows
 * by the viewer's own decision and the expiry date only.
 *
 * Credit on interest (switch `credit_on_interest`): "مهتم" costs 1 credit, taken in the same
 * transaction that records the decision, and carries the chat/family preference; "لا" is free.
 * No refund when the other side declines or never answers (that would reveal their decision).
 */
import type { IntroPreference, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { notifyInterestCreditsExhausted, recordCredit, reserveCredits } from "@/lib/credits";
import { IntroError } from "@/lib/intro/errors";
import { createMutualMatch } from "@/lib/intro/match";
import { setGuardianConsent } from "@/lib/intro/requests";
import { isUnavailable } from "@/lib/matches/state";
import { getCycleFlags } from "@/lib/settings";

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
  const startedAt = new Date();
  const { count } = await db.suggestion.updateMany({
    where: {
      flow: "MUTUAL",
      status: "PENDING",
      expiresAt: { lte: startedAt },
      OR: [{ recipientId: userId }, { candidateId: userId }],
    },
    data: { status: "EXPIRED" },
  });
  if (count === 0) return;
  // Credit-on-interest: expiry frees slots, so both sides of the expired rows get topped up
  if (!(await getCycleFlags()).creditOnInterest) return;
  const rows = await db.suggestion.findMany({
    where: {
      flow: "MUTUAL",
      status: "EXPIRED",
      updatedAt: { gte: startedAt },
      OR: [{ recipientId: userId }, { candidateId: userId }],
    },
    select: { recipientId: true, candidateId: true },
  });
  const people = [...new Set([userId, ...rows.flatMap((r) => [r.recipientId, r.candidateId])])];
  // Fire-and-forget; lazy import avoids the auto-suggest <-> mutual cycle
  void import("@/lib/matching/auto-suggest")
    .then(({ autoSuggestForUser }) =>
      Promise.all(people.map((id) => autoSuggestForUser(id).catch((e) => console.error("[suggestions] expiry top-up:", id, e))))
    )
    .catch((e) => console.error("[suggestions] expiry top-up:", e));
}

/** Fire-and-forget top-up after a decision freed a slot; lazy import avoids the auto-suggest <-> mutual cycle. */
function topUpAfterDecision(userId: string): void {
  void import("@/lib/matching/auto-suggest")
    .then(({ autoSuggestForUser }) => autoSuggestForUser(userId))
    .catch((e) => console.error("[suggestions] decision top-up:", userId, e));
}

/** Credit on interest: the chosen introduction must be possible before "مهتم" is charged. */
async function checkIntroPreference(
  userId: string,
  pref: IntroPreference | undefined,
  chatEnabled: boolean,
  guardianConsent: boolean | undefined
): Promise<{ needsConsent: boolean }> {
  if (pref !== "CHAT" && pref !== "FAMILY") throw new IntroError("PREFERENCE_REQUIRED");
  if (pref === "CHAT") {
    if (!chatEnabled) throw new IntroError("DISABLED");
    return { needsConsent: false };
  }
  const guardian = await db.parentInfo.findUnique({ where: { userId }, select: { shareConsentAt: true } });
  if (!guardian) throw new IntroError("GUARDIAN_REQUIRED");
  if (guardian.shareConsentAt) return { needsConsent: false };
  if (guardianConsent !== true) throw new IntroError("CONSENT_REQUIRED");
  return { needsConsent: true };
}

export async function decideSuggestion(args: {
  suggestionId: string;
  userId: string;
  interested: boolean;
  introPreference?: IntroPreference;
  guardianConsent?: boolean;
}): Promise<{ match: boolean; matchId?: string; creditsLeft?: number }> {
  const { suggestionId, userId, interested } = args;
  const now = new Date();
  const flags = await getCycleFlags();

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

  // Deactivated or suspended since: the suggestion is gone (it is hidden from the feed too)
  const other = await db.user.findUnique({ where: { id: otherId }, select: { isDeactivated: true, status: true } });
  if (isUnavailable(other)) throw notFound();

  const charge = flags.creditOnInterest && interested;
  const preference = charge ? args.introPreference : undefined;
  if (charge) {
    const { needsConsent } = await checkIntroPreference(userId, preference, flags.chat, args.guardianConsent);
    const me = await db.user.findUnique({ where: { id: userId }, select: { matchCredits: true } });
    if ((me?.matchCredits ?? 0) < 1) throw new IntroError("NO_CREDITS");
    if (needsConsent) await setGuardianConsent(userId);
  }

  // Record my decision once (a concurrent second tap loses here)
  const decision = interested ? "INTERESTED" : "DECLINED";
  const claim = (client: Pick<typeof db, "suggestion">) =>
    client.suggestion.updateMany({
      where:
        side === "recipient"
          ? { id: s.id, flow: "MUTUAL", status: "PENDING", expiresAt: { gt: now }, recipientDecision: null }
          : { id: s.id, flow: "MUTUAL", status: "PENDING", expiresAt: { gt: now }, candidateDecision: null },
      data:
        side === "recipient"
          ? { recipientDecision: decision, recipientDecidedAt: now, ...(preference && { recipientIntroPreference: preference }) }
          : { candidateDecision: decision, candidateDecidedAt: now, ...(preference && { candidateIntroPreference: preference }) },
    });

  let creditsLeft: number | undefined;
  if (charge) {
    // Claim + charge together: a lost claim charges nothing, a failed reserve rolls the claim back
    await db.$transaction(async (tx) => {
      const recorded = await claim(tx);
      if (recorded.count === 0) throw notFound();
      if (!(await reserveCredits(userId, 1, tx))) throw new IntroError("NO_CREDITS");
      await recordCredit({ userId, delta: -1, reason: "INTEREST", refId: s.id }, tx);
    });
    const me = await db.user.findUnique({ where: { id: userId }, select: { matchCredits: true } });
    creditsLeft = me?.matchCredits ?? 0;
    if (creditsLeft <= 0) {
      await notifyInterestCreditsExhausted(userId).catch((e) => console.error("[suggestions] exhausted notice:", e));
    }
  } else {
    const recorded = await claim(db);
    if (recorded.count === 0) throw notFound();
  }
  if (flags.creditOnInterest) topUpAfterDecision(userId);
  const extra = creditsLeft === undefined ? {} : { creditsLeft };

  // Re-read: the other side may have decided at the same moment
  const after = await db.suggestion.findUnique({ where: { id: s.id } });
  if (!after) return { match: false, ...extra };

  if (after.recipientDecision === "INTERESTED" && after.candidateDecision === "INTERESTED") {
    // Only one of two simultaneous callers closes the row and creates the match
    const closed = await db.suggestion.updateMany({
      where: { id: s.id, status: "PENDING" },
      data: { status: "ACCEPTED" },
    });
    if (closed.count === 0) return { match: true, ...extra };
    // Re-check at the last moment: never create a match with someone who just left
    const partner = await db.user.findUnique({ where: { id: otherId }, select: { isDeactivated: true, status: true } });
    if (isUnavailable(partner)) {
      await db.suggestion.updateMany({ where: { id: s.id }, data: { status: "EXPIRED" } });
      return { match: false, ...extra };
    }
    const me = await db.user.findUnique({ where: { id: userId }, select: { gender: true } });
    const femaleId = me?.gender === "FEMALE" ? userId : otherId;
    const maleId = femaleId === userId ? otherId : userId;
    const { matchId } = await createMutualMatch({ femaleId, maleId, suggestionId: s.id });
    return { match: true, matchId, ...extra };
  }

  if (after.recipientDecision !== null && after.candidateDecision !== null) {
    await db.suggestion.updateMany({ where: { id: s.id, status: "PENDING" }, data: { status: "REJECTED" } });
  }
  return { match: false, ...extra };
}
