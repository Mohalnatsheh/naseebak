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
 * (`refundUnansweredInterests`). A "لا" closes the row as REJECTED at once (owner decision 2026-10-18):
 * the other side's card disappears as if it expired (no notice, no way to pay for it), the slot frees,
 * and a card hidden from a full candidate is never revealed. A "لا" is never refunded; the owner
 * accepted that this lets people infer a "لا" (no refund) from silence (refund).
 */
import type { IntroPreference, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { notifyInterestCreditsExhausted, recordCredit, reserveCredits } from "@/lib/credits";
import { notify } from "@/lib/notify";
import { IntroError } from "@/lib/intro/errors";
import { createMutualMatch } from "@/lib/intro/match";
import { isUnavailable } from "@/lib/matches/state";
import { getCycleFlags } from "@/lib/settings";
import { activeWhere } from "@/lib/activity";
import { startOfAmmanDay } from "@/lib/amman-day";

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
      // Made while I was full: not mine to see until the other says «مهتم» or I free a slot
      { candidateId: userId, candidateDecision: null, recipient: activePerson, hiddenFromCandidate: false },
    ],
  };
}

/**
 * A card stops holding my slot once it is this old and the other person hasn't been on the site
 * for this long: someone who went quiet must not keep an active person waiting for 7 days.
 * The card stays visible (openMutualWhere) until it expires, so a late «مهتم» still works.
 */
export const SLOT_IDLE_DAYS = 2;

/**
 * The open rows that count toward `userId`'s MAX_OPEN_SUGGESTIONS: openMutualWhere minus cards
 * older than SLOT_IDLE_DAYS whose other person hasn't been seen for SLOT_IDLE_DAYS, and minus cards
 * still hidden from the other side (they can't answer it yet, so it doesn't take the recipient's slot).
 */
export function slotMutualWhere(userId: string, now = new Date()): Prisma.SuggestionWhereInput {
  const fresh = new Date(now.getTime() - SLOT_IDLE_DAYS * 24 * 60 * 60 * 1000);
  const partnerHere = activeWhere(SLOT_IDLE_DAYS, now);
  return {
    flow: "MUTUAL",
    status: "PENDING",
    expiresAt: { gt: now },
    OR: [
      { recipientId: userId, recipientDecision: null, candidate: activePerson, hiddenFromCandidate: false, OR: [{ createdAt: { gte: fresh } }, { candidate: partnerHere }] },
      { candidateId: userId, candidateDecision: null, recipient: activePerson, hiddenFromCandidate: false, OR: [{ createdAt: { gte: fresh } }, { recipient: partnerHere }] },
    ],
  };
}

/** Shown to the candidate now, with at least a full window ahead (a late reveal must not be a short one). */
function revealData(expiresAt: Date | null, now: Date) {
  const full = new Date(now.getTime() + MUTUAL_SUGGESTION_MS);
  // A reminder sent while hidden reached only the recipient: the revealed card gets its own
  return { hiddenFromCandidate: false, expiresAt: expiresAt && expiresAt > full ? expiresAt : full, reminderSentAt: null };
}

/**
 * `userId` has room again: show up to `room` of the cards made for others while they were full, best
 * match first. Returns how many were revealed (each gets a full 7-day window from now).
 */
export async function revealHiddenFor(userId: string, room: number, now = new Date()): Promise<number> {
  if (room <= 0) return 0;
  const hidden = await db.suggestion.findMany({
    where: {
      flow: "MUTUAL", status: "PENDING", expiresAt: { gt: now }, candidateId: userId, hiddenFromCandidate: true,
      candidateDecision: null, recipient: activePerson,
      // A card the recipient refused is never shown (a «لا» closes it; this also covers older rows)
      OR: [{ recipientDecision: null }, { recipientDecision: "INTERESTED" }],
    },
    select: { id: true, expiresAt: true },
    orderBy: [{ compatibilityScore: "desc" }, { createdAt: "asc" }],
    take: room,
  });
  let revealed = 0;
  for (const h of hidden) {
    const { count } = await db.suggestion.updateMany({
      where: { id: h.id, hiddenFromCandidate: true, status: "PENDING", OR: [{ recipientDecision: null }, { recipientDecision: "INTERESTED" }] },
      data: revealData(h.expiresAt, now),
    });
    revealed += count;
  }
  return revealed;
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
 * The «مهتم» credit came back. Neutral wording: it is sent for every early close (expiry, block,
 * dealbreaker, profile change, engagement, a match lost at the last moment), never says why.
 */
async function sendRefundNotice(userId: string, gender: string | null | undefined, suggestionId: string): Promise<void> {
  try {
    await notify({
      userId,
      type: "PAYMENT",
      title: "أعدنا لك رصيداً",
      body:
        gender === "FEMALE"
          ? "أُغلق اقتراح أبديتِ اهتمامكِ به قبل أن يكتمل التوافق، فأعدنا لكِ الرصيد."
          : "أُغلق اقتراح أبديت اهتمامك به قبل أن يكتمل التوافق، فأعدنا لك الرصيد.",
      url: "/dashboard/suggestions",
      metadata: { suggestionId },
    });
  } catch (e) {
    console.error("[suggestions] refund notice:", e);
  }
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
      await sendRefundNotice(userId, gender, row.id);
    } catch (error) {
      console.error("[suggestions] refund failed:", row.id, error);
    }
  }
  return { refunded };
}

/** Lazily close MUTUAL rows of this user whose time ran out. */
export async function expireMutualSuggestions(userId: string): Promise<void> {
  const startedAt = new Date();
  // Rows from before «لا» closed the card at once: one side declined, still PENDING → closed the same way
  await db.suggestion.updateMany({
    where: {
      flow: "MUTUAL",
      status: "PENDING",
      OR: [{ recipientId: userId }, { candidateId: userId }],
      AND: [{ OR: [{ recipientDecision: "DECLINED" }, { candidateDecision: "DECLINED" }] }],
    },
    data: { status: "REJECTED" },
  });
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

/** Fire-and-forget top-up after a decision freed slots; lazy import avoids the auto-suggest <-> mutual cycle. */
function topUpAfterDecision(userIds: string[]): void {
  void import("@/lib/matching/auto-suggest")
    .then(({ autoSuggestForUser }) =>
      Promise.all(userIds.map((id) => autoSuggestForUser(id).catch((e) => console.error("[suggestions] decision top-up:", id, e))))
    )
    .catch((e) => console.error("[suggestions] decision top-up:", userIds, e));
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

/** Give a «مهتم» charge back on a match lost at the last moment (the row's interestRefundedAt is already set). */
async function refundLostMatch(userId: string, suggestionId: string): Promise<boolean> {
  const charged = await db.creditLedger.findFirst({ where: { userId, reason: "INTEREST", refId: suggestionId }, select: { id: true } });
  if (!charged) return false;
  try {
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { matchCredits: { increment: 1 } } });
      await recordCredit({ userId, delta: 1, reason: "REFUND", refId: suggestionId }, tx);
    });
  } catch (e) {
    console.error("[suggestions] refund after a lost match:", suggestionId, userId, e);
    return false;
  }
  const person = await db.user.findUnique({ where: { id: userId }, select: { gender: true } }).catch(() => null);
  await sendRefundNotice(userId, person?.gender, suggestionId);
  return true;
}

/**
 * The other simultaneous «مهتم» created the match: find its id for the link (it may still be
 * being created, so look a few times before falling back to the general matches page).
 */
async function findMatchId(a: string, b: string): Promise<string | undefined> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const m = await db.mutualMatch
      .findFirst({ where: { OR: [{ femaleId: a, maleId: b }, { femaleId: b, maleId: a }] }, select: { id: true } })
      .catch(() => null);
    if (m) return m.id;
    if (attempt < 2) await new Promise((r) => setTimeout(r, 300));
  }
  return undefined;
}

const WAITING_TITLE = "اقتراح بانتظار قرارك";

/**
 * Someone said «مهتم» on a card the other person hasn't answered: nudge them, at most once per
 * Amman day (any «اقتراح بانتظار قرارك» today counts, the expiry reminder too). Neutral on purpose —
 * never says someone is interested (the card's own mark does that), never sent for a «لا».
 * Push + SMS fallback (event "waiting") through notify().
 */
async function notifyWaitingDecision(userId: string, suggestionId: string, now: Date): Promise<void> {
  const already = await db.notification.findFirst({
    where: { userId, type: "SUGGESTION", title: WAITING_TITLE, createdAt: { gte: startOfAmmanDay(now) } },
    select: { id: true },
  });
  if (already) return;
  const person = await db.user.findUnique({ where: { id: userId }, select: { gender: true } });
  const female = person?.gender === "FEMALE";
  await notify({
    userId,
    type: "SUGGESTION",
    title: WAITING_TITLE,
    body: female
      ? "لديك اقتراح توافق ينتظر قرارك. اطّلعي عليه قبل أن تنتهي مدته."
      : "لديك اقتراح توافق ينتظر قرارك. اطّلع عليه قبل أن تنتهي مدته.",
    url: "/dashboard/suggestions",
    metadata: { suggestionId },
    sms: "waiting",
  });
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
  if (side === "candidate" && s.hiddenFromCandidate) throw notFound();
  // A row from before «لا» closed the card at once: the other side already declined, so it is gone
  if ((side === "recipient" ? s.candidateDecision : s.recipientDecision) === "DECLINED") {
    await db.suggestion.updateMany({ where: { id: s.id, status: "PENDING" }, data: { status: "REJECTED" } });
    throw notFound();
  }

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
  // Validated now, stored only inside the transaction that records and charges the «مهتم» (below)
  const { needsConsent } = charge
    ? await checkIntroPreference(userId, preference, flags.chat, args.guardianConsent)
    : { needsConsent: false };

  // Record my decision once (a concurrent second tap loses here). A «لا» closes the row at once:
  // the other side's card disappears as if it expired and can no longer be paid for.
  const decision = interested ? "INTERESTED" : "DECLINED";
  const close = interested ? {} : { status: "REJECTED" as const };
  const claim = (client: Pick<typeof db, "suggestion">) =>
    client.suggestion.updateMany({
      where:
        side === "recipient"
          ? { id: s.id, flow: "MUTUAL", status: "PENDING", expiresAt: { gt: now }, recipientDecision: null }
          : { id: s.id, flow: "MUTUAL", status: "PENDING", expiresAt: { gt: now }, candidateDecision: null },
      data:
        side === "recipient"
          ? { recipientDecision: decision, recipientDecidedAt: now, ...close, ...(preference && { recipientIntroPreference: preference }) }
          : { candidateDecision: decision, candidateDecidedAt: now, ...close, ...(preference && { candidateIntroPreference: preference }) },
    });

  let creditsLeft: number | undefined;
  if (charge) {
    // Claim + charge + consent together: a lost claim charges nothing and stores no consent, a failed
    // reserve rolls the claim back. The balance is read inside the transaction (row locked by the
    // decrement), so of two concurrent charges only the one that really reached 0 sends the exhausted notice
    creditsLeft = await db.$transaction(async (tx) => {
      const recorded = await claim(tx);
      if (recorded.count === 0) throw notFound();
      if (!(await reserveCredits(userId, 1, tx))) throw new IntroError("NO_CREDITS");
      await recordCredit({ userId, delta: -1, reason: "INTEREST", refId: s.id }, tx);
      if (needsConsent) {
        await tx.parentInfo.updateMany({ where: { userId, shareConsentAt: null }, data: { shareConsentAt: now } });
      }
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
  // Made while the other was full: their card appears now, above their 5, with a full window
  if (interested && side === "recipient" && s.hiddenFromCandidate) {
    const { count } = await db.suggestion.updateMany({
      where: { id: s.id, hiddenFromCandidate: true, status: "PENDING" },
      data: revealData(s.expiresAt, now),
    });
    if (count === 1) {
      try {
        await notify({
          userId: s.candidateId,
          type: "SUGGESTION",
          title: "شخص أبدى اهتمامه بك",
          body: "وصلك اقتراح توافق من شخص مهتم بك. اطّلع عليه قبل أن تنتهي مدته.",
          url: "/dashboard/suggestions",
        });
      } catch (e) {
        console.error("[suggestions] reveal notice:", s.id, e);
      }
    }
  }
  if (flags.creditOnInterest) {
    // My «لا» freed the other side's slot too (a card still hidden from them held none)
    const otherFreed = !interested && !(side === "recipient" && s.hiddenFromCandidate);
    topUpAfterDecision(otherFreed ? [userId, otherId] : [userId]);
  }
  const extra = creditsLeft === undefined ? {} : { creditsLeft };
  if (!interested) return { match: false, ...extra };

  // Re-read: the other side may have decided at the same moment
  const after = await db.suggestion.findUnique({ where: { id: s.id } });
  if (!after) return { match: false, ...extra };

  if (after.recipientDecision === "INTERESTED" && after.candidateDecision === "INTERESTED") {
    // Only one of two simultaneous callers closes the row and creates the match
    const closed = await db.suggestion.updateMany({
      where: { id: s.id, status: "PENDING" },
      data: { status: "ACCEPTED" },
    });
    if (closed.count === 0) {
      // The other caller is creating the match: link to it when it is there
      const matchId = await findMatchId(userId, otherId);
      return { match: true, ...(matchId && { matchId }), ...extra };
    }
    // Re-check at the last moment: never create a match with someone who just left
    const partner = await db.user.findUnique({ where: { id: otherId }, select: { isDeactivated: true, status: true } });
    if (isUnavailable(partner)) {
      // Both said «مهتم» but the partner left a moment ago: no match, so give both charges back
      await db.suggestion.updateMany({ where: { id: s.id }, data: { status: "EXPIRED", interestRefundedAt: new Date() } });
      let refundedMe = false;
      for (const id of [userId, otherId]) {
        const done = await refundLostMatch(id, s.id);
        if (id === userId) refundedMe = done;
      }
      const back = extra.creditsLeft !== undefined && refundedMe ? { creditsLeft: extra.creditsLeft + 1 } : {};
      return { match: false, ...extra, ...back };
    }
    const me = await db.user.findUnique({ where: { id: userId }, select: { gender: true } });
    const femaleId = me?.gender === "FEMALE" ? userId : otherId;
    const maleId = femaleId === userId ? otherId : userId;
    // The row is already ACCEPTED and both "مهتم" were charged. On a failure here we do NOT
    // reopen the row: both decisions and charges are valid, and reopening would let the pair be
    // charged again. The decision is saved, so the member sees success (link to the matches page);
    // the daily job (healMissingMatches) creates the match on its next run.
    try {
      const { matchId } = await createMutualMatch({ femaleId, maleId, suggestionId: s.id });
      return { match: true, matchId, ...extra };
    } catch (e) {
      console.error("[suggestions] createMutualMatch failed after ACCEPTED", { suggestionId: s.id, femaleId, maleId }, e);
      return { match: true, ...extra };
    }
  }

  // Older rows only: the other side declined before «لا» closed rows at once
  if (after.recipientDecision !== null && after.candidateDecision !== null) {
    await db.suggestion.updateMany({ where: { id: s.id, status: "PENDING" }, data: { status: "REJECTED" } });
    return { match: false, ...extra };
  }
  // The other side hasn't answered yet: nudge them (a card just revealed from hidden already got
  // «شخص أبدى اهتمامه بك»; a card still hidden from them can't be answered, so no nudge either)
  const otherUndecided = (side === "recipient" ? after.candidateDecision : after.recipientDecision) === null;
  if (after.status === "PENDING" && otherUndecided && !(side === "recipient" && s.hiddenFromCandidate)) {
    await notifyWaitingDecision(otherId, s.id, now).catch((e) => console.error("[suggestions] waiting notice:", s.id, e));
  }
  return { match: false, ...extra };
}
