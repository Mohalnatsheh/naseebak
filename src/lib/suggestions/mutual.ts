/**
 * Simultaneous suggestions (switch `new_suggestions_flow`): one Suggestion row is shown to both
 * people, each records "مهتم" or "لا" once, and a mutual match is created only when both say yes.
 * Nobody is told about the other's answer: no notification on a decline, and the feed hides rows
 * by the viewer's own decision and the expiry date only.
 *
 * Credit on interest (switch `credit_on_interest`): "مهتم" costs 1 credit, taken in the same
 * transaction that records the decision, and carries the chat/family preference; "لا" is free.
 * At 0 credits "مهتم" is refused (NO_CREDITS) until a recharge; "لا" stays free and the profile stays visible.
 * Refund: when the suggestion closes and the other side NEVER answered, the "مهتم" credit comes back
 * (`refundUnansweredInterests`). A "لا" closes the row as REJECTED and is never refunded. The owner
 * accepted that this lets people infer a "لا" (no refund) from silence (refund).
 */
import type { IntroPreference, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { notifyInterestCreditsExhausted, recordCredit, reserveCredits } from "@/lib/credits";
import { notify } from "@/lib/notify";
import { IntroError } from "@/lib/intro/errors";
import { createMutualMatch } from "@/lib/intro/match";
import { setGuardianConsent } from "@/lib/intro/requests";
import { isUnavailable } from "@/lib/matches/state";
import { getCycleFlags } from "@/lib/settings";

/** A MUTUAL suggestion stays open this long; after that "waiting" ends without a word. */
export const MUTUAL_SUGGESTION_DAYS = 7;
export const MUTUAL_SUGGESTION_MS = MUTUAL_SUGGESTION_DAYS * 24 * 60 * 60 * 1000;

const notFound = () => new IntroError("NOT_FOUND", "الاقتراح غير موجود");

/** The other person can still take part (not deactivated or suspended) */
const activePerson: Prisma.UserWhereInput = { isDeactivated: false, status: { not: "SUSPENDED" } };

/**
 * MUTUAL rows where `userId` still has to decide (either side, not expired). Rows with a partner who
 * deactivated or was suspended are left out: the feed hides them, so they must not fill a slot.
 */
export function openMutualWhere(userId: string, now = new Date()): Prisma.SuggestionWhereInput {
  return {
    flow: "MUTUAL",
    status: "PENDING",
    expiresAt: { gt: now },
    OR: [
      { recipientId: userId, recipientDecision: null, candidate: activePerson },
      { candidateId: userId, candidateDecision: null, recipient: activePerson },
    ],
  };
}

/**
 * A block closes the open shared suggestions between the two right away (they're hidden from both
 * anyway), so the slots free up; an unanswered «مهتم» on them is refunded like any other closing.
 */
export async function closeSuggestionsBetween(a: string, b: string): Promise<void> {
  const now = new Date();
  const { count } = await db.suggestion.updateMany({
    where: {
      flow: "MUTUAL",
      status: "PENDING",
      OR: [
        { recipientId: a, candidateId: b },
        { recipientId: b, candidateId: a },
      ],
    },
    data: { status: "EXPIRED", expiresAt: now },
  });
  if (count > 0) await refundUnansweredInterests({ userId: a, now });
}

/**
 * The daily job only looks this far back (its first run must not dig up old rows); a person's own
 * visit closes their rows and checks them with no limit, however late they come back.
 */
const REFUND_LOOKBACK_MS = MUTUAL_SUGGESTION_MS;

/**
 * Give the "مهتم" credit back on suggestions that closed with the other side never answering.
 * Only a real charge is refunded (INTEREST ledger row for that suggestion); the claim on
 * `interestRefundedAt` and the credit run in one transaction, so it happens once even when the
 * lazy path and the daily job meet. `userId` limits it to that person's suggestions (either side).
 */
export async function refundUnansweredInterests(opts: { userId?: string; now?: Date } = {}): Promise<{ refunded: number }> {
  const now = opts.now ?? new Date();
  const rows = await db.suggestion.findMany({
    where: {
      flow: "MUTUAL",
      status: "EXPIRED",
      interestRefundedAt: null,
      expiresAt: opts.userId ? { lte: now } : { lte: now, gt: new Date(now.getTime() - REFUND_LOOKBACK_MS) },
      AND: [
        {
          OR: [
            { recipientDecision: "INTERESTED", candidateDecision: null },
            { candidateDecision: "INTERESTED", recipientDecision: null },
          ],
        },
        ...(opts.userId ? [{ OR: [{ recipientId: opts.userId }, { candidateId: opts.userId }] }] : []),
      ],
    },
    select: {
      id: true, recipientId: true, candidateId: true, recipientDecision: true,
      recipient: { select: { gender: true } }, candidate: { select: { gender: true } },
    },
    take: 500,
  });

  let refunded = 0;
  for (const row of rows) {
    const recipientWaited = row.recipientDecision === "INTERESTED";
    const userId = recipientWaited ? row.recipientId : row.candidateId;
    const gender = (recipientWaited ? row.recipient : row.candidate).gender;
    try {
      const charged = await db.creditLedger.findFirst({
        where: { userId, reason: "INTEREST", refId: row.id },
        select: { id: true },
      });
      if (!charged) continue;
      const done = await db.$transaction(async (tx) => {
        const claim = await tx.suggestion.updateMany({
          where: { id: row.id, interestRefundedAt: null },
          data: { interestRefundedAt: now },
        });
        if (claim.count !== 1) return false;
        await tx.user.update({ where: { id: userId }, data: { matchCredits: { increment: 1 } } });
        await recordCredit({ userId, delta: 1, reason: "REFUND", refId: row.id }, tx);
        return true;
      });
      if (!done) continue;
      refunded++;
      await notify({
        userId,
        type: "PAYMENT",
        title: "أعدنا لك رصيداً",
        body:
          gender === "FEMALE"
            ? "انتهت مدة اقتراح أبديتِ اهتمامكِ به دون ردّ من الطرف الآخر، فأعدنا لكِ الرصيد."
            : "انتهت مدة اقتراح أبديت اهتمامك به دون ردّ من الطرف الآخر، فأعدنا لك الرصيد.",
        url: "/dashboard/suggestions",
        metadata: { suggestionId: row.id },
      }).catch((e) => console.error("[suggestions] refund notice:", e));
    } catch (error) {
      console.error("[suggestions] refund failed:", row.id, error);
    }
  }
  return { refunded };
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
  // Unanswered "مهتم" on the rows that just closed: credit back (only real charges)
  await refundUnansweredInterests({ userId, now: startedAt }).catch((e) => console.error("[suggestions] refunds:", e));
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

/**
 * Credit on interest going live: older-style (LEGACY) suggestions still waiting for a decision are
 * closed, so everyone is on the shared flow only. Their received interests (Like rows) have no
 * status: the feed hides them and /api/interests/[id]/accept refuses them while the flag is on.
 */
export async function closeLegacyInFlight(): Promise<{ closed: number }> {
  const { count } = await db.suggestion.updateMany({
    where: { flow: "LEGACY", status: "PENDING" },
    data: { status: "EXPIRED" },
  });
  return { closed: count };
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
    // At 0 only "مهتم" waits for a recharge ("لا" is free); checked before any consent is stored
    const me = await db.user.findUnique({ where: { id: userId }, select: { matchCredits: true } });
    if ((me?.matchCredits ?? 0) < 1) throw new IntroError("NO_CREDITS");
  }
  if (charge) {
    const { needsConsent } = await checkIntroPreference(userId, preference, flags.chat, args.guardianConsent);
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
    // The balance is read inside the transaction (row locked by the decrement), so of two
    // concurrent charges only the one that really reached 0 sends the exhausted notice
    creditsLeft = await db.$transaction(async (tx) => {
      const recorded = await claim(tx);
      if (recorded.count === 0) throw notFound();
      if (!(await reserveCredits(userId, 1, tx))) throw new IntroError("NO_CREDITS");
      await recordCredit({ userId, delta: -1, reason: "INTEREST", refId: s.id }, tx);
      const left = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { matchCredits: true } });
      return left.matchCredits;
    });
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
      // Both said «مهتم» but the partner left a moment ago: no match, so give both charges back
      await db.suggestion.updateMany({ where: { id: s.id }, data: { status: "EXPIRED", interestRefundedAt: new Date() } });
      for (const id of [userId, otherId]) {
        const charged = await db.creditLedger.findFirst({ where: { userId: id, reason: "INTEREST", refId: s.id }, select: { id: true } });
        if (!charged) continue;
        await db.$transaction(async (tx) => {
          await tx.user.update({ where: { id }, data: { matchCredits: { increment: 1 } } });
          await recordCredit({ userId: id, delta: 1, reason: "REFUND", refId: s.id }, tx);
        }).catch((e) => console.error("[suggestions] refund after a lost match:", s.id, id, e));
      }
      const refundedMe = extra.creditsLeft !== undefined ? { creditsLeft: extra.creditsLeft + 1 } : {};
      return { match: false, ...extra, ...refundedMe };
    }
    const me = await db.user.findUnique({ where: { id: userId }, select: { gender: true } });
    const femaleId = me?.gender === "FEMALE" ? userId : otherId;
    const maleId = femaleId === userId ? otherId : userId;
    // The row is already ACCEPTED and both "مهتم" were charged. On a failure here we do NOT
    // reopen the row: both decisions and charges are valid, and reopening would let the pair be
    // charged again. Log loudly so the match can be created by hand, then surface the error.
    let matchId: string;
    try {
      ({ matchId } = await createMutualMatch({ femaleId, maleId, suggestionId: s.id }));
    } catch (e) {
      console.error("[suggestions] createMutualMatch failed after ACCEPTED", { suggestionId: s.id, femaleId, maleId }, e);
      throw e;
    }
    return { match: true, matchId, ...extra };
  }

  if (after.recipientDecision !== null && after.candidateDecision !== null) {
    await db.suggestion.updateMany({ where: { id: s.id, status: "PENDING" }, data: { status: "REJECTED" } });
  }
  return { match: false, ...extra };
}
