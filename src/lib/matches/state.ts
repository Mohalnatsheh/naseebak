/**
 * Is a mutual match still "alive" for the viewer, and is there anything left to do on it?
 *
 * - blocked:  I blocked the partner → closed card for me (with unblock). A partner who blocked
 *             me makes the match disappear from my list entirely (see `hiddenPartnerIds`).
 * - inactive: the partner deactivated their account or was suspended → closed card, no actions.
 * - finished: both introduction paths are used up (family declined, or a chat I/they ended;
 *             chat declined or already had) and nothing is pending or open → calm closed card.
 *
 * Pure rules live in `describeMatch` so the matches list, the intro panel state and the
 * dashboard counts all agree.
 */
import type { IntroRequestType, Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * ended: someone said «لم يحصل نصيب» after the introduction · engaged: I told us it ended in an engagement
 * (see src/lib/intro/followup.ts)
 */
/** Days after a chat ran out (no family request since) before the match counts as finished */
export const CHAT_STALE_DAYS = 14;

/** The free chat → family move stays open until the match fades: CHAT_STALE_DAYS after the chat ran out */
export function familyMoveOpenUntil(chatExpiresAt: Date): Date {
  return new Date(chatExpiresAt.getTime() + CHAT_STALE_DAYS * 24 * 60 * 60 * 1000);
}

export type MatchClosure = "blocked" | "inactive" | "finished" | "ended" | "engaged";

/** Admin is already arranging (or arranged) the visit the old way */
export const LEGACY_ADMIN_VISIT = ["FAMILIES_CONTACTED", "SCHEDULED", "COMPLETED"];

/** A user who can't take part any more (deactivated or suspended). A deleted user is gone (cascade). */
export const UNAVAILABLE_USER: Prisma.UserWhereInput = {
  OR: [{ isDeactivated: true }, { status: "SUSPENDED" }],
};

export function isUnavailable(u: { isDeactivated?: boolean | null; status?: string | null } | null | undefined): boolean {
  return !u || !!u.isDeactivated || u.status === "SUSPENDED";
}

export interface MatchFacts {
  requests: { type: IntroRequestType | string; status: string; expiresAt: Date }[];
  conversation: { status: string; expiresAt: Date; endedById?: string | null } | null;
  visitStatus?: string | null;
  partnerUnavailable: boolean;
  blockedByMe: boolean;
  chatEnabled: boolean;
  introEnabled: boolean;
  /** Follow-up answers, mine and the partner's */
  outcomes?: { mine: string | null; partner: string | null };
  /** «تمت الخطبة» on another match: I'm engaged (closed "engaged") / the partner is (closed "inactive") */
  engagedElsewhere?: { mine: boolean; partner: boolean };
}

export interface MatchDescription {
  closed: MatchClosure | null;
  /**
   * The viewer still has to choose how to start on this match: a family or chat request can be sent
   * and nothing is under way yet (no accepted family introduction, open chat or pending request).
   * A later move (e.g. a chat request after a family introduction) stays possible, it just isn't nagged.
   */
  actionable: boolean;
  /** The chat was ended by one of the two users (not expired, not ended by an admin) */
  chatEndedByUser: boolean;
}

export function chatEndedByUser(c: MatchFacts["conversation"]): boolean {
  return !!c && c.status === "ENDED" && !!c.endedById;
}

export function describeMatch(f: MatchFacts, now = new Date()): MatchDescription {
  const endedByUser = chatEndedByUser(f.conversation);
  if (f.blockedByMe) return { closed: "blocked", actionable: false, chatEndedByUser: endedByUser };
  if (f.partnerUnavailable) return { closed: "inactive", actionable: false, chatEndedByUser: endedByUser };
  if (f.outcomes?.mine === "NOT_A_MATCH" || f.outcomes?.partner === "NOT_A_MATCH") {
    return { closed: "ended", actionable: false, chatEndedByUser: endedByUser };
  }
  // Engaged with someone else: not available on this match any more (shown like an inactive account)
  if (f.engagedElsewhere?.partner) return { closed: "inactive", actionable: false, chatEndedByUser: endedByUser };
  if (f.outcomes?.mine === "ENGAGED" || f.engagedElsewhere?.mine) {
    return { closed: "engaged", actionable: false, chatEndedByUser: endedByUser };
  }

  const of = (type: string, status: string) =>
    f.requests.some((r) => r.type === type && r.status === status && (status !== "PENDING" || r.expiresAt > now));
  const acceptedFamily = of("FAMILY", "ACCEPTED");
  const pendingFamily = of("FAMILY", "PENDING");
  const declinedFamily = of("FAMILY", "DECLINED");
  const pendingChat = of("CHAT", "PENDING");
  const declinedChat = of("CHAT", "DECLINED");
  const legacyAdmin = !!f.visitStatus && LEGACY_ADMIN_VISIT.includes(f.visitStatus);
  const chatOpen =
    !!f.conversation && f.conversation.status === "ACTIVE" && f.conversation.expiresAt > now;

  const canSendFamily = !acceptedFamily && !pendingFamily && !declinedFamily && !legacyAdmin && !endedByUser;
  // A chat that ran out more than CHAT_STALE_DAYS ago with no family request after it: the match
  // has faded, close it instead of keeping it "to do" forever
  const chatFaded =
    !!f.conversation &&
    f.conversation.status !== "ENDED" &&
    f.conversation.expiresAt.getTime() < now.getTime() - CHAT_STALE_DAYS * 24 * 60 * 60 * 1000;
  const canSendChat = f.chatEnabled && !f.conversation && !pendingChat && !declinedChat;

  const finished =
    !acceptedFamily &&
    !pendingFamily &&
    !pendingChat &&
    !legacyAdmin &&
    !chatOpen &&
    (((declinedFamily || endedByUser) && (declinedChat || !!f.conversation)) || chatFaded);

  return {
    closed: finished ? "finished" : null,
    actionable:
      f.introEnabled &&
      !finished &&
      (canSendFamily || canSendChat) &&
      !acceptedFamily &&
      !chatOpen &&
      !pendingFamily &&
      !pendingChat,
    chatEndedByUser: endedByUser,
  };
}

type OutcomeRow = { id: string; femaleId: string; maleId: string; femaleOutcome: string | null; maleOutcome: string | null };

/**
 * A side's «تمت الخطبة» counts only while the other side hasn't said «لم يحصل نصيب» on that match
 * (older rows can hold both; see setMatchOutcome).
 */
export function engagedOn(m: OutcomeRow, userId: string): boolean {
  if (m.femaleId === userId) return m.femaleOutcome === "ENGAGED" && m.maleOutcome !== "NOT_A_MATCH";
  if (m.maleId === userId) return m.maleOutcome === "ENGAGED" && m.femaleOutcome !== "NOT_A_MATCH";
  return false;
}

/**
 * Who of `userIds` is engaged, and on which match: `elsewhere(userId, matchId)` is true when they said
 * «تمت الخطبة» on a match other than `matchId`.
 */
export async function loadEngagements(userIds: string[]): Promise<{ elsewhere: (userId: string, matchId: string) => boolean }> {
  const ids = [...new Set(userIds)];
  const rows: OutcomeRow[] = ids.length
    ? ((await db.mutualMatch.findMany({
        where: {
          OR: [
            { femaleId: { in: ids }, femaleOutcome: "ENGAGED" },
            { maleId: { in: ids }, maleOutcome: "ENGAGED" },
          ],
        },
        select: { id: true, femaleId: true, maleId: true, femaleOutcome: true, maleOutcome: true },
      })) ?? [])
    : [];
  return { elsewhere: (userId, matchId) => rows.some((m) => m.id !== matchId && engagedOn(m, userId)) };
}

/** Partners who blocked me: their matches are hidden from my list. */
export async function hiddenPartnerIds(userId: string): Promise<string[]> {
  const rows = await db.block.findMany({ where: { blockedId: userId }, select: { blockerId: true } });
  return rows.map((r) => r.blockerId);
}

/**
 * My conversations, minus those with a partner who blocked me (hidden from me like the match):
 * use it for anything that counts or lists chats (badges, re-engagement, realtime tokens).
 */
export function visibleConversationsWhere(userId: string, hidden: string[]): Prisma.ConversationWhereInput {
  return {
    match: {
      OR: [
        { femaleId: userId, maleId: { notIn: hidden } },
        { maleId: userId, femaleId: { notIn: hidden } },
      ],
    },
  };
}

/** Is there a block between the two, and who made it? */
export async function blockBetween(
  me: string,
  partner: string
): Promise<{ byMe: string | null; byThem: boolean }> {
  const rows = await db.block.findMany({
    where: { OR: [{ blockerId: me, blockedId: partner }, { blockerId: partner, blockedId: me }] },
    select: { id: true, blockerId: true },
  });
  return {
    byMe: rows.find((r) => r.blockerId === me)?.id ?? null,
    byThem: rows.some((r) => r.blockerId === partner),
  };
}

/**
 * Pending intro requests between two people are cancelled (never refunded) once the pair is
 * blocked, or one of them is no longer available.
 */
export async function cancelPendingBetween(a: string, b: string): Promise<number> {
  const { count } = await db.introRequest.updateMany({
    where: {
      status: "PENDING",
      OR: [
        { senderId: a, receiverId: b },
        { senderId: b, receiverId: a },
      ],
    },
    data: { status: "CANCELLED" },
  });
  return count;
}

/**
 * Lazily cancel my pending requests (sent or received) whose other side is unavailable or
 * blocked with me. Called from the counts poll, so badges never point at a dead request.
 */
export async function cancelDeadPendingFor(userId: string): Promise<void> {
  const blockedWithMe: Prisma.UserWhereInput = {
    OR: [{ blocksGiven: { some: { blockedId: userId } } }, { blocksReceived: { some: { blockerId: userId } } }],
  };
  await db.introRequest.updateMany({
    where: {
      status: "PENDING",
      OR: [
        { receiverId: userId, sender: { OR: [UNAVAILABLE_USER, blockedWithMe] } },
        { senderId: userId, receiver: { OR: [UNAVAILABLE_USER, blockedWithMe] } },
      ],
    },
    data: { status: "CANCELLED" },
  });
}

/**
 * State of each of my matches (optionally only `matchIds`), keyed by match id.
 * Matches whose partner blocked me are left out.
 */
export async function loadMatchStates(
  userId: string,
  flags: { introRequests: boolean; chat: boolean },
  matchIds?: string[]
): Promise<Map<string, MatchDescription & { partnerId: string; blockId: string | null }>> {
  const [hidden, myBlocks, matches] = await Promise.all([
    hiddenPartnerIds(userId),
    db.block.findMany({ where: { blockerId: userId }, select: { id: true, blockedId: true } }),
    db.mutualMatch.findMany({
      where: { OR: [{ femaleId: userId }, { maleId: userId }], ...(matchIds && { id: { in: matchIds } }) },
      select: {
        id: true,
        femaleId: true,
        maleId: true,
        female: { select: { isDeactivated: true, status: true } },
        male: { select: { isDeactivated: true, status: true } },
        visitRequest: { select: { status: true } },
        conversation: { select: { status: true, expiresAt: true, endedById: true } },
        introRequests: { select: { type: true, status: true, expiresAt: true } },
        femaleOutcome: true,
        maleOutcome: true,
      },
    }),
  ]);
  const hiddenSet = new Set(hidden);
  const engagements = await loadEngagements([userId, ...matches.map((m) => (m.femaleId === userId ? m.maleId : m.femaleId))]);
  const blockOf = new Map(myBlocks.map((b) => [b.blockedId, b.id]));
  const out = new Map<string, MatchDescription & { partnerId: string; blockId: string | null }>();
  for (const m of matches) {
    const iAmFemale = m.femaleId === userId;
    const partnerId = iAmFemale ? m.maleId : m.femaleId;
    if (hiddenSet.has(partnerId)) continue;
    const partner = iAmFemale ? m.male : m.female;
    const blockId = blockOf.get(partnerId) ?? null;
    const d = describeMatch({
      requests: m.introRequests,
      conversation: m.conversation,
      visitStatus: m.visitRequest?.status ?? null,
      partnerUnavailable: isUnavailable(partner),
      blockedByMe: !!blockId,
      chatEnabled: flags.chat,
      introEnabled: flags.introRequests,
      outcomes: iAmFemale ? { mine: m.femaleOutcome, partner: m.maleOutcome } : { mine: m.maleOutcome, partner: m.femaleOutcome },
      engagedElsewhere: { mine: engagements.elsewhere(userId, m.id), partner: engagements.elsewhere(partnerId, m.id) },
    });
    out.set(m.id, { ...d, partnerId, blockId });
  }
  return out;
}
