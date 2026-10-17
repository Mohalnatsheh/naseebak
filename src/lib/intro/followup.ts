/**
 * After the family introduction: how did it go?
 *
 * - Each side can tell us at any time on the match card: «ما زلنا نتعارف» (CONTINUING),
 *   «تمت الخطبة» (ENGAGED) or «لم يحصل نصيب» (NOT_A_MATCH).
 * - NOT_A_MATCH from either side closes the match for both: an open chat is ended, pending requests
 *   are cancelled, the partner is told gently.
 * - ENGAGED pauses that person's suggestions (open undecided ones close; the other side's unanswered
 *   «مهتم» is refunded) and asks the partner to confirm. Changing back to CONTINUING resumes them.
 * - The daily job asks «كيف يسير التعارف العائلي؟» 7 days after the family introduction, then every
 *   14 days while someone hasn't answered or is still CONTINUING, at most 3 times.
 * - Mixed choice (one chose family, the other chat): the chat-chooser is reminded once, 2 days on,
 *   to share their guardian contact; the family-chooser is told the moment it is shared.
 */
import type { MatchOutcome, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { notify, notifyMany } from "@/lib/notify";
import { cancelPendingBetween, isUnavailable } from "@/lib/matches/state";
import { refundUnansweredInterests } from "@/lib/suggestions/mutual";
import { publishChatEvent } from "@/lib/ably";

const DAY_MS = 24 * 60 * 60 * 1000;
export const FOLLOW_UP_FIRST_DAYS = 7;
export const FOLLOW_UP_REPEAT_DAYS = 14;
export const FOLLOW_UP_MAX = 3;
export const SHARE_REMIND_AFTER_DAYS = 2;
const BATCH = 300;

const matchUrl = (matchId: string) => `/dashboard/matches?match=${matchId}`;

export class FollowUpError extends Error {
  constructor(public code: "NOT_FOUND" | "NOT_ALLOWED", message = "غير متاح") {
    super(message);
  }
}

/** Users who told us they got engaged on one of their matches: no new suggestions for them. */
export const NOT_ENGAGED: Prisma.UserWhereInput = {
  matchesAsFemale: { none: { femaleOutcome: "ENGAGED" } },
  matchesAsMale: { none: { maleOutcome: "ENGAGED" } },
};

export async function isEngaged(userId: string): Promise<boolean> {
  const n = await db.mutualMatch.count({
    where: { OR: [{ femaleId: userId, femaleOutcome: "ENGAGED" }, { maleId: userId, maleOutcome: "ENGAGED" }] },
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

/** Close my open suggestions I haven't decided on (engaged: nothing new should reach me). */
async function closeOpenSuggestions(userId: string, now: Date): Promise<void> {
  await db.suggestion.updateMany({
    where: {
      flow: "MUTUAL",
      status: "PENDING",
      OR: [
        { recipientId: userId, recipientDecision: null },
        { candidateId: userId, candidateDecision: null },
      ],
    },
    data: { status: "EXPIRED", expiresAt: now },
  });
  await refundUnansweredInterests({ userId, now });
}

export async function setMatchOutcome(args: { matchId: string; userId: string; outcome: MatchOutcome }): Promise<void> {
  const { matchId, userId, outcome } = args;
  const now = new Date();
  const match = await db.mutualMatch.findFirst({
    where: { id: matchId, OR: [{ femaleId: userId }, { maleId: userId }] },
    select: {
      id: true, femaleId: true, maleId: true, femaleOutcome: true, maleOutcome: true,
      conversation: { select: { id: true, status: true } },
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

  await db.mutualMatch.update({
    where: { id: matchId },
    data: iAmFemale ? { femaleOutcome: outcome, femaleOutcomeAt: now } : { maleOutcome: outcome, maleOutcomeAt: now },
  });

  if (outcome === "NOT_A_MATCH") {
    await cancelPendingBetween(userId, partnerId);
    const chat = match.conversation;
    if (chat?.status === "ACTIVE") {
      await db.conversation.update({ where: { id: chat.id }, data: { status: "ENDED", endedById: userId, endedAt: now } });
      await publishChatEvent(chat.id, "status", { status: "ENDED" }).catch(() => {});
    }
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

/**
 * Mixed choice: remind the side that chose chat (once, 2 days after the match opened) that the other
 * side is waiting for their guardian contact.
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
    take: BATCH,
  });
  let reminded = 0;
  for (const m of rows) {
    // (filtered here: `{ not: X }` in Prisma would also drop the NULL "no answer yet" rows)
    if (m.femaleOutcome === "NOT_A_MATCH" || m.maleOutcome === "NOT_A_MATCH") {
      await db.mutualMatch.updateMany({ where: { id: m.id, guardianShareRemindedAt: null }, data: { guardianShareRemindedAt: now } });
      continue;
    }
    const claimed = await db.mutualMatch.updateMany({
      where: { id: m.id, guardianShareRemindedAt: null },
      data: { guardianShareRemindedAt: now },
    });
    if (claimed.count !== 1 || isUnavailable(m.female) || isUnavailable(m.male)) continue;
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
      body: "الطرف الآخر فضّل التعارف العائلي وينتظر مشاركتك. يمكنك المشاركة أو إنهاء التعارف من صفحة التوافق.",
      url: matchUrl(m.id),
    });
    reminded++;
  }
  return { reminded };
}

/** «كيف يسير التعارف العائلي؟» to each side that hasn't answered or is still CONTINUING. */
export async function runFamilyFollowUps(now = new Date()): Promise<{ matches: number; notified: number }> {
  const firstDue = new Date(now.getTime() - FOLLOW_UP_FIRST_DAYS * DAY_MS);
  const repeatDue = new Date(now.getTime() - FOLLOW_UP_REPEAT_DAYS * DAY_MS);
  const rows = await db.mutualMatch.findMany({
    where: {
      followUpCount: { lt: FOLLOW_UP_MAX },
      OR: [{ followUpSentAt: null }, { followUpSentAt: { lte: repeatDue } }],
      introRequests: { some: { type: "FAMILY", status: "ACCEPTED", respondedAt: { lte: firstDue } } },
    },
    select: {
      id: true, femaleId: true, maleId: true, femaleOutcome: true, maleOutcome: true, followUpCount: true, followUpSentAt: true,
      femaleGuardianShareAt: true, maleGuardianShareAt: true, openedAt: true,
      female: { select: { isDeactivated: true, status: true } },
      male: { select: { isDeactivated: true, status: true } },
    },
    take: BATCH,
  });

  let matches = 0;
  let notified = 0;
  for (const m of rows) {
    // Closed or settled: nothing to ask
    if (m.femaleOutcome === "NOT_A_MATCH" || m.maleOutcome === "NOT_A_MATCH") continue;
    if (m.femaleOutcome === "ENGAGED" && m.maleOutcome === "ENGAGED") continue;
    if (isUnavailable(m.female) || isUnavailable(m.male)) continue;
    // Mixed choice still waiting for one side's guardian contact: the families haven't met yet
    if (m.openedAt && (!m.femaleGuardianShareAt || !m.maleGuardianShareAt)) continue;
    const blocked = await db.block.findFirst({
      where: { OR: [{ blockerId: m.femaleId, blockedId: m.maleId }, { blockerId: m.maleId, blockedId: m.femaleId }] },
      select: { id: true },
    });
    if (blocked) continue;

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
 */
export async function cancelClosedLegacyVisits(): Promise<{ cancelled: number }> {
  const visits = await db.visitRequest.findMany({
    where: { status: "REQUESTED" },
    select: {
      id: true,
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
    take: BATCH,
  });
  let cancelled = 0;
  for (const v of visits) {
    const m = v.match;
    let reason: string | null = null;
    if (m.femaleOutcome === "NOT_A_MATCH" || m.maleOutcome === "NOT_A_MATCH") reason = "one side said it is not a match";
    else if (isUnavailable(m.female) || isUnavailable(m.male)) reason = "an account is no longer active";
    else if (m.introRequests.length > 0) reason = "the family introduction was declined";
    else if (m.conversation?.status === "ENDED" && m.conversation.endedById) reason = "a user ended their chat";
    else {
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
  return { cancelled };
}
