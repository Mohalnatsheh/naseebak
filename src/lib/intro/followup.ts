/**
 * After the family introduction: how did it go?
 *
 * - Each side can tell us at any time on the match card: «ما زلنا نتعارف» (CONTINUING),
 *   «تمت الخطبة» (ENGAGED) or «لم يحصل نصيب» (NOT_A_MATCH).
 * - NOT_A_MATCH from either side closes the match for both: an open chat is ended, pending requests
 *   are cancelled, the partner is told gently.
 *   A partner's earlier ENGAGED on that match is reset (an engagement one side denies doesn't count).
 * - ENGAGED pauses that person's suggestions (all their open shared suggestions close, whatever they
 *   answered; an unanswered «مهتم» on either side is refunded) and asks the partner to confirm. Their
 *   other open matches close for them (open chats end, pending requests are cancelled, the partner is
 *   told). Changing back to CONTINUING resumes suggestions (ended chats stay ended).
 * - The daily job asks «كيف يسير التعارف العائلي؟» 7 days after the family introduction (or a visit
 *   the team arranged the old way), then every 14 days while someone hasn't answered or is still
 *   CONTINUING, at most 3 times.
 * - Mixed choice (one chose family, the other chat): the chat-chooser is reminded once, 2 days on,
 *   to share their guardian contact; the family-chooser is told the moment it is shared.
 */
import type { MatchOutcome, Prisma, VisitStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { notify, notifyMany } from "@/lib/notify";
import { LEGACY_ADMIN_VISIT, cancelPendingBetween, isUnavailable, loadMatchStates } from "@/lib/matches/state";
import { refundUnansweredInterests } from "@/lib/suggestions/mutual";
import { publishChatEvent } from "@/lib/ably";
import { getCycleFlags } from "@/lib/settings";
import { endPausedChats } from "@/lib/reports";

const DAY_MS = 24 * 60 * 60 * 1000;
export const FOLLOW_UP_FIRST_DAYS = 7;
export const FOLLOW_UP_REPEAT_DAYS = 14;
export const FOLLOW_UP_MAX = 3;
export const SHARE_REMIND_AFTER_DAYS = 2;
const BATCH = 300;
/** Pages of BATCH rows a daily task walks through at most (so nothing is starved by rows that stay) */
const MAX_PAGES = 10;
/** New cycle: an old-flow visit request nobody acted on for this long is closed */
export const LEGACY_VISIT_STALE_DAYS = 30;

const matchUrl = (matchId: string) => `/dashboard/matches?match=${matchId}`;

export class FollowUpError extends Error {
  constructor(public code: "NOT_FOUND" | "NOT_ALLOWED", message = "غير متاح") {
    super(message);
  }
}

/** The other side hasn't said «لم يحصل نصيب» (written out: `{ not: X }` would also drop the NULL rows) */
const maleNotEnded: Prisma.MutualMatchWhereInput = { OR: [{ maleOutcome: null }, { maleOutcome: { not: "NOT_A_MATCH" } }] };
const femaleNotEnded: Prisma.MutualMatchWhereInput = { OR: [{ femaleOutcome: null }, { femaleOutcome: { not: "NOT_A_MATCH" } }] };
/** Neither side said «لم يحصل نصيب» */
const MATCH_NOT_ENDED: Prisma.MutualMatchWhereInput = { AND: [maleNotEnded, femaleNotEnded] };

/**
 * Users who told us they got engaged on one of their matches: no new suggestions for them.
 * An ENGAGED the other side answered with «لم يحصل نصيب» doesn't count.
 */
export const NOT_ENGAGED: Prisma.UserWhereInput = {
  matchesAsFemale: { none: { femaleOutcome: "ENGAGED", ...maleNotEnded } },
  matchesAsMale: { none: { maleOutcome: "ENGAGED", ...femaleNotEnded } },
};

export async function isEngaged(userId: string): Promise<boolean> {
  const n = await db.mutualMatch.count({
    where: {
      OR: [
        { femaleId: userId, femaleOutcome: "ENGAGED", ...maleNotEnded },
        { maleId: userId, maleOutcome: "ENGAGED", ...femaleNotEnded },
      ],
    },
  });
  return n > 0;
}

/** The two sides' answers, mine first. */
export function outcomesFor(
  m: { femaleId: string; femaleOutcome: MatchOutcome | null; maleOutcome: MatchOutcome | null },
  userId: string
): { mine: MatchOutcome | null; partner: MatchOutcome | null } {
  const iAmFemale = m.femaleId === userId;
  return iAmFemale
    ? { mine: m.femaleOutcome, partner: m.maleOutcome }
    : { mine: m.maleOutcome, partner: m.femaleOutcome };
}

/**
 * Engaged: close every open shared suggestion I'm part of — also those I already said «مهتم» to,
 * or someone could still pay to match me. An unanswered «مهتم» (mine or theirs) is refunded.
 */
async function closeOpenSuggestions(userId: string, now: Date): Promise<void> {
  await db.suggestion.updateMany({
    where: { flow: "MUTUAL", status: "PENDING", OR: [{ recipientId: userId }, { candidateId: userId }] },
    data: { status: "EXPIRED", expiresAt: now },
  });
  await refundUnansweredInterests({ userId, now });
}

/**
 * Engaged on `matchId`: my other open matches close (they show me as unavailable, see describeMatch):
 * an open chat ends, pending requests are cancelled and the partner is told once.
 */
async function closeOtherMatches(userId: string, matchIds: { id: string; partnerId: string }[], now: Date): Promise<number> {
  let closed = 0;
  for (const { id, partnerId } of matchIds) {
    try {
      await cancelPendingBetween(userId, partnerId);
      const chat = await db.conversation.findUnique({ where: { matchId: id }, select: { id: true, status: true } });
      if (chat?.status === "ACTIVE") {
        const ended = await db.conversation.updateMany({
          where: { id: chat.id, status: "ACTIVE" },
          data: { status: "ENDED", endedById: userId, endedAt: now },
        });
        if (ended.count === 1) await publishChatEvent(chat.id, "status", { status: "ENDED" }).catch(() => {});
      }
      await endPausedChats({ id }, { endedById: userId });
      await notify({
        userId: partnerId,
        type: "MATCH",
        title: "انتهى أحد التوافقات",
        body: "لم يعد الطرف الآخر متاحاً لهذا التوافق. نتمنى لك التوفيق في اقتراحاتك القادمة.",
        url: matchUrl(id),
      });
      closed++;
    } catch (error) {
      console.error(`[followup] close other match ${id}:`, error);
    }
  }
  return closed;
}

/**
 * The families were introduced on this match (= `followUp.ask` in getMatchIntroState): an accepted
 * FAMILY introduction with both guardian stamps (matches opened under credit on interest; older
 * matches: the accepted introduction is enough), or a legacy visit the team arranged.
 */
export async function familiesIntroduced(match: {
  id: string;
  openedAt: Date | null;
  femaleGuardianShareAt: Date | null;
  maleGuardianShareAt: Date | null;
  visitRequest: { status: VisitStatus } | null;
}): Promise<boolean> {
  if (match.visitRequest && LEGACY_ADMIN_VISIT.includes(match.visitRequest.status)) return true;
  const family = await db.introRequest.findFirst({
    where: { matchId: match.id, type: "FAMILY", status: "ACCEPTED" },
    select: { id: true },
  });
  if (!family) return false;
  return !match.openedAt || (!!match.femaleGuardianShareAt && !!match.maleGuardianShareAt);
}

export async function setMatchOutcome(args: { matchId: string; userId: string; outcome: MatchOutcome }): Promise<void> {
  const { matchId, userId, outcome } = args;
  const now = new Date();
  const match = await db.mutualMatch.findFirst({
    where: { id: matchId, OR: [{ femaleId: userId }, { maleId: userId }] },
    select: {
      id: true, femaleId: true, maleId: true, femaleOutcome: true, maleOutcome: true,
      openedAt: true, femaleGuardianShareAt: true, maleGuardianShareAt: true,
      conversation: { select: { id: true, status: true } },
      visitRequest: { select: { status: true } },
    },
  });
  if (!match) throw new FollowUpError("NOT_FOUND", "التوافق غير موجود");
  const iAmFemale = match.femaleId === userId;
  const partnerId = iAmFemale ? match.maleId : match.femaleId;
  const blockedByThem = await db.block.findFirst({ where: { blockerId: partnerId, blockedId: userId }, select: { id: true } });
  if (blockedByThem) throw new FollowUpError("NOT_FOUND", "التوافق غير موجود");

  const { mine: previous, partner } = outcomesFor(match, userId);
  // Once someone said «لم يحصل نصيب» the match is closed for both
  if (previous === "NOT_A_MATCH" || partner === "NOT_A_MATCH") throw new FollowUpError("NOT_ALLOWED", "انتهى هذا التوافق");
  if (previous === outcome) return;
  // «تمت الخطبة» only after the families met: the same condition that shows «كيف يسير التعارف العائلي؟»
  if (outcome === "ENGAGED" && !(await familiesIntroduced(match))) {
    throw new FollowUpError("NOT_ALLOWED", "يمكنك إخبارنا بالخطبة بعد إتمام التعارف العائلي على هذا التوافق");
  }

  // Engaged: note my other matches that are still open before this answer closes them
  const others =
    outcome === "ENGAGED"
      ? [...(await loadMatchStates(userId, await getCycleFlags())).entries()]
          .filter(([id, st]) => id !== matchId && st.closed === null)
          .map(([id, st]) => ({ id, partnerId: st.partnerId }))
      : [];

  // «لم يحصل نصيب» also resets the partner's ENGAGED on this match, so they aren't kept out of
  // suggestions by an engagement that didn't happen
  const resetPartner = outcome === "NOT_A_MATCH" && partner === "ENGAGED";
  await db.mutualMatch.update({
    where: { id: matchId },
    data: iAmFemale
      ? { femaleOutcome: outcome, femaleOutcomeAt: now, ...(resetPartner && { maleOutcome: null, maleOutcomeAt: now }) }
      : { maleOutcome: outcome, maleOutcomeAt: now, ...(resetPartner && { femaleOutcome: null, femaleOutcomeAt: now }) },
  });

  if (outcome === "NOT_A_MATCH") {
    await cancelPendingBetween(userId, partnerId);
    const chat = match.conversation;
    if (chat?.status === "ACTIVE") {
      await db.conversation.update({ where: { id: chat.id }, data: { status: "ENDED", endedById: userId, endedAt: now } });
      await publishChatEvent(chat.id, "status", { status: "ENDED" }).catch(() => {});
    }
    await endPausedChats({ id: matchId }, { endedById: userId });
    await notify({
      userId: partnerId,
      type: "MATCH",
      title: "انتهى التعارف",
      body: "أخبرنا الطرف الآخر أنه لم يُكتب نصيب في هذا التعارف. نتمنى لك التوفيق في اقتراحاتك القادمة.",
      url: matchUrl(matchId),
    });
    return;
  }

  if (outcome === "ENGAGED") {
    await closeOpenSuggestions(userId, now);
    await closeOtherMatches(userId, others, now);
    if (partner !== "ENGAGED") {
      await notify({
        userId: partnerId,
        type: "MATCH",
        title: "مبارك! 🎉",
        body: "أخبرنا الطرف الآخر أن التعارف انتهى بالخطبة. أكّد ذلك من صفحة التوافق لنتوقف عن إرسال الاقتراحات.",
        url: matchUrl(matchId),
      });
    }
  }
}

/** Both people can still take part (not deactivated, not suspended) — filtered in the query. */
const BOTH_AVAILABLE: Prisma.MutualMatchWhereInput = {
  female: { isDeactivated: false, status: { not: "SUSPENDED" } },
  male: { isDeactivated: false, status: { not: "SUSPENDED" } },
};

/**
 * Mixed choice: remind the side that chose chat (once, 2 days after the match opened) that the other
 * side is waiting for their guardian contact. Every row read is claimed (reminded or skipped), so the
 * same rows never come back; oldest first.
 */
export async function remindGuardianShare(now = new Date()): Promise<{ reminded: number }> {
  const before = new Date(now.getTime() - SHARE_REMIND_AFTER_DAYS * DAY_MS);
  const rows = await db.mutualMatch.findMany({
    where: {
      openedAt: { not: null, lte: before },
      guardianShareRemindedAt: null,
      OR: [
        { femaleGuardianShareAt: null, maleGuardianShareAt: { not: null } },
        { maleGuardianShareAt: null, femaleGuardianShareAt: { not: null } },
      ],
      introRequests: { some: { type: "FAMILY", status: "ACCEPTED" } },
    },
    select: {
      id: true, femaleId: true, maleId: true, femaleGuardianShareAt: true, femaleOutcome: true, maleOutcome: true,
      female: { select: { isDeactivated: true, status: true } },
      male: { select: { isDeactivated: true, status: true } },
    },
    orderBy: { openedAt: "asc" },
    take: BATCH,
  });
  let reminded = 0;
  for (const m of rows) {
    const claimed = await db.mutualMatch.updateMany({
      where: { id: m.id, guardianShareRemindedAt: null },
      data: { guardianShareRemindedAt: now },
    });
    if (claimed.count !== 1 || isUnavailable(m.female) || isUnavailable(m.male)) continue;
    // Ended, or engaged (by either side): nothing to remind
    if ([m.femaleOutcome, m.maleOutcome].some((o) => o === "NOT_A_MATCH" || o === "ENGAGED")) continue;
    const blocked = await db.block.findFirst({
      where: { OR: [{ blockerId: m.femaleId, blockedId: m.maleId }, { blockerId: m.maleId, blockedId: m.femaleId }] },
      select: { id: true },
    });
    if (blocked) continue;
    const waiting = m.femaleGuardianShareAt ? m.maleId : m.femaleId;
    await notify({
      userId: waiting,
      type: "MATCH",
      title: "بانتظار مشاركة بيانات وليّ أمرك",
      body: "الطرف الآخر فضّل التعارف العائلي وينتظر مشاركتك لتتبادل العائلتان بيانات التواصل. يمكنك المشاركة أو إنهاء التعارف من صفحة التوافق.",
      url: matchUrl(m.id),
    });
    reminded++;
  }
  return { reminded };
}

/**
 * «كيف يسير التعارف العائلي؟» to each side that hasn't answered or is still CONTINUING.
 * Due: 7 days after an accepted family introduction, or after the team arranged a visit the old way
 * (legacy VisitRequest past REQUESTED). Closed/settled rows are filtered in the query and the oldest
 * asked come first; a blocked pair is marked as asked (no count) so it doesn't come back every day.
 */
export async function runFamilyFollowUps(now = new Date()): Promise<{ matches: number; notified: number }> {
  const firstDue = new Date(now.getTime() - FOLLOW_UP_FIRST_DAYS * DAY_MS);
  const repeatDue = new Date(now.getTime() - FOLLOW_UP_REPEAT_DAYS * DAY_MS);
  const rows = await db.mutualMatch.findMany({
    where: {
      AND: [
        { followUpCount: { lt: FOLLOW_UP_MAX } },
        { OR: [{ followUpSentAt: null }, { followUpSentAt: { lte: repeatDue } }] },
        {
          OR: [
            { introRequests: { some: { type: "FAMILY", status: "ACCEPTED", respondedAt: { lte: firstDue } } } },
            { visitRequest: { status: { in: LEGACY_ADMIN_VISIT as VisitStatus[] }, updatedAt: { lte: firstDue } } },
          ],
        },
        MATCH_NOT_ENDED,
        // Both engaged: settled
        {
          OR: [
            { femaleOutcome: null }, { femaleOutcome: { not: "ENGAGED" } },
            { maleOutcome: null }, { maleOutcome: { not: "ENGAGED" } },
          ],
        },
        BOTH_AVAILABLE,
        // Mixed choice still waiting for one side's guardian contact: the families haven't met yet
        { OR: [{ openedAt: null }, { femaleGuardianShareAt: { not: null }, maleGuardianShareAt: { not: null } }] },
      ],
    },
    select: {
      id: true, femaleId: true, maleId: true, femaleOutcome: true, maleOutcome: true, followUpCount: true, followUpSentAt: true,
      femaleGuardianShareAt: true, maleGuardianShareAt: true, openedAt: true,
      female: { select: { isDeactivated: true, status: true } },
      male: { select: { isDeactivated: true, status: true } },
    },
    orderBy: [{ followUpSentAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
    take: BATCH,
  });

  let matches = 0;
  let notified = 0;
  for (const m of rows) {
    // (also checked here, in case a row changed since the query)
    if (m.femaleOutcome === "NOT_A_MATCH" || m.maleOutcome === "NOT_A_MATCH") continue;
    if (m.femaleOutcome === "ENGAGED" && m.maleOutcome === "ENGAGED") continue;
    if (isUnavailable(m.female) || isUnavailable(m.male)) continue;
    if (m.openedAt && (!m.femaleGuardianShareAt || !m.maleGuardianShareAt)) continue;
    const blocked = await db.block.findFirst({
      where: { OR: [{ blockerId: m.femaleId, blockedId: m.maleId }, { blockerId: m.maleId, blockedId: m.femaleId }] },
      select: { id: true },
    });
    if (blocked) {
      // Skipped marker: back in 14 days at the earliest, without using up a follow-up
      await db.mutualMatch.updateMany({
        where: { id: m.id, followUpCount: m.followUpCount, followUpSentAt: m.followUpSentAt },
        data: { followUpSentAt: now },
      });
      continue;
    }

    const ask = [
      { id: m.femaleId, outcome: m.femaleOutcome },
      { id: m.maleId, outcome: m.maleOutcome },
    ]
      .filter((s) => s.outcome === null || s.outcome === "CONTINUING")
      .map((s) => s.id);
    if (ask.length === 0) continue;

    const claimed = await db.mutualMatch.updateMany({
      where: { id: m.id, followUpCount: m.followUpCount, followUpSentAt: m.followUpSentAt },
      data: { followUpCount: { increment: 1 }, followUpSentAt: now },
    });
    if (claimed.count !== 1) continue;
    await notifyMany(ask, {
      type: "MATCH",
      title: "كيف يسير التعارف العائلي؟",
      body: "أخبرنا بما وصلتم إليه: ما زلنا نتعارف، تمت الخطبة، أو لم يحصل نصيب.",
      url: matchUrl(m.id),
    });
    matches++;
    notified += ask.length;
  }
  return { matches, notified };
}

/**
 * Old-flow visit requests still at REQUESTED whose match has since closed (a block, an inactive account,
 * «لم يحصل نصيب», a declined family request or a chat a user ended): cancel them so they leave the admin
 * queue, and so an admin acting on one can't flip a closed match back to "arranging a visit".
 * With the new cycle on (`intro_requests_enabled`), a REQUESTED visit nobody touched for
 * LEGACY_VISIT_STALE_DAYS is closed too: the members use the family / chat requests instead.
 * Walks all REQUESTED visits (oldest first, page by page), so open ones can't starve the rest.
 */
export async function cancelClosedLegacyVisits(now = new Date()): Promise<{ cancelled: number }> {
  const newCycle = (await getCycleFlags()).introRequests;
  const staleBefore = new Date(now.getTime() - LEGACY_VISIT_STALE_DAYS * DAY_MS);
  let cancelled = 0;
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const visits = await db.visitRequest.findMany({
      where: { status: "REQUESTED" },
      select: {
        id: true,
        updatedAt: true,
        match: {
          select: {
            femaleId: true, maleId: true, femaleOutcome: true, maleOutcome: true,
            female: { select: { isDeactivated: true, status: true } },
            male: { select: { isDeactivated: true, status: true } },
            conversation: { select: { status: true, endedById: true } },
            introRequests: { where: { type: "FAMILY", status: "DECLINED" }, select: { id: true } },
          },
        },
      },
      orderBy: { id: "asc" },
      take: BATCH,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });
    for (const v of visits) {
      const m = v.match;
      let reason: string | null = null;
      if (m.femaleOutcome === "NOT_A_MATCH" || m.maleOutcome === "NOT_A_MATCH") reason = "one side said it is not a match";
      else if (isUnavailable(m.female) || isUnavailable(m.male)) reason = "an account is no longer active";
      else if (m.introRequests.length > 0) reason = "the family introduction was declined";
      else if (m.conversation?.status === "ENDED" && m.conversation.endedById) reason = "a user ended their chat";
      else if (newCycle && v.updatedAt <= staleBefore) {
        reason = `no admin action for ${LEGACY_VISIT_STALE_DAYS} days; the new cycle's family/chat requests replace it`;
      } else {
        const block = await db.block.findFirst({
          where: { OR: [{ blockerId: m.femaleId, blockedId: m.maleId }, { blockerId: m.maleId, blockedId: m.femaleId }] },
          select: { id: true },
        });
        if (block) reason = "one side blocked the other";
      }
      if (!reason) continue;
      const { count } = await db.visitRequest.updateMany({
        where: { id: v.id, status: "REQUESTED" },
        data: { status: "CANCELLED", adminNotes: `Closed automatically: ${reason}` },
      });
      cancelled += count;
    }
    if (visits.length < BATCH) break;
    cursor = visits[visits.length - 1].id;
  }
  return { cancelled };
}
