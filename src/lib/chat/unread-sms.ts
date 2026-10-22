/**
 * SMS for unread chat messages (owner decision 2026-10-22): most members have no push device (31%), so messages
 * sat unread for days — 8 chats where a woman wrote first never got a reply. A message unread for 2 hours whose
 * receiver has no push device triggers one short SMS (no names, no message text — anyone holding the phone can
 * read it), through the shared sms-notice rules: at most one SMS per member per Amman day, never for test /
 * suspended / deactivated members, never when push is available. No SMS at night (23:00–09:00 Amman): waiting
 * messages go out in the morning run. Members who turned chat notices off are skipped.
 *
 * Every attempt is recorded on the waiting messages (`smsNoticeStatus`, `smsNoticeAt`) so /admin/chats can show
 * it; "already_today" / "unknown_push" / "failed" are retried on a later run (every 15 min, at most every 3 h
 * per message). Admins can send one directly from /admin/chats (`sendUnreadSmsNow`, no daily cap / push check).
 */
import { db } from "@/lib/db";
import { CHAT_NOTICE_PREFERENCE } from "@/lib/notification-prefs";
import { sendSmsNotice, type SmsNoticeResult } from "@/lib/sms-notice";

export const UNREAD_SMS_AFTER_MS = 2 * 60 * 60 * 1000;
/** Older unread messages are not chased (the chat has gone cold; avoids texting about week-old messages). */
export const UNREAD_SMS_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const RETRY_AFTER_MS = 3 * 60 * 60 * 1000;
const RETRYABLE = ["already_today", "unknown_push", "failed"];

/** Pure: Amman hour (UTC+3 all year) — 23:00–08:59 is quiet. */
export function isQuietHour(now: Date): boolean {
  const h = (now.getUTCHours() + 3) % 24;
  return h >= 23 || h < 9;
}

export type UnreadSmsStatus = SmsNoticeResult | "opted_out" | "sent_admin";

/** Waiting messages per receiver: unread, 2 h – 7 d old, chat still open, not yet handled (or due a retry). */
async function pendingByReceiver(now: Date) {
  const rows = await db.message.findMany({
    where: {
      readAt: null,
      createdAt: { lte: new Date(now.getTime() - UNREAD_SMS_AFTER_MS), gte: new Date(now.getTime() - UNREAD_SMS_MAX_AGE_MS) },
      conversation: { status: "ACTIVE", expiresAt: { gt: now } },
      OR: [{ smsNoticeStatus: null }, { smsNoticeStatus: { in: RETRYABLE }, smsNoticeAt: { lt: new Date(now.getTime() - RETRY_AFTER_MS) } }],
    },
    select: { id: true, senderId: true, conversation: { select: { match: { select: { femaleId: true, maleId: true } } } } },
    take: 2000,
  });
  const byReceiver = new Map<string, string[]>();
  for (const m of rows) {
    const { femaleId, maleId } = m.conversation.match;
    const receiver = m.senderId === femaleId ? maleId : femaleId;
    byReceiver.set(receiver, [...(byReceiver.get(receiver) ?? []), m.id]);
  }
  return byReceiver;
}

async function chatNoticesOn(userId: string) {
  const pref = await db.notificationPreference.findUnique({ where: { userId } });
  return !pref || (pref as unknown as Record<string, unknown>)[CHAT_NOTICE_PREFERENCE] !== false;
}

async function mark(messageIds: string[], status: UnreadSmsStatus, now: Date) {
  if (messageIds.length) await db.message.updateMany({ where: { id: { in: messageIds } }, data: { smsNoticeStatus: status, smsNoticeAt: now } });
}

/** The 15-minute job. */
export async function runUnreadSms(now = new Date()) {
  if (isQuietHour(now)) return { skipped: "quiet_hours" as const };
  const pending = await pendingByReceiver(now);
  const counts: Record<string, number> = {};
  for (const [userId, ids] of pending) {
    const status: UnreadSmsStatus = (await chatNoticesOn(userId)) ? await sendSmsNotice(userId, "message", now) : "opted_out";
    await mark(ids, status, now);
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return { receivers: pending.size, ...counts };
}

/**
 * Admin «أرسل SMS الآن» for one chat: texts whoever has unread messages in it, skipping the daily cap and the
 * push check (an admin decided), but still never test / suspended / deactivated members or ones who turned
 * chat notices off.
 */
export async function sendUnreadSmsNow(conversationId: string, adminId: string, now = new Date()) {
  const conv = await db.conversation.findUnique({
    where: { id: conversationId },
    select: { match: { select: { femaleId: true, maleId: true } }, messages: { where: { readAt: null }, select: { id: true, senderId: true } } },
  });
  if (!conv) return { ok: false as const, reason: "not_found" };
  const byReceiver = new Map<string, string[]>();
  for (const m of conv.messages) {
    const receiver = m.senderId === conv.match.femaleId ? conv.match.maleId : conv.match.femaleId;
    byReceiver.set(receiver, [...(byReceiver.get(receiver) ?? []), m.id]);
  }
  if (!byReceiver.size) return { ok: false as const, reason: "nothing_unread" };
  const results: UnreadSmsStatus[] = [];
  for (const [userId, ids] of byReceiver) {
    const status: UnreadSmsStatus = !(await chatNoticesOn(userId))
      ? "opted_out"
      : await sendSmsNotice(userId, "message", now, { force: true }).then((r) => (r === "sent" ? "sent_admin" : r));
    await mark(ids, status, now);
    results.push(status);
  }
  console.log(`[unread-sms] admin=${adminId} conversation=${conversationId} results=${results.join(",")}`);
  return { ok: true as const, results };
}
