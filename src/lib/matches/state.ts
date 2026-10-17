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

export type MatchClosure = "blocked" | "inactive" | "finished";

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
  const canSendChat = f.chatEnabled && !f.conversation && !pendingChat && !declinedChat;

  const finished =
    !acceptedFamily &&
    !pendingFamily &&
    !pendingChat &&
    !legacyAdmin &&
    !chatOpen &&
    (declinedFamily || endedByUser) &&
    (declinedChat || !!f.conversation);

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
      },
    }),
  ]);
  const hiddenSet = new Set(hidden);
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
    });
    out.set(m.id, { ...d, partnerId, blockId });
  }
  return out;
}
