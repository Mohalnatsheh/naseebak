/**
 * In-app chat between two matched users after an accepted chat request.
 * Text only, 14 days (+7 once in the last 3 days), filtered, rate-limited.
 * Expiry and the "2 days left" warning are applied lazily whenever a conversation is read,
 * so no scheduler is needed.
 */
import type { ReportReason } from "@prisma/client";
import { db } from "@/lib/db";
import { notify, notifyMany } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";
import { getCycleFlags } from "@/lib/settings";
import { publishChatEvent } from "@/lib/ably";
import { checkMessage } from "@/lib/chat/filter";
import { IntroError } from "@/lib/intro/errors";

const DAY_MS = 24 * 60 * 60 * 1000;
export const EXTENSION_DAYS = 7;
export const EXTEND_WINDOW_DAYS = 3;
export const WARN_BEFORE_DAYS = 2;
export const MESSAGES_PER_DAY = 50;
const PUSH_THROTTLE_MS = 3 * 60 * 1000;

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

const partyUser = { select: { id: true, firstName: true, isVerified: true } } as const;
const conversationInclude = {
  match: { select: { id: true, femaleId: true, maleId: true, female: partyUser, male: partyUser } },
} as const;

type LoadedConversation = NonNullable<Awaited<ReturnType<typeof findConversation>>>;

function findConversation(id: string) {
  return db.conversation.findUnique({ where: { id }, include: conversationInclude });
}

async function loadForUser(id: string, userId: string): Promise<LoadedConversation> {
  const c = await findConversation(id);
  if (!c || (c.match.femaleId !== userId && c.match.maleId !== userId)) {
    throw new IntroError("NOT_FOUND", "المحادثة غير موجودة");
  }
  return housekeeping(c);
}

function partnerOf(c: LoadedConversation, userId: string) {
  return c.match.femaleId === userId ? c.match.male : c.match.female;
}

/** Expire overdue chats and send the one-time "2 days left" warning. */
async function housekeeping(c: LoadedConversation): Promise<LoadedConversation> {
  if (c.status !== "ACTIVE") return c;
  const now = Date.now();
  const left = c.expiresAt.getTime() - now;
  // Conditional updates: parallel requests (counts poll + chat page, two tabs) act only once
  if (left <= 0) {
    const { count } = await db.conversation.updateMany({ where: { id: c.id, status: "ACTIVE" }, data: { status: "EXPIRED" } });
    if (count === 1) await publishChatEvent(c.id, "status", { status: "EXPIRED" });
    return { ...c, status: "EXPIRED" };
  }
  if (left < WARN_BEFORE_DAYS * DAY_MS && !c.expiryWarnedAt) {
    const warnedAt = new Date();
    const { count } = await db.conversation.updateMany({
      where: { id: c.id, expiryWarnedAt: null },
      data: { expiryWarnedAt: warnedAt },
    });
    if (count !== 1) return { ...c, expiryWarnedAt: warnedAt };
    await notifyMany([c.match.femaleId, c.match.maleId], {
      type: "CHAT",
      title: "تنتهي المحادثة قريباً",
      body: "بقي يومان على انتهاء المحادثة. يمكنكما التمديد مرة واحدة أو الانتقال لتعارف عائلي.",
      url: `/dashboard/chats/${c.id}`,
      metadata: { conversationId: c.id },
    });
    return { ...c, expiryWarnedAt: warnedAt };
  }
  return c;
}

function summarise(
  c: LoadedConversation,
  userId: string,
  last: { body: string; createdAt: Date; senderId: string } | null,
  unread: number,
  blocked = false
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
  const summaries: ChatSummary[] = [];
  for (const row of rows) {
    const c = await housekeeping(row);
    summaries.push(summarise(c, userId, row.messages[0] ?? null, row._count.messages));
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

export async function getConversation(
  id: string,
  userId: string,
  opts: { before?: string; after?: string; limit?: number } = {}
): Promise<{ conversation: ChatSummary; messages: ChatMessage[]; hasMore: boolean }> {
  const c = await loadForUser(id, userId);
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

  const [unread, blocked] = await Promise.all([
    db.message.count({ where: { conversationId: id, readAt: null, senderId: { not: userId } } }),
    isBlocked(userId, partnerOf(c, userId).id),
  ]);
  const last = messages.length ? messages[messages.length - 1] : null;
  return {
    conversation: summarise(c, userId, last, unread, blocked),
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
  if (await isBlocked(senderId, partner.id)) throw new IntroError("BLOCKED");

  // Filter first: a blocked attempt is never saved and doesn't use up the sending allowance
  const check = checkMessage(body);
  if (!check.ok) throw new IntroError("FILTERED", check.message);

  // ~1 message per second on average, short bursts allowed
  if (!rateLimit(`chat-burst:${senderId}`, { maxAttempts: 5, windowMs: 5000 }).success) {
    throw new IntroError("RATE_LIMITED", "تمهّل قليلاً قبل إرسال رسالة أخرى");
  }
  if (!rateLimit(`chat-day:${senderId}`, { maxAttempts: MESSAGES_PER_DAY, windowMs: DAY_MS }).success) {
    throw new IntroError("RATE_LIMITED", "وصلت للحد اليومي للرسائل (٥٠ رسالة). تابع غداً.");
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
      title: sender.firstName,
      body: check.text.length > 80 ? `${check.text.slice(0, 80)}…` : check.text,
      url: `/dashboard/chats/${conversationId}`,
      pushOnly: true,
      collapseId: `chat-${conversationId}`,
    });
  }

  return toMessage(message, senderId);
}

/** Mark the partner's messages read — only those up to `upTo` (what was actually on screen). */
export async function markRead(conversationId: string, userId: string, upTo?: string): Promise<number> {
  await loadForUser(conversationId, userId);
  const readAt = new Date();
  const until = upTo && !Number.isNaN(Date.parse(upTo)) ? new Date(upTo) : readAt;
  const { count } = await db.message.updateMany({
    where: { conversationId, senderId: { not: userId }, readAt: null, createdAt: { lte: until } },
    data: { readAt },
  });
  if (count > 0) {
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
    throw new IntroError("NOT_ALLOWED", "يمكن تمديد المحادثة مرة واحدة خلال آخر ٣ أيام فقط");
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
    body: "تم تمديد المحادثة ٧ أيام إضافية.",
    url: `/dashboard/chats/${conversationId}`,
    metadata: { conversationId },
  });
  return summarise({ ...c, expiresAt, extended: true, expiryWarnedAt: null }, userId, null, 0);
}

export async function endConversation(args: {
  conversationId: string;
  userId: string;
  report?: { reason: ReportReason; details?: string };
}): Promise<void> {
  const { conversationId, userId, report } = args;
  const c = await loadForUser(conversationId, userId);
  const partner = partnerOf(c, userId);

  if (c.status !== "ENDED") {
    await db.conversation.update({
      where: { id: conversationId },
      data: { status: "ENDED", endedById: userId, endedAt: new Date() },
    });
    await publishChatEvent(conversationId, "status", { status: "ENDED" });
    await notify({
      userId: partner.id,
      type: "CHAT",
      title: "انتهت المحادثة",
      body: "أنهى الطرف الآخر المحادثة. نتمنى لك التوفيق في اقتراحاتك القادمة.",
      url: "/dashboard/chats",
      metadata: { conversationId },
    });
  }

  if (report) {
    await db.report.upsert({
      where: { reporterId_reportedId: { reporterId: userId, reportedId: partner.id } },
      create: { reporterId: userId, reportedId: partner.id, reason: report.reason, details: report.details },
      update: { reason: report.reason, details: report.details, status: "PENDING" },
    });
    const existing = await db.block.findFirst({ where: { blockerId: userId, blockedId: partner.id } });
    if (!existing) await db.block.create({ data: { blockerId: userId, blockedId: partner.id } });
  }
}
