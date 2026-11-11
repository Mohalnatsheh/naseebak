/**
 * In-app chat between two matched users after an accepted chat request.
 * Text, plus photos and voice notes for Pro members (src/lib/chat/media.ts); 14 days (+7 once in the last 3 days), filtered, rate-limited.
 * Expiry, the day-7 family nudge and the "2 days left" warning are applied lazily whenever a
 * conversation is read, and by the daily job (chatHousekeepingAll) for chats nobody opens.
 */
import { Prisma, type ReportReason } from "@prisma/client";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/countries";
import { notify, notifyMany } from "@/lib/notify";
import { clearChatBell, upsertChatBell } from "@/lib/chat/bell";
import { CHAT_NOTICE_PREFERENCE } from "@/lib/notification-prefs";
import { chatSmsTargets } from "@/lib/chat/unread-sms";
import { rateLimit } from "@/lib/rate-limit";
import { getCycleFlags } from "@/lib/settings";
import { publishChatEvent } from "@/lib/ably";
import {
  checkMessage,
  completesSplitNumber,
  mayBePartOfNumber,
  NUMBER_ONLY_WINDOW_MS,
  ownRecentPieces,
  SPLIT_NUMBER_LOOKBACK,
} from "@/lib/chat/filter";
import { IntroError } from "@/lib/intro/errors";
import { fileReport } from "@/lib/reports";
import { LEGACY_ADMIN_VISIT, cancelPendingBetween, familyMoveOpenUntil, isUnavailable } from "@/lib/matches/state";
import { isPro, proUserIds } from "@/lib/pro/status";
import { deleteFromBunny, uploadToBunny } from "@/lib/bunny";
import {
  type MediaKind, type MessageKindValue, fallbackBody, messageMedia, newMediaPath, previewBody, processImage,
  validateImage, validateVoice,
} from "@/lib/chat/media";
import { prepareVoice } from "@/lib/chat/voice-transcode";
import { type ChatReaction, type ReactionEmoji, reactionsFor } from "@/lib/chat/reactions";
import { type ReplyQuote, replySnippet } from "@/lib/chat/reply";
import { clearTyping, isTyping, noteTyping } from "@/lib/chat/typing";
import { chatStarters } from "@/lib/chat/starters";
import { DELETED_TRACE, hiddenForViewer, viewerCutoff, visibleMessageWhere } from "@/lib/chat/visibility";
import { activityLabel } from "@/lib/suggestions/feed";

const DAY_MS = 24 * 60 * 60 * 1000;
export const EXTENSION_DAYS = 7;
export const EXTEND_WINDOW_DAYS = 3;
export const WARN_BEFORE_DAYS = 2;
/** Days after opening when both get one "ready for a family introduction?" nudge */
export const FAMILY_NUDGE_AFTER_DAYS = 7;
/** ...only within this window, so chats that were already older on release day aren't all nudged at once */
const FAMILY_NUDGE_WINDOW_DAYS = 2;
const PUSH_THROTTLE_MS = 3 * 60 * 1000;

/** «حتى 12 نوفمبر» — the last day of the free chat → family move, in the members' country (JO when unknown) */
export function familyMoveDeadlineLabel(chatExpiresAt: Date, country?: unknown): string {
  return formatDate(familyMoveOpenUntil(chatExpiresAt), country, { day: "numeric", month: "long" });
}

export type ConversationState = "ACTIVE" | "ENDED" | "EXPIRED";

export interface ChatSummary {
  id: string;
  matchId: string;
  partner: {
    id: string;
    firstName: string;
    isVerified: boolean;
    /** Display only (badge) */
    isPro: boolean;
    /** «نشط اليوم» / «نشط هذا الأسبوع» (gendered), else null; never a time. Null across a block */
    activityLabel: string | null;
  };
  status: ConversationState;
  expiresAt: string;
  canExtend: boolean;
  /** Who ended it, when ENDED */
  endedByMe: boolean;
  /**
   * Who ended it, when ENDED (additive; older clients read `endedByMe`): "system" = neither member did (an admin, or
   * an account paused or leaving), so nobody is named. Null while the chat isn't ENDED
   */
  endedBy?: "me" | "partner" | "system" | null;
  /** One side blocked the other: read-only */
  blocked: boolean;
  /** The match page isn't available to me (the other person blocked me): hide links to it */
  matchHidden: boolean;
  /** `read`: the other person has read it (the app's ✓✓ on my last message in the chats list) */
  lastMessage: { body: string; createdAt: string; mine: boolean; read: boolean } | null;
  unread: number;
}

export interface ChatMedia {
  /** The members-only route (`/api/chats/<cid>/media/<mid>`), never the storage path */
  url: string;
  type: string;
  durationSec: number | null;
  width: number | null;
  height: number | null;
}

export interface ChatMessage {
  id: string;
  /** For a photo or voice note: the fallback text that app 1.0.x shows as a normal bubble */
  body: string;
  createdAt: string;
  mine: boolean;
  readAt: string | null;
  kind: MessageKindValue;
  media: ChatMedia | null;
  /** The quoted message (same chat), or null: old apps ignore it and show `body` */
  replyTo: ReplyQuote | null;
  /** One per member at most; `mine` only, never who else reacted */
  reactions: ChatReaction[];
  /** Deleted for everyone (sent only when true): `body` is the trace, kind TEXT, no media, quote or reactions */
  deleted?: boolean;
}

/** The quoted message as loaded with a message (body is already filtered; never mediaPath) */
type QuotedRow = {
  id: string;
  conversationId: string;
  senderId: string;
  kind?: MessageKindValue | null;
  body: string;
  deletedAt?: Date | null;
  createdAt?: Date;
  /** The viewer's own hide only */
  hides?: { userId: string }[];
};

/** The message fields toMessage() reads (mediaPath is never read here, so it can't leak) */
type MessageRow = {
  id: string;
  conversationId: string;
  body: string;
  createdAt: Date;
  senderId: string;
  readAt: Date | null;
  kind?: MessageKindValue | null;
  mediaType?: string | null;
  mediaDurationSec?: number | null;
  mediaWidth?: number | null;
  mediaHeight?: number | null;
  replyTo?: QuotedRow | null;
  reactions?: { emoji: string; userId: string }[];
  deletedAt?: Date | null;
};

const reactionsInclude = { select: { emoji: true, userId: true }, orderBy: { createdAt: "asc" } } as const;

/**
 * Loaded with every message sent to a client: the quote (with what decides whether the viewer may still see it) and
 * the reactions (in the order they were made). `hides` holds only the viewer's own hide.
 */
function messageIncludeFor(userId: string) {
  const mine = { where: { userId }, select: { userId: true } } as const;
  return {
    replyTo: {
      select: {
        id: true, conversationId: true, senderId: true, kind: true, body: true, deletedAt: true, createdAt: true, hides: mine,
      },
    },
    reactions: reactionsInclude,
    hides: mine,
  } as const;
}

const partyUser = {
  select: { id: true, firstName: true, isVerified: true, status: true, isDeactivated: true, country: true, lastActiveAt: true },
} as const;
const conversationInclude = {
  match: { select: { id: true, femaleId: true, maleId: true, female: partyUser, male: partyUser } },
} as const;

type LoadedConversation = NonNullable<Awaited<ReturnType<typeof findConversation>>>;

function findConversation(id: string) {
  return db.conversation.findUnique({ where: { id }, include: conversationInclude });
}

/**
 * `readOnly`: reading, marking read and reporting. A partner who blocked me hides the match, but the
 * chat stays readable for me so I can keep what was said and report it (a harasser who blocks first
 * must not silence the other person). Sending and extending still refuse it.
 */
export async function loadForUser(id: string, userId: string, opts: { readOnly?: boolean } = {}): Promise<LoadedConversation> {
  const c = await findConversation(id);
  if (!c || (c.match.femaleId !== userId && c.match.maleId !== userId)) {
    throw new IntroError("NOT_FOUND", "المحادثة غير موجودة");
  }
  if (!opts.readOnly) {
    const partnerId = c.match.femaleId === userId ? c.match.maleId : c.match.femaleId;
    const blockedMe = await db.block.findFirst({ where: { blockerId: partnerId, blockedId: userId }, select: { id: true } });
    if (blockedMe) throw new IntroError("NOT_FOUND", "المحادثة غير موجودة");
  }
  return housekeeping(c);
}

function partnerOf(c: LoadedConversation, userId: string) {
  return c.match.femaleId === userId ? c.match.male : c.match.female;
}

/** Expire overdue chats and send the one-time "2 days left" warning. */
async function housekeeping(c: LoadedConversation): Promise<LoadedConversation> {
  return (await housekeep(c)).c;
}

/** housekeeping() that also says what this call did (for the daily scheduler's counts). */
/**
 * Worth nudging toward a family introduction: both people still active, no block either way, no user
 * ended the chat, and no family request pending, accepted or declined (a decline is final) and no
 * legacy admin visit under way — the same cases where the chat page offers the button.
 */
/** Both accounts active and no block between them. */
async function bothCanTalk(c: LoadedConversation): Promise<boolean> {
  if (isUnavailable(c.match.female) || isUnavailable(c.match.male)) return false;
  return !(await isBlocked(c.match.femaleId, c.match.maleId));
}

async function familyPathOpen(c: LoadedConversation): Promise<boolean> {
  if (c.endedById) return false;
  if (isUnavailable(c.match.female) || isUnavailable(c.match.male)) return false;
  const [family, block, visit] = await Promise.all([
    db.introRequest.findFirst({
      where: { matchId: c.matchId, type: "FAMILY", status: { in: ["PENDING", "ACCEPTED", "DECLINED"] } },
      select: { id: true },
    }),
    db.block.findFirst({
      where: {
        OR: [
          { blockerId: c.match.femaleId, blockedId: c.match.maleId },
          { blockerId: c.match.maleId, blockedId: c.match.femaleId },
        ],
      },
      select: { id: true },
    }),
    db.visitRequest.findUnique({ where: { matchId: c.matchId }, select: { status: true } }),
  ]);
  return !family && !block && !(visit && LEGACY_ADMIN_VISIT.includes(visit.status));
}

async function housekeep(c: LoadedConversation): Promise<{ c: LoadedConversation; did: "expired" | "warned" | "nudged" | null }> {
  if (c.status !== "ACTIVE") return { c, did: null };
  const now = Date.now();
  const left = c.expiresAt.getTime() - now;
  // Conditional updates: parallel requests (counts poll + chat page, two tabs) act only once
  if (left <= 0) {
    const { count } = await db.conversation.updateMany({ where: { id: c.id, status: "ACTIVE" }, data: { status: "EXPIRED" } });
    if (count === 1) {
      await publishChatEvent(c.id, "status", { status: "EXPIRED" });
      // An expired chat keeps the free move to family: ask once instead of letting the match fade
      if (await familyPathOpen(c)) {
        await notifyMany([c.match.femaleId, c.match.maleId], {
          type: "CHAT",
          title: "انتهت مدة المحادثة",
          body: `هل تنتقلان لتعارف عائلي؟ الانتقال مجاني حتى ${familyMoveDeadlineLabel(c.expiresAt, c.match.female?.country)}، وتتبادل العائلتان بيانات وليّ الأمر لترتيب الزيارة.`,
          url: `/dashboard/chats/${c.id}`,
          metadata: { conversationId: c.id },
          preference: CHAT_NOTICE_PREFERENCE,
        });
      }
    }
    return { c: { ...c, status: "EXPIRED" }, did: count === 1 ? "expired" : null };
  }
  const age = now - c.createdAt.getTime();
  if (
    !c.familyNudgeAt &&
    age >= FAMILY_NUDGE_AFTER_DAYS * DAY_MS &&
    age < (FAMILY_NUDGE_AFTER_DAYS + FAMILY_NUDGE_WINDOW_DAYS) * DAY_MS
  ) {
    const nudgedAt = new Date();
    const { count } = await db.conversation.updateMany({
      where: { id: c.id, familyNudgeAt: null },
      data: { familyNudgeAt: nudgedAt },
    });
    if (count === 1 && (await familyPathOpen(c))) {
      await notifyMany([c.match.femaleId, c.match.maleId], {
        type: "CHAT",
        title: "أسبوع على محادثتكما",
        body: "إن شعرتما بالارتياح يمكنكما الانتقال لتعارف عائلي الآن، والانتقال مجاني.",
        url: `/dashboard/chats/${c.id}`,
        metadata: { conversationId: c.id },
        preference: CHAT_NOTICE_PREFERENCE,
      });
      return { c: { ...c, familyNudgeAt: nudgedAt }, did: "nudged" };
    }
    c = { ...c, familyNudgeAt: nudgedAt };
  }
  if (left < WARN_BEFORE_DAYS * DAY_MS && !c.expiryWarnedAt) {
    const warnedAt = new Date();
    const { count } = await db.conversation.updateMany({
      where: { id: c.id, expiryWarnedAt: null },
      data: { expiryWarnedAt: warnedAt },
    });
    if (count !== 1) return { c: { ...c, expiryWarnedAt: warnedAt }, did: null };
    // Nobody to talk to (a block, or an account that isn't active): no "ends soon" push
    if (!(await bothCanTalk(c))) return { c: { ...c, expiryWarnedAt: warnedAt }, did: null };
    await notifyMany([c.match.femaleId, c.match.maleId], {
      type: "CHAT",
      title: "تنتهي المحادثة قريباً",
      // After the one extension, only the family move is left to offer
      body: c.extended
        ? "بقي يومان على انتهاء المحادثة. يمكنكما الانتقال لتعارف عائلي."
        : "بقي يومان على انتهاء المحادثة. يمكنكما التمديد مرة واحدة أو الانتقال لتعارف عائلي.",
      url: `/dashboard/chats/${c.id}`,
      metadata: { conversationId: c.id },
      preference: CHAT_NOTICE_PREFERENCE,
    });
    return { c: { ...c, expiryWarnedAt: warnedAt }, did: "warned" };
  }
  return { c, did: null };
}

function summarise(
  c: LoadedConversation,
  userId: string,
  last: { body: string; kind?: string | null; createdAt: Date; senderId: string; readAt: Date | null; deletedAt?: Date | null } | null,
  unread: number,
  blocked = false,
  matchHidden = false,
  partnerPro = false
): ChatSummary {
  const left = c.expiresAt.getTime() - Date.now();
  const partner = partnerOf(c, userId);
  // The partner is the opposite gender; no activity across a block either way
  const partnerGender = partner.id === c.match.femaleId ? "FEMALE" : "MALE";
  // Only while the chat is open and the partner's account is active: a former match's activity is not shown
  const activity = blocked || matchHidden || c.status !== "ACTIVE" || isUnavailable(partner)
    ? null
    : activityLabel(partner.lastActiveAt, partnerGender);
  return {
    id: c.id,
    matchId: c.matchId,
    partner: { id: partner.id, firstName: partner.firstName, isVerified: partner.isVerified, isPro: partnerPro, activityLabel: activity },
    status: c.status,
    expiresAt: c.expiresAt.toISOString(),
    canExtend: c.status === "ACTIVE" && !c.extended && left <= EXTEND_WINDOW_DAYS * DAY_MS,
    endedByMe: c.status === "ENDED" && c.endedById === userId,
    endedBy: c.status !== "ENDED" ? null : c.endedById === userId ? "me" : c.endedById ? "partner" : "system",
    blocked,
    matchHidden,
    lastMessage: last
      ? { body: last.deletedAt ? DELETED_TRACE : previewBody(last), createdAt: last.createdAt.toISOString(), mine: last.senderId === userId, read: last.readAt !== null }
      : null,
    unread,
  };
}

function toMedia(m: MessageRow): ChatMedia | null {
  return messageMedia(m);
}

/**
 * The quote of a reply, only from the same chat (checked again here, so another chat's text can never show). A quoted
 * message deleted for everyone, hidden by the viewer or cleared from their view quotes as the trace.
 */
function toReplyQuote(m: MessageRow, userId: string, cutoff: Date | null): ReplyQuote | null {
  const q = m.replyTo;
  if (!q || q.conversationId !== m.conversationId) return null;
  const gone = !!q.deletedAt
    || (q.createdAt ? hiddenForViewer({ createdAt: q.createdAt, hides: q.hides }, userId, cutoff) : !!q.hides?.some((h) => h.userId === userId));
  if (gone) return { id: q.id, mine: q.senderId === userId, kind: "TEXT", snippet: DELETED_TRACE };
  return { id: q.id, mine: q.senderId === userId, kind: q.kind ?? "TEXT", snippet: replySnippet(q) };
}

/** `cutoff`: the viewer's clear point (viewerCutoff), for reply quotes */
function toMessage(m: MessageRow, userId: string, cutoff: Date | null = null): ChatMessage {
  // Deleted for everyone: the trace as plain text, so every app version (1.0.x–1.2.x included) shows only that
  if (m.deletedAt) {
    return {
      id: m.id,
      body: DELETED_TRACE,
      createdAt: m.createdAt.toISOString(),
      mine: m.senderId === userId,
      readAt: m.readAt ? m.readAt.toISOString() : null,
      kind: "TEXT",
      media: null,
      replyTo: null,
      reactions: [],
      deleted: true,
    };
  }
  return {
    id: m.id,
    body: m.body,
    createdAt: m.createdAt.toISOString(),
    mine: m.senderId === userId,
    readAt: m.readAt ? m.readAt.toISOString() : null,
    kind: m.kind ?? "TEXT",
    media: toMedia(m),
    replyTo: toReplyQuote(m, userId, cutoff),
    reactions: reactionsFor(m.reactions, userId),
  };
}

async function isBlocked(a: string, b: string): Promise<boolean> {
  const block = await db.block.findFirst({
    where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] },
    select: { id: true },
  });
  return !!block;
}

export async function listConversations(userId: string): Promise<ChatSummary[]> {
  const rows = await db.conversation.findMany({
    where: { match: { OR: [{ femaleId: userId }, { maleId: userId }] } },
    include: {
      ...conversationInclude,
      // My newest message not hidden by me; a chat clear is applied below (it differs per chat)
      messages: {
        where: { hides: { none: { userId } } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, kind: true, createdAt: true, senderId: true, readAt: true, deletedAt: true },
      },
      _count: { select: { messages: { where: { readAt: null, senderId: { not: userId } } } } },
    },
  });
  const myClears = rows.length
    ? new Map(
        (await db.conversationClear.findMany({ where: { userId }, select: { conversationId: true, clearedAt: true } }))
          .map((cl) => [cl.conversationId, cl.clearedAt]),
      )
    : new Map<string, Date>();
  // Same read-only flag as the chat page: a block either way
  const blocks = rows.length
    ? await db.block.findMany({
        where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
        select: { blockerId: true, blockedId: true },
      })
    : [];
  const blockedWith = new Set(blocks.map((b) => (b.blockerId === userId ? b.blockedId : b.blockerId)));
  // A partner who blocked me: the chat stays listed (read-only, can be reported), the match doesn't
  const blockedMeBy = new Set(blocks.filter((b) => b.blockedId === userId).map((b) => b.blockerId));
  // One query for every partner (badge only: a failure just hides the badge)
  const pros = await proUserIds(rows.map((r) => partnerOf(r, userId).id)).catch(() => new Set<string>());
  const summaries: ChatSummary[] = [];
  for (const row of rows) {
    const c = await housekeeping(row);
    const partnerId = partnerOf(c, userId).id;
    // The newest message at or before my clear point means everything is cleared for me: no preview
    const cutoff = viewerCutoff(row.clearedAt ?? null, myClears.get(row.id) ?? null);
    const newest = row.messages[0] ?? null;
    const last = newest && !hiddenForViewer(newest, userId, cutoff) ? newest : null;
    summaries.push(
      summarise(c, userId, last, row._count.messages, blockedWith.has(partnerId), blockedMeBy.has(partnerId), pros.has(partnerId))
    );
  }
  const activity = (s: ChatSummary) => new Date(s.lastMessage?.createdAt ?? 0).getTime();
  return summaries.sort((a, b) => activity(b) - activity(a));
}

/** Run expiry/warning checks for all of a user's active chats (called from the 30s counts poll). */
export async function chatHousekeepingForUser(userId: string): Promise<void> {
  const rows = await db.conversation.findMany({
    where: { status: "ACTIVE", match: { OR: [{ femaleId: userId }, { maleId: userId }] } },
    include: conversationInclude,
  });
  for (const row of rows) await housekeeping(row);
}

/** A chat that hasn't got going is nudged this long after it opened, while nudging can still help */
export const QUIET_NUDGE_AFTER_DAYS = 2;
const QUIET_NUDGE_UNTIL_DAYS = 7;

/**
 * Chats 48 hours old that never got going: nobody wrote (both told), or one wrote and the other hasn't
 * read it (only they are told). Push and bell, once per chat; never an SMS. The first notice used to
 * come on day 7, half way through the chat's 14 days.
 */
export async function nudgeQuietChats(now = new Date()): Promise<{ nudged: number }> {
  const rows = await db.conversation.findMany({
    where: {
      status: "ACTIVE",
      quietNudgeAt: null,
      expiresAt: { gt: now },
      createdAt: {
        lte: new Date(now.getTime() - QUIET_NUDGE_AFTER_DAYS * DAY_MS),
        gt: new Date(now.getTime() - QUIET_NUDGE_UNTIL_DAYS * DAY_MS),
      },
    },
    include: { ...conversationInclude, messages: { select: { senderId: true, readAt: true, createdAt: true } } },
  });
  let nudged = 0;
  for (const row of rows) {
    try {
      const { femaleId, maleId } = row.match;
      const targets = chatSmsTargets({ createdAt: row.createdAt, femaleId, maleId, messages: row.messages }, now);
      if (targets.length === 0) continue;
      const { count } = await db.conversation.updateMany({
        where: { id: row.id, quietNudgeAt: null },
        data: { quietNudgeAt: now },
      });
      if (count !== 1 || !(await bothCanTalk(row))) continue;
      for (const { userId, event } of targets) {
        await notify({
          userId,
          type: "CHAT",
          title: event === "chat_open" ? "محادثتك لم تبدأ بعد" : "رسالة بانتظار ردك",
          body:
            event === "chat_open"
              ? "فُتحت محادثتك قبل يومين ولم يكتب فيها أحد بعد، ومدتها محدودة."
              : "لديك رسالة لم تُقرأ في محادثتك، ومدة المحادثة محدودة.",
          url: `/dashboard/chats/${row.id}`,
          metadata: { conversationId: row.id },
          preference: CHAT_NOTICE_PREFERENCE,
        });
      }
      nudged++;
    } catch (error) {
      console.error(`[cron] quiet chat ${row.id}:`, error);
    }
  }
  return { nudged };
}

/**
 * Daily scheduler: the same expiry + "2 days left" checks for every active chat (only those that
 * are due are loaded). The conditional updates make it safe alongside the lazy paths: one warning each.
 */
export async function chatHousekeepingAll(now = new Date()): Promise<{ expired: number; warned: number; nudged: number }> {
  const rows = await db.conversation.findMany({
    where: {
      status: "ACTIVE",
      OR: [
        { expiresAt: { lte: now } },
        { expiryWarnedAt: null, expiresAt: { lt: new Date(now.getTime() + WARN_BEFORE_DAYS * DAY_MS) } },
        {
          familyNudgeAt: null,
          createdAt: {
            lte: new Date(now.getTime() - FAMILY_NUDGE_AFTER_DAYS * DAY_MS),
            gt: new Date(now.getTime() - (FAMILY_NUDGE_AFTER_DAYS + FAMILY_NUDGE_WINDOW_DAYS) * DAY_MS),
          },
        },
      ],
    },
    include: conversationInclude,
  });
  let expired = 0;
  let warned = 0;
  let nudged = 0;
  for (const row of rows) {
    try {
      // The nudge and the warning are separate steps: run until nothing more is due
      let { c, did } = await housekeep(row);
      if (did === "nudged") {
        nudged++;
        ({ c, did } = await housekeep(c));
      }
      if (did === "expired") expired++;
      if (did === "warned") warned++;
    } catch (error) {
      console.error(`[cron] chat housekeeping ${row.id}:`, error);
    }
  }
  return { expired, warned, nudged };
}

export async function getConversation(
  id: string,
  userId: string,
  opts: { before?: string; beforeId?: string; after?: string; limit?: number; reactionsSince?: string } = {}
): Promise<{
  conversation: ChatSummary;
  messages: ChatMessage[];
  hasMore: boolean;
  /** Polls (?after=) only: my newest message the partner has read, so read ticks on older messages still update */
  readUpTo?: { createdAt: string; readAt: string } | null;
  /** The partner signalled typing in the last few seconds (open, unblocked chat only): the polling fallback for Ably `typing` */
  partnerTyping: boolean;
  /** Conversation starters while I haven't written anything in an open chat, else [] */
  starters: string[];
  /** Both members have written at least once in the whole chat (not only the loaded page): the family offer in the
   *  status bar waits for it. Additive; older clients ignore it */
  bothWrote: boolean;
  /** The server's time when it answered: a polling client sends it back (less a few seconds) as `reactionsSince` */
  polledAt: string;
  /** Polls (?after=) with `reactionsSince` only: every message whose reactions changed since then, with all of them
   *  (an empty list = the last one was removed). The polling fallback for the Ably `reaction` event */
  reactionUpdates?: { messageId: string; reactions: ChatReaction[] }[];
  /** My clear point (the later of a chat-wide clear and my own), always sent: clients drop loaded messages at or before it */
  clearedBefore: string | null;
  /** Polls with `reactionsSince` only: messages deleted for everyone since then (clients show the trace) */
  deletedIds?: string[];
  /** Polls with `reactionsSince` only: messages I hid since then (my other devices drop them) */
  hiddenIds?: string[];
}> {
  const polledAt = new Date().toISOString();
  const firstPage = !opts.after && !opts.before;
  const [c, myClear, deletionState] = await Promise.all([
    loadForUser(id, userId, { readOnly: true }),
    db.conversationClear.findUnique({ where: { conversationId_userId: { conversationId: id, userId } }, select: { clearedAt: true } }),
    // First page only: any message deleted for everyone, or hidden by me, in this chat (one indexed lookup, stops at the first)
    firstPage
      ? db.message.findFirst({
          where: { conversationId: id, OR: [{ deletedAt: { not: null } }, { hides: { some: { userId } } }] },
          select: { id: true },
        })
      : null,
  ]);
  const cutoff = viewerCutoff(c.clearedAt ?? null, myClear?.clearedAt ?? null);
  // Hides and clears are applied in SQL, so paging (`take: limit + 1`, `hasMore`) stays right
  const visible = visibleMessageWhere(id, userId, cutoff);
  const include = messageIncludeFor(userId);
  // Apps 1.0.0–1.2.x keep the newest 100 messages on the device and only replace the part the first page covers: in a
  // chat with a deletion, a hide or a clear the first page is 100 long, so a deleted or cleared message never survives
  // in that cache once the chat is reopened. Older pages (`before`) and polls (`after`) are unchanged
  const limit = firstPage && (cutoff || deletionState) ? 100 : Math.min(Math.max(opts.limit ?? 30, 1), 100);

  // Two messages can share a millisecond: pages are ordered by (createdAt, id), and a cursor that is only a time is
  // inclusive (clients merge by id), so a message on a page boundary is never skipped
  let messages;
  let hasMore = false;
  /** The newest row of the page (the conversation's last message) */
  let last: MessageRow | null = null;
  if (opts.after) {
    // Only rows from `after` on (a row deleted for everyone comes back as the trace). Older messages deleted since then
    // are NOT added here: shipped apps insert unknown poll rows into the thread, above a gap that older pages then skip.
    // Their ids go in `deletedIds` (polls with `reactionsSince`) instead; older apps see the trace on their next full load
    messages = await db.message.findMany({
      where: { AND: [visible, { createdAt: { gte: new Date(opts.after) } }] },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 100,
      include,
    });
    last = messages.length ? messages[messages.length - 1] : null;
  } else {
    const before = opts.before ? new Date(opts.before) : null;
    const page = await db.message.findMany({
      where: {
        AND: [
          visible,
          before
            ? opts.beforeId
              ? { OR: [{ createdAt: { lt: before } }, { createdAt: before, id: { lt: opts.beforeId } }] }
              : { createdAt: { lte: before } }
            : {},
        ],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      include,
    });
    hasMore = page.length > limit;
    messages = page.slice(0, limit).reverse();
    last = messages.length ? messages[messages.length - 1] : null;
  }

  const partnerId = partnerOf(c, userId).id;
  const reactionsSince = opts.after && opts.reactionsSince ? new Date(opts.reactionsSince) : null;
  const [unread, blocked, blockedMe, partnerPro, lastRead, sentByMe, reacted, sentByPartner, deleted, hidden] = await Promise.all([
    db.message.count({ where: { conversationId: id, readAt: null, senderId: { not: userId } } }),
    isBlocked(userId, partnerId),
    db.block.findFirst({ where: { blockerId: partnerId, blockedId: userId }, select: { id: true } }),
    // Badge only: a failure just hides it
    isPro(partnerId).catch(() => false),
    opts.after
      ? db.message.findFirst({
          where: { conversationId: id, senderId: userId, readAt: { not: null } },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true, readAt: true },
        })
      : null,
    db.message.count({ where: { conversationId: id, senderId: userId }, take: 1 }),
    reactionsSince
      ? db.message.findMany({
          where: { conversationId: id, reactedAt: { gte: reactionsSince } },
          select: { id: true, reactions: reactionsInclude },
          // Newest changes first: each entry carries the message's full reactions, so order doesn't matter to clients,
          // and after a long gap the cap drops the oldest changes, not the newest (final review minor 7)
          orderBy: { reactedAt: "desc" },
          take: 200,
        })
      : null,
    db.message.count({ where: { conversationId: id, senderId: partnerId }, take: 1 }),
    reactionsSince
      ? db.message.findMany({
          where: { conversationId: id, deletedAt: { gte: reactionsSince } },
          select: { id: true },
          // Newest first, so the cap drops the oldest
          orderBy: { deletedAt: "desc" },
          take: 200,
        })
      : null,
    reactionsSince
      ? db.messageHide.findMany({
          where: { userId, createdAt: { gte: reactionsSince }, message: { conversationId: id } },
          select: { messageId: true },
          orderBy: { createdAt: "desc" },
          take: 200,
        })
      : null,
  ]);
  const open = c.status === "ACTIVE" && !blocked && !blockedMe;
  return {
    conversation: summarise(c, userId, last, unread, blocked, !!blockedMe, partnerPro),
    messages: messages.map((m) => toMessage(m, userId, cutoff)),
    hasMore,
    partnerTyping: open && isTyping(id, partnerId),
    starters: open && sentByMe === 0 ? chatStarters(userId === c.match.femaleId ? "FEMALE" : "MALE") : [],
    bothWrote: sentByMe > 0 && sentByPartner > 0,
    polledAt,
    clearedBefore: cutoff ? cutoff.toISOString() : null,
    ...(deleted && { deletedIds: deleted.map((m) => m.id) }),
    ...(hidden && { hiddenIds: hidden.map((h) => h.messageId) }),
    ...(reacted && { reactionUpdates: reacted.map((m) => ({ messageId: m.id, reactions: reactionsFor(m.reactions, userId) })) }),
    ...(opts.after && {
      readUpTo: lastRead?.readAt ? { createdAt: lastRead.createdAt.toISOString(), readAt: lastRead.readAt.toISOString() } : null,
    }),
  };
}

// Last push per conversation+recipient, so a burst of messages makes one push (single PM2 process)
const lastPush = new Map<string, number>();

/** How long a send is remembered by its client nonce (a retry after a lost answer comes within seconds) */
export const NONCE_TTL_MS = 10 * 60 * 1000;
// conversation:sender:nonce → the send (in flight or done), oldest first, for two identical requests at the same
// moment (one PM2 process, CLAUDE.md); Message.clientNonce (indexed per chat and sender) covers restarts and later retries
const sendsByNonce = new Map<string, { at: number; message: Promise<ChatMessage> }>();

type SendArgs = {
  conversationId: string;
  senderId: string;
  body: string;
  /** Echoed back on the live event so the sender's screen can replace its optimistic copy; a retry with the same
   *  nonce (the answer was lost, the message was saved) gets the saved message back instead of a second copy */
  clientNonce?: string;
  /** Reply to this message: it must belong to the same chat (else INVALID, 400) */
  replyToId?: string;
};

export function sendMessage(args: SendArgs): Promise<ChatMessage> {
  return onceByNonce(args, () => createMessage(args));
}

/** One send per client nonce: two identical requests at the same moment share one result */
function onceByNonce(
  args: { conversationId: string; senderId: string; clientNonce?: string },
  create: () => Promise<ChatMessage>
): Promise<ChatMessage> {
  const { conversationId, senderId, clientNonce } = args;
  if (!clientNonce) return create();
  const now = Date.now();
  for (const [k, v] of sendsByNonce) {
    if (now - v.at < NONCE_TTL_MS) break;
    sendsByNonce.delete(k);
  }
  const key = `${conversationId}:${senderId}:${clientNonce}`;
  const held = sendsByNonce.get(key);
  if (held) return held.message;
  const message = create();
  sendsByNonce.set(key, { at: now, message });
  // Refused (filter, rate limit, closed chat…): nothing was saved, a retry is a new attempt
  message.catch(() => {
    if (sendsByNonce.get(key)?.message === message) sendsByNonce.delete(key);
  });
  return message;
}

/** The message already saved under this nonce (the answer was lost): returned again, never a second copy */
async function savedByNonce(conversationId: string, senderId: string, clientNonce?: string): Promise<ChatMessage | null> {
  if (!clientNonce) return null;
  const saved = await db.message.findFirst({ where: { conversationId, senderId, clientNonce }, include: messageIncludeFor(senderId) });
  if (!saved) return null;
  // The sender's clear point, as on a read: a quote of a message cleared since comes back as the trace
  const [chat, myClear] = await Promise.all([
    db.conversation.findUnique({ where: { id: conversationId }, select: { clearedAt: true } }),
    db.conversationClear.findUnique({
      where: { conversationId_userId: { conversationId, userId: senderId } },
      select: { clearedAt: true },
    }),
  ]);
  return toMessage(saved, senderId, viewerCutoff(chat?.clearedAt ?? null, myClear?.clearedAt ?? null));
}

type SendContext = {
  c: LoadedConversation;
  partner: LoadedConversation["match"]["female"];
  sender: LoadedConversation["match"]["female"];
};

/**
 * The checks every send passes, text or media: the chat switch, a member of this chat (not blocked by
 * the partner), the chat open, both accounts active, and no block either way.
 */
export async function assertCanSend(conversationId: string, senderId: string): Promise<SendContext> {
  const flags = await getCycleFlags();
  if (!flags.chat) throw new IntroError("DISABLED", "المحادثات متوقفة حالياً");

  const c = await loadForUser(conversationId, senderId);
  if (c.status === "EXPIRED") throw new IntroError("EXPIRED", "انتهت مدة المحادثة");
  if (c.status === "ENDED") throw new IntroError("NOT_ALLOWED", "تم إنهاء هذه المحادثة");

  const partner = partnerOf(c, senderId);
  const me = senderId === c.match.femaleId ? c.match.female : c.match.male;
  // Suspended or deactivated (account deletion pending) on either side: no new messages
  if (me.status === "SUSPENDED" || isUnavailable(partner)) {
    throw new IntroError("NOT_ALLOWED", "هذا الحساب غير نشط حالياً، لا يمكن إرسال رسائل الآن");
  }
  if (await isBlocked(senderId, partner.id)) throw new IntroError("BLOCKED");
  return { c, partner, sender: me };
}

/** A reply's target: a message of this same chat. Missing or from another chat → INVALID (400), its text never read */
async function assertReplyTarget(conversationId: string, replyToId: string | undefined): Promise<string | null> {
  if (!replyToId) return null;
  const target = await db.message.findUnique({ where: { id: replyToId }, select: { id: true, conversationId: true } });
  if (!target || target.conversationId !== conversationId) throw new IntroError("INVALID", "لا يمكن الرد على هذه الرسالة");
  return target.id;
}

/** ~1 message per second on average, short bursts allowed (no daily cap); text and media share it */
function assertSendRate(senderId: string): void {
  if (!rateLimit(`chat-burst:${senderId}`, { maxAttempts: 5, windowMs: 5000 }).success) {
    throw new IntroError("RATE_LIMITED", "تمهّل قليلاً قبل إرسال رسالة أخرى");
  }
}

async function createMessage(args: SendArgs): Promise<ChatMessage> {
  const { conversationId, senderId, body, clientNonce } = args;
  const saved = await savedByNonce(conversationId, senderId, clientNonce);
  if (saved) return saved;
  const { c, partner, sender } = await assertCanSend(conversationId, senderId);
  const replyToId = await assertReplyTarget(conversationId, args.replyToId);

  // Filter first: a blocked attempt is never saved and doesn't use up the sending allowance
  const check = checkMessage(body);
  if (!check.ok) throw new IntroError("FILTERED", check.message);
  // A number sent in pieces ("صفر سبعة تسعة", then "واحد اثنان …"): read my recent messages together
  if (mayBePartOfNumber(check.text)) {
    const recent = await db.message.findMany({
      where: { conversationId, createdAt: { gt: new Date(Date.now() - NUMBER_ONLY_WINDOW_MS) } },
      orderBy: { createdAt: "desc" },
      take: SPLIT_NUMBER_LOOKBACK,
      select: { senderId: true, body: true, createdAt: true },
    });
    // Only my own run of messages since the partner last wrote (my filler messages in between are skipped)
    if (completesSplitNumber(check.text, ownRecentPieces(recent, senderId))) {
      throw new IntroError("FILTERED", "لا يمكن مشاركة الأرقام أو الروابط أو حسابات التواصل. مشاركة التواصل تتم عبر التعارف العائلي.");
    }
  }

  assertSendRate(senderId);

  const message = await db.message.create({
    data: { conversationId, senderId, body: check.text, clientNonce: clientNonce ?? null, ...(replyToId && { replyToId }) },
    include: messageIncludeFor(senderId),
  });
  return delivered(message, { c, partner, sender }, clientNonce);
}

/** Publish a saved message live, then the bell and the push; the sender's own copy is returned */
async function delivered(message: MessageRow, ctx: SendContext, clientNonce?: string): Promise<ChatMessage> {
  const { partner, sender } = ctx;
  const { conversationId, senderId } = message;
  // Both members get this event: a quote of a message cleared for everyone reads as the trace for both
  const out = toMessage(message, senderId, ctx.c.clearedAt ?? null);
  clearTyping(conversationId, senderId);
  // `kind`, `media` and `replyTo` are additive: old apps read `body` (the fallback text for media). The quote carries
  // its sender's id instead of `mine` (both sides get this event); a new message has no reactions yet
  await publishChatEvent(conversationId, "message", {
    id: message.id,
    senderId,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
    clientNonce,
    kind: out.kind,
    media: out.media,
    replyTo: out.replyTo && message.replyTo
      ? { id: out.replyTo.id, senderId: message.replyTo.senderId, kind: out.replyTo.kind, snippet: out.replyTo.snippet }
      : null,
  });

  // Bell and push are not awaited: the sender's answer never waits for OneSignal / FCM (both catch their
  // own errors; one long-running process, so they finish after the response)
  // The bell, for members without a push device (one entry per chat, kept up to date)
  void upsertChatBell(partner.id, conversationId, sender.firstName);

  const key = `${conversationId}:${partner.id}`;
  const now = Date.now();
  if (now - (lastPush.get(key) ?? 0) >= PUSH_THROTTLE_MS) {
    lastPush.set(key, now);
    void notify({
      userId: partner.id,
      type: "CHAT",
      // Never the message itself: a push shows on the lock screen to whoever holds the phone
      title: "نصيبك",
      body: `رسالة جديدة من ${sender.firstName}`,
      url: `/dashboard/chats/${conversationId}`,
      pushOnly: true,
      collapseId: `chat-${conversationId}`,
    });
  }

  return out;
}

type MediaSendArgs = {
  conversationId: string;
  senderId: string;
  kind: MediaKind;
  file: Buffer;
  /** The file's declared MIME type (codec parameters are allowed and dropped) */
  type: string;
  /** Voice: the recorder's duration in seconds */
  durationSec?: number;
  clientNonce?: string;
  /** Reply to this message of the same chat */
  replyToId?: string;
};

/**
 * A photo or a voice note (Pro). Order: the same can-send checks as text → Pro → the shared rate limit →
 * validate / process → upload → save. Nothing is uploaded until every check has passed, and a file
 * whose row can't be saved is deleted again. The text filter doesn't run on media (owner).
 */
export function sendMediaMessage(args: MediaSendArgs): Promise<ChatMessage> {
  return onceByNonce(args, () => createMediaMessage(args));
}

async function createMediaMessage(args: MediaSendArgs): Promise<ChatMessage> {
  const { conversationId, senderId, kind, file, clientNonce } = args;
  const saved = await savedByNonce(conversationId, senderId, clientNonce);
  if (saved) return saved;
  const ctx = await assertCanSend(conversationId, senderId);
  const replyToId = await assertReplyTarget(conversationId, args.replyToId);
  // Pro, not `pro_enabled`: the switch gates sales, a paying member keeps the features
  if (!(await isPro(senderId))) throw new IntroError("PRO_REQUIRED", "إرسال الصور والرسائل الصوتية متاح لأعضاء Pro");
  assertSendRate(senderId);

  let upload: { buffer: Buffer; path: string; type: string };
  let media: { mediaDurationSec: number | null; mediaWidth: number | null; mediaHeight: number | null };
  if (kind === "IMAGE") {
    const check = validateImage(args.type, file.length);
    if (!check.ok) throw new IntroError("MEDIA_INVALID", check.message);
    const img = await processImage(file);
    upload = { buffer: img.buffer, path: newMediaPath(conversationId, "webp"), type: "image/webp" };
    media = { mediaDurationSec: null, mediaWidth: img.width, mediaHeight: img.height };
  } else {
    const durationSec = Math.round(args.durationSec ?? Number.NaN);
    const check = validateVoice(args.type, file.length, durationSec);
    if (!check.ok) throw new IntroError("MEDIA_INVALID", check.message);
    // Every voice note → AAC in an .m4a (iPhone plays nothing else; an MP4 may hold Opus). The declared duration is kept
    const voice = await prepareVoice(file, args.type);
    upload = { buffer: voice.buffer, path: newMediaPath(conversationId, voice.ext), type: voice.type };
    media = { mediaDurationSec: durationSec, mediaWidth: null, mediaHeight: null };
  }

  try {
    await uploadToBunny(upload.buffer, upload.path, upload.type);
  } catch (error) {
    // The storage error can quote the path: only its first part is logged
    console.error(`[chat-media] upload failed chat=${conversationId}:`, String((error as Error)?.message ?? error).split(":")[0]);
    throw new Error("chat media upload failed");
  }

  let message;
  try {
    message = await db.message.create({
      data: {
        conversationId,
        senderId,
        body: fallbackBody(kind),
        clientNonce: clientNonce ?? null,
        kind,
        mediaPath: upload.path,
        mediaType: upload.type,
        ...media,
        ...(replyToId && { replyToId }),
      },
      include: messageIncludeFor(senderId),
    });
  } catch (error) {
    await deleteFromBunny(upload.path).catch(() => {});
    // A Prisma error quotes the data it was given (mediaPath): only its code is logged, never the error itself
    console.error(`[chat-media] save failed chat=${conversationId}:`, (error as { code?: string })?.code ?? "unknown");
    throw new Error("chat media save failed");
  }
  return delivered(message, ctx, clientNonce);
}

/** Reactions: at most one burst per member (they make no push, but each one is a live event) */
function assertReactionRate(userId: string): void {
  if (!rateLimit(`chat-react:${userId}`, { maxAttempts: 20, windowMs: 10_000 }).success) {
    throw new IntroError("RATE_LIMITED", "تمهّل قليلاً");
  }
}

/**
 * React to a message (❤️ 👍 😊 🤲): one per member, the same emoji again (or null) removes it. Only in an open chat
 * between two active, unblocked members (the same checks as sending). No push, no bell, no unread count.
 */
export async function setReaction(args: {
  conversationId: string;
  messageId: string;
  userId: string;
  emoji: ReactionEmoji | null;
}): Promise<{ reactions: ChatReaction[] }> {
  const { conversationId, messageId, userId, emoji } = args;
  await assertCanSend(conversationId, userId);
  const message = await db.message.findUnique({ where: { id: messageId }, select: { id: true, conversationId: true, deletedAt: true } });
  // Deleted for everyone: shown as the trace, which takes no reactions
  if (!message || message.conversationId !== conversationId || message.deletedAt) {
    throw new IntroError("NOT_FOUND", "الرسالة غير موجودة");
  }
  assertReactionRate(userId);

  const where = { messageId_userId: { messageId, userId } };
  const current = emoji ? await db.messageReaction.findUnique({ where, select: { emoji: true } }) : null;
  if (!emoji || current?.emoji === emoji) {
    const { count } = await db.messageReaction.deleteMany({ where: { messageId, userId } });
    // Clearing a reaction that wasn't there: nothing changed, so no stamp and no live event (final review minor 1)
    if (count === 0) return { reactions: reactionsFor(await reactionRows(messageId), userId) };
  } else {
    try {
      await db.messageReaction.upsert({ where, create: { messageId, userId, emoji }, update: { emoji } });
    } catch (error) {
      // Two first taps at once: both upserts tried to create, the loser hits the unique key. Mine exists now: update it
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
      await db.messageReaction.update({ where, data: { emoji } });
    }
  }
  // Polling clients (no Ably) ask for messages whose reactions changed since their last poll
  await db.message.updateMany({ where: { id: messageId }, data: { reactedAt: new Date() } });
  const rows = await reactionRows(messageId);
  await publishChatEvent(conversationId, "reaction", { messageId, reactions: rows });
  return { reactions: reactionsFor(rows, userId) };
}

function reactionRows(messageId: string) {
  return db.messageReaction.findMany({
    where: { messageId },
    select: { emoji: true, userId: true },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * «يكتب الآن…»: kept in memory for TYPING_SHOW_MS (the chat GET's `partnerTyping`) and published live as `typing`
 * at most every couple of seconds. Only in an open chat between two active, unblocked members.
 */
export async function signalTyping(conversationId: string, userId: string): Promise<void> {
  await assertCanSend(conversationId, userId);
  if (noteTyping(conversationId, userId)) await publishChatEvent(conversationId, "typing", { userId });
}

/** Mark the partner's messages read — only those up to `upTo` (what was actually on screen). */
export async function markRead(conversationId: string, userId: string, upTo?: string): Promise<number> {
  const c = await loadForUser(conversationId, userId, { readOnly: true });
  const readAt = new Date();
  const until = upTo && !Number.isNaN(Date.parse(upTo)) ? new Date(upTo) : readAt;
  const { count } = await db.message.updateMany({
    where: { conversationId, senderId: { not: userId }, readAt: null, createdAt: { lte: until } },
    data: { readAt },
  });
  if (count > 0) await clearChatBell(userId, conversationId);
  // No read receipts across a block (either way)
  if (count > 0 && !(await isBlocked(userId, partnerOf(c, userId).id))) {
    // The partner's next message push should not be held back by an old throttle
    lastPush.delete(`${conversationId}:${userId}`);
    await publishChatEvent(conversationId, "read", { by: userId, at: readAt.toISOString() });
  }
  return count;
}

export async function extendConversation(conversationId: string, userId: string): Promise<ChatSummary> {
  const c = await loadForUser(conversationId, userId);
  const left = c.expiresAt.getTime() - Date.now();
  if (c.status !== "ACTIVE" || c.extended || left > EXTEND_WINDOW_DAYS * DAY_MS) {
    throw new IntroError("NOT_ALLOWED", "يمكن تمديد المحادثة مرة واحدة خلال آخر 3 أيام فقط");
  }
  // A blocked chat is read-only for the blocker too: nothing to extend
  if (await isBlocked(userId, partnerOf(c, userId).id)) throw new IntroError("BLOCKED");
  if (isUnavailable(c.match.female) || isUnavailable(c.match.male)) {
    throw new IntroError("NOT_ALLOWED", "هذا الحساب غير نشط حالياً");
  }
  const expiresAt = new Date(c.expiresAt.getTime() + EXTENSION_DAYS * DAY_MS);
  // Both sides tapping «تمديد» at once: only the first write wins, the other is told it's already extended
  const { count } = await db.conversation.updateMany({
    where: { id: conversationId, extended: false, status: "ACTIVE" },
    data: { expiresAt, extended: true, expiryWarnedAt: null },
  });
  if (count === 0) throw new IntroError("NOT_ALLOWED", "تم تمديد هذه المحادثة مسبقاً");
  const partner = partnerOf(c, userId);
  // Badge only, looked up alongside the event and the notice
  const partnerProLookup = isPro(partner.id).catch(() => false);
  await publishChatEvent(conversationId, "status", { status: "ACTIVE", expiresAt: expiresAt.toISOString() });
  await notify({
    userId: partner.id,
    type: "CHAT",
    title: "تم تمديد المحادثة",
    body: "تم تمديد المحادثة 7 أيام إضافية.",
    url: `/dashboard/chats/${conversationId}`,
    metadata: { conversationId },
    preference: CHAT_NOTICE_PREFERENCE,
  });
  return summarise({ ...c, expiresAt, extended: true, expiryWarnedAt: null }, userId, null, 0, false, false, await partnerProLookup);
}

export async function endConversation(args: {
  conversationId: string;
  userId: string;
  /** `messageId`: «إبلاغ عن الرسالة», a message of this chat (else INVALID, 400, and nothing is ended or filed) */
  report?: { reason: ReportReason; details?: string; messageId?: string };
  /**
   * «إبلاغ فقط» (owner ruling, modern chat): `false` files the report and nothing else: the chat stays open, nobody is
   * blocked and no request is cancelled (admins act by hand). Needs a report. Default true (end, and with a report block).
   */
  end?: boolean;
}): Promise<void> {
  const { conversationId, userId, report } = args;
  const end = args.end !== false;
  if (!end && !report) throw new IntroError("INVALID", "يمكنك اختيار سبب البلاغ");
  // Read-only access is enough: someone the other person blocked can still report this chat
  const c = await loadForUser(conversationId, userId, { readOnly: true });
  const partner = partnerOf(c, userId);
  if (report?.messageId) {
    const target = await db.message.findUnique({
      where: { id: report.messageId },
      select: { id: true, conversationId: true, senderId: true },
    });
    // Only the partner's message can be reported (QA WC2-16): never my own, never one from another chat
    if (!target || target.conversationId !== conversationId || target.senderId !== partner.id) {
      throw new IntroError("INVALID", "لا يمكن الإبلاغ عن هذه الرسالة");
    }
  }
  // Only an open chat can be ended (and the partner told): not an expired or ended one, and not across
  // a block — a blocked person must not push «أنهى الطرف الآخر المحادثة» to the blocker. Reporting
  // («إبلاغ») stays possible on any chat.
  const open = c.status === "ACTIVE" && c.expiresAt.getTime() > Date.now() && !(await isBlocked(userId, partner.id));
  if (!open && !report) throw new IntroError("NOT_ALLOWED", "لا يمكن إنهاء هذه المحادثة الآن");

  if (!end && report) {
    // «إبلاغ فقط»: the same filing (reopens a repeat report, emails the admins), and the chat goes on
    await fileReport({
      reporterId: userId, reportedId: partner.id, reason: report.reason, details: report.details, conversationId,
      ...(report.messageId && { messageId: report.messageId }),
    });
    return;
  }

  if (open) {
    await db.conversation.update({
      where: { id: conversationId },
      data: { status: "ENDED", endedById: userId, endedAt: new Date() },
    });
    // A chat ended by a user closes the family path on this match too (no refund)
    await db.introRequest.updateMany({
      where: { matchId: c.matchId, type: "FAMILY", status: "PENDING" },
      data: { status: "CANCELLED" },
    });
    await publishChatEvent(conversationId, "status", { status: "ENDED" });
    await notify({
      userId: partner.id,
      type: "CHAT",
      title: "انتهت المحادثة",
      body: "أنهى الطرف الآخر المحادثة. نتمنى لك التوفيق في اقتراحاتك القادمة.",
      url: "/dashboard/chats",
      metadata: { conversationId },
      preference: CHAT_NOTICE_PREFERENCE,
    });
  }

  if (report) {
    // Same path as the match card: reopens a repeat report and emails the admins
    await fileReport({
      reporterId: userId, reportedId: partner.id, reason: report.reason, details: report.details, conversationId,
      ...(report.messageId && { messageId: report.messageId }),
    });
    const existing = await db.block.findFirst({ where: { blockerId: userId, blockedId: partner.id } });
    if (!existing) await db.block.create({ data: { blockerId: userId, blockedId: partner.id } });
    await cancelPendingBetween(userId, partner.id);
  }
}
