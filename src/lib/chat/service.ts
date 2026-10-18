/**
 * In-app chat between two matched users after an accepted chat request.
 * Text only, 14 days (+7 once in the last 3 days), filtered, rate-limited.
 * Expiry, the day-7 family nudge and the "2 days left" warning are applied lazily whenever a
 * conversation is read, and by the daily job (chatHousekeepingAll) for chats nobody opens.
 */
import type { ReportReason } from "@prisma/client";
import { db } from "@/lib/db";
import { notify, notifyMany } from "@/lib/notify";
import { CHAT_NOTICE_PREFERENCE } from "@/lib/notification-prefs";
import { rateLimit } from "@/lib/rate-limit";
import { getCycleFlags } from "@/lib/settings";
import { publishChatEvent } from "@/lib/ably";
import { checkMessage, completesSplitNumber, mayBePartOfNumber, SPLIT_NUMBER_WINDOW_MS } from "@/lib/chat/filter";
import { IntroError } from "@/lib/intro/errors";
import { fileReport } from "@/lib/reports";
import { LEGACY_ADMIN_VISIT, cancelPendingBetween, familyMoveOpenUntil, isUnavailable } from "@/lib/matches/state";

const DAY_MS = 24 * 60 * 60 * 1000;
export const EXTENSION_DAYS = 7;
export const EXTEND_WINDOW_DAYS = 3;
export const WARN_BEFORE_DAYS = 2;
/** Days after opening when both get one "ready for a family introduction?" nudge */
export const FAMILY_NUDGE_AFTER_DAYS = 7;
/** ...only within this window, so chats that were already older on release day aren't all nudged at once */
const FAMILY_NUDGE_WINDOW_DAYS = 2;
export const MESSAGES_PER_DAY = 50;
const PUSH_THROTTLE_MS = 3 * 60 * 1000;

/** «حتى 12 نوفمبر» — the last day of the free chat → family move */
export function familyMoveDeadlineLabel(chatExpiresAt: Date): string {
  return familyMoveOpenUntil(chatExpiresAt).toLocaleDateString("ar-JO-u-nu-latn", {
    day: "numeric",
    month: "long",
    timeZone: "Asia/Amman",
  });
}

export type ConversationState = "ACTIVE" | "ENDED" | "EXPIRED";

export interface ChatSummary {
  id: string;
  matchId: string;
  partner: { id: string; firstName: string; isVerified: boolean };
  status: ConversationState;
  expiresAt: string;
  canExtend: boolean;
  /** Who ended it, when ENDED */
  endedByMe: boolean;
  /** One side blocked the other: read-only */
  blocked: boolean;
  /** The match page isn't available to me (the other person blocked me): hide links to it */
  matchHidden: boolean;
  lastMessage: { body: string; createdAt: string; mine: boolean } | null;
  unread: number;
}

export interface ChatMessage {
  id: string;
  body: string;
  createdAt: string;
  mine: boolean;
  readAt: string | null;
}

const partyUser = { select: { id: true, firstName: true, isVerified: true, status: true, isDeactivated: true } } as const;
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
async function loadForUser(id: string, userId: string, opts: { readOnly?: boolean } = {}): Promise<LoadedConversation> {
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
          body: `هل تنتقلان لتعارف عائلي؟ الانتقال مجاني حتى ${familyMoveDeadlineLabel(c.expiresAt)}، وتتبادل العائلتان بيانات وليّ الأمر لترتيب الزيارة.`,
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
  last: { body: string; createdAt: Date; senderId: string } | null,
  unread: number,
  blocked = false,
  matchHidden = false
): ChatSummary {
  const left = c.expiresAt.getTime() - Date.now();
  const partner = partnerOf(c, userId);
  return {
    id: c.id,
    matchId: c.matchId,
    partner: { id: partner.id, firstName: partner.firstName, isVerified: partner.isVerified },
    status: c.status,
    expiresAt: c.expiresAt.toISOString(),
    canExtend: c.status === "ACTIVE" && !c.extended && left <= EXTEND_WINDOW_DAYS * DAY_MS,
    endedByMe: c.status === "ENDED" && c.endedById === userId,
    blocked,
    matchHidden,
    lastMessage: last
      ? { body: last.body, createdAt: last.createdAt.toISOString(), mine: last.senderId === userId }
      : null,
    unread,
  };
}

function toMessage(m: { id: string; body: string; createdAt: Date; senderId: string; readAt: Date | null }, userId: string): ChatMessage {
  return {
    id: m.id,
    body: m.body,
    createdAt: m.createdAt.toISOString(),
    mine: m.senderId === userId,
    readAt: m.readAt ? m.readAt.toISOString() : null,
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
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, createdAt: true, senderId: true } },
      _count: { select: { messages: { where: { readAt: null, senderId: { not: userId } } } } },
    },
  });
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
  const summaries: ChatSummary[] = [];
  for (const row of rows) {
    const c = await housekeeping(row);
    const partnerId = partnerOf(c, userId).id;
    summaries.push(
      summarise(c, userId, row.messages[0] ?? null, row._count.messages, blockedWith.has(partnerId), blockedMeBy.has(partnerId))
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
  opts: { before?: string; after?: string; limit?: number } = {}
): Promise<{ conversation: ChatSummary; messages: ChatMessage[]; hasMore: boolean }> {
  const c = await loadForUser(id, userId, { readOnly: true });
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);

  let messages;
  let hasMore = false;
  if (opts.after) {
    messages = await db.message.findMany({
      where: { conversationId: id, createdAt: { gt: new Date(opts.after) } },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
  } else {
    const page = await db.message.findMany({
      where: { conversationId: id, ...(opts.before && { createdAt: { lt: new Date(opts.before) } }) },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
    });
    hasMore = page.length > limit;
    messages = page.slice(0, limit).reverse();
  }

  const partnerId = partnerOf(c, userId).id;
  const [unread, blocked, blockedMe] = await Promise.all([
    db.message.count({ where: { conversationId: id, readAt: null, senderId: { not: userId } } }),
    isBlocked(userId, partnerId),
    db.block.findFirst({ where: { blockerId: partnerId, blockedId: userId }, select: { id: true } }),
  ]);
  const last = messages.length ? messages[messages.length - 1] : null;
  return {
    conversation: summarise(c, userId, last, unread, blocked, !!blockedMe),
    messages: messages.map((m) => toMessage(m, userId)),
    hasMore,
  };
}

// Last push per conversation+recipient, so a burst of messages makes one push (single PM2 process)
const lastPush = new Map<string, number>();

export async function sendMessage(args: {
  conversationId: string;
  senderId: string;
  body: string;
  /** Echoed back on the live event so the sender's screen can replace its optimistic copy */
  clientNonce?: string;
}): Promise<ChatMessage> {
  const { conversationId, senderId, body, clientNonce } = args;
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

  // Filter first: a blocked attempt is never saved and doesn't use up the sending allowance
  const check = checkMessage(body);
  if (!check.ok) throw new IntroError("FILTERED", check.message);
  // A number sent in pieces ("صفر سبعة تسعة", then "واحد اثنان …"): read my recent messages together
  if (mayBePartOfNumber(check.text)) {
    const recent = await db.message.findMany({
      where: { conversationId, createdAt: { gt: new Date(Date.now() - SPLIT_NUMBER_WINDOW_MS) } },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { senderId: true, body: true },
    });
    // Only my own run of messages since the partner last wrote
    const mine: string[] = [];
    for (const m of recent) {
      if (m.senderId !== senderId) break;
      mine.push(m.body);
    }
    if (completesSplitNumber(check.text, mine)) {
      throw new IntroError("FILTERED", "لا يمكن مشاركة أرقام الهواتف أو الروابط أو حسابات التواصل. مشاركة التواصل تتم عبر التعارف العائلي.");
    }
  }

  // ~1 message per second on average, short bursts allowed
  if (!rateLimit(`chat-burst:${senderId}`, { maxAttempts: 5, windowMs: 5000 }).success) {
    throw new IntroError("RATE_LIMITED", "تمهّل قليلاً قبل إرسال رسالة أخرى");
  }
  if (!rateLimit(`chat-day:${senderId}`, { maxAttempts: MESSAGES_PER_DAY, windowMs: DAY_MS }).success) {
    throw new IntroError("RATE_LIMITED", "وصلت للحد اليومي للرسائل (50 رسالة). تابع غداً.");
  }

  const message = await db.message.create({ data: { conversationId, senderId, body: check.text } });
  await publishChatEvent(conversationId, "message", {
    id: message.id,
    senderId,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
    clientNonce,
  });

  const key = `${conversationId}:${partner.id}`;
  const now = Date.now();
  if (now - (lastPush.get(key) ?? 0) >= PUSH_THROTTLE_MS) {
    lastPush.set(key, now);
    const sender = senderId === c.match.femaleId ? c.match.female : c.match.male;
    await notify({
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

  return toMessage(message, senderId);
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
  await db.conversation.update({
    where: { id: conversationId },
    data: { expiresAt, extended: true, expiryWarnedAt: null },
  });
  await publishChatEvent(conversationId, "status", { status: "ACTIVE", expiresAt: expiresAt.toISOString() });
  const partner = partnerOf(c, userId);
  await notify({
    userId: partner.id,
    type: "CHAT",
    title: "تم تمديد المحادثة",
    body: "تم تمديد المحادثة 7 أيام إضافية.",
    url: `/dashboard/chats/${conversationId}`,
    metadata: { conversationId },
    preference: CHAT_NOTICE_PREFERENCE,
  });
  return summarise({ ...c, expiresAt, extended: true, expiryWarnedAt: null }, userId, null, 0);
}

export async function endConversation(args: {
  conversationId: string;
  userId: string;
  report?: { reason: ReportReason; details?: string };
}): Promise<void> {
  const { conversationId, userId, report } = args;
  // Read-only access is enough: someone the other person blocked can still report this chat
  const c = await loadForUser(conversationId, userId, { readOnly: true });
  const partner = partnerOf(c, userId);

  if (c.status !== "ENDED") {
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
    // Same path as the match card: reopens a repeat report and counts toward the auto-flag
    await fileReport({ reporterId: userId, reportedId: partner.id, reason: report.reason, details: report.details, conversationId });
    const existing = await db.block.findFirst({ where: { blockerId: userId, blockedId: partner.id } });
    if (!existing) await db.block.create({ data: { blockerId: userId, blockedId: partner.id } });
    await cancelPendingBetween(userId, partner.id);
  }
}
