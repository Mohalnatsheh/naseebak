/**
 * SMS for chats that never got going (owner decision 2026-10-22). Most members have no push device (31%), so new
 * chats stalled: 10 chats with no message at all, 8 where a woman wrote first and never got a reply.
 *
 * Who gets ONE SMS per chat (`chatSmsTargets`):
 *  - nobody has written yet (chat open 2 h+) → both members: «تم فتح محادثة لك ولم تبدأ بعد»;
 *  - only one member has written → the silent member, if a message to them is still unread 2 h+: «لديك رسالة»;
 *  - both members have written → never (they are talking; the app's own notices are enough).
 * Through the shared sms-notice rules: at most one SMS per member per Amman day, never for test / suspended /
 * deactivated members, never when they have a push device, never to members who turned chat notices off, and no
 * SMS at night (23:00–09:00 Amman — the morning run catches up). Chats older than 7 days are not chased.
 *
 * One row per (chat, member) in `chat_sms_notices` records the result for /admin/chats. "already_today",
 * "unknown_push" and "failed" are retried on a later run (every 15 min, at most every 3 h); every other result is
 * final, so a member never gets two SMS for the same chat. Admins can send one directly (`sendChatSmsNow`: no daily
 * cap, no push check, no 2-hour wait — still only to members who haven't started that chat).
 */
import { db } from "@/lib/db";
import { CHAT_NOTICE_PREFERENCE } from "@/lib/notification-prefs";
import { sendSmsNotice, type SmsNoticeResult } from "@/lib/sms-notice";

export const CHAT_SMS_AFTER_MS = 2 * 60 * 60 * 1000;
export const CHAT_SMS_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const RETRY_AFTER_MS = 3 * 60 * 60 * 1000;
export const RETRYABLE = ["already_today", "unknown_push", "failed"];
export type ChatSmsStatus = SmsNoticeResult | "opted_out" | "sent_admin";
export type ChatSmsEvent = "chat_open" | "message";

/** Pure: Amman hour (UTC+3 all year) — 23:00–08:59 is quiet. */
export function isQuietHour(now: Date): boolean {
  const h = (now.getUTCHours() + 3) % 24;
  return h >= 23 || h < 9;
}

export interface ChatShape {
  femaleId: string;
  maleId: string;
  createdAt: Date;
  messages: { senderId: string; readAt: Date | null; createdAt: Date }[];
}

/**
 * Pure: who should get the one SMS for this chat, and which one. `ignoreDelay` (admin «send now») skips the 2-hour
 * wait. Returns [] when both members have written.
 */
export function chatSmsTargets(c: ChatShape, now: Date, ignoreDelay = false): { userId: string; event: ChatSmsEvent }[] {
  const due = (t: Date) => ignoreDelay || now.getTime() - t.getTime() >= CHAT_SMS_AFTER_MS;
  const speakers = new Set(c.messages.map((m) => m.senderId));
  if (speakers.size >= 2) return [];
  if (speakers.size === 0) return due(c.createdAt) ? [{ userId: c.femaleId, event: "chat_open" }, { userId: c.maleId, event: "chat_open" }] : [];
  const writer = [...speakers][0];
  const silent = writer === c.femaleId ? c.maleId : c.femaleId;
  const unread = c.messages.filter((m) => m.senderId === writer && !m.readAt);
  if (!unread.length) return []; // they read it — an SMS would add nothing
  const oldest = unread.reduce((a, m) => (m.createdAt < a ? m.createdAt : a), unread[0].createdAt);
  return due(oldest) ? [{ userId: silent, event: "message" }] : [];
}

const chatSelect = {
  id: true,
  createdAt: true,
  match: { select: { femaleId: true, maleId: true } },
  messages: { select: { senderId: true, readAt: true, createdAt: true, smsNoticeStatus: true } },
} as const;

async function chatNoticesOn(userId: string) {
  const pref = await db.notificationPreference.findUnique({ where: { userId } });
  return !pref || (pref as unknown as Record<string, unknown>)[CHAT_NOTICE_PREFERENCE] !== false;
}

/** Already handled for this chat? (a final result, a recent retryable one, or the earlier per-message SMS of 1bcad84) */
function alreadyHandled(row: { status: string; at: Date } | undefined, legacySent: boolean, now: Date) {
  if (legacySent) return true;
  if (!row) return false;
  if (!RETRYABLE.includes(row.status)) return true;
  return now.getTime() - row.at.getTime() < RETRY_AFTER_MS;
}

async function record(conversationId: string, userId: string, status: ChatSmsStatus, now: Date, sentBy: string | null = null) {
  await db.chatSmsNotice.upsert({
    where: { conversationId_userId: { conversationId, userId } },
    create: { conversationId, userId, status, at: now, sentBy },
    update: { status, at: now, sentBy },
  });
}

/** The 15-minute job. */
export async function runUnreadSms(now = new Date()) {
  if (isQuietHour(now)) return { skipped: "quiet_hours" as const };
  const chats = await db.conversation.findMany({
    where: { status: "ACTIVE", expiresAt: { gt: now }, createdAt: { gte: new Date(now.getTime() - CHAT_SMS_MAX_AGE_MS) } },
    select: chatSelect,
    take: 2000,
  });
  const rows = await db.chatSmsNotice.findMany({ where: { conversationId: { in: chats.map((c) => c.id) } } });
  const counts: Record<string, number> = {};
  let targetsN = 0;
  for (const c of chats) {
    const targets = chatSmsTargets({ ...c.match, createdAt: c.createdAt, messages: c.messages }, now);
    for (const t of targets) {
      const legacy = c.messages.some((m) => m.senderId !== t.userId && (m.smsNoticeStatus === "sent" || m.smsNoticeStatus === "sent_admin"));
      if (alreadyHandled(rows.find((r) => r.conversationId === c.id && r.userId === t.userId), legacy, now)) continue;
      targetsN++;
      const status: ChatSmsStatus = (await chatNoticesOn(t.userId)) ? await sendSmsNotice(t.userId, t.event, now) : "opted_out";
      await record(c.id, t.userId, status, now);
      counts[status] = (counts[status] ?? 0) + 1;
    }
  }
  return { chats: chats.length, targets: targetsN, ...counts };
}

/** Admin «Send SMS now»: the members who haven't started this chat, right away (no cap, no push check, no wait). */
export async function sendChatSmsNow(conversationId: string, adminId: string, now = new Date()) {
  const c = await db.conversation.findUnique({ where: { id: conversationId }, select: chatSelect });
  if (!c) return { ok: false as const, reason: "not_found" };
  const targets = chatSmsTargets({ ...c.match, createdAt: c.createdAt, messages: c.messages }, now, true);
  if (!targets.length) return { ok: false as const, reason: "both_talking" };
  const results: ChatSmsStatus[] = [];
  for (const t of targets) {
    const status: ChatSmsStatus = !(await chatNoticesOn(t.userId))
      ? "opted_out"
      : await sendSmsNotice(t.userId, t.event, now, { force: true }).then((r) => (r === "sent" ? "sent_admin" : r));
    await record(c.id, t.userId, status, now, adminId);
    results.push(status);
  }
  console.log(`[chat-sms] admin=${adminId} conversation=${conversationId} results=${results.join(",")}`);
  return { ok: true as const, results };
}

/** /admin/chats: per chat — talking or not, and each silent member's SMS state. */
export async function chatSmsOverview(conversationIds: string[], now = new Date()) {
  const [chats, rows] = await Promise.all([
    db.conversation.findMany({
      where: { id: { in: conversationIds } },
      select: { ...chatSelect, match: { select: { femaleId: true, maleId: true, female: { select: { firstName: true } }, male: { select: { firstName: true } } } } },
    }),
    db.chatSmsNotice.findMany({ where: { conversationId: { in: conversationIds } } }),
  ]);
  const out = new Map<string, { talking: boolean; members: { name: string; status: string | null; at: Date | null }[] }>();
  for (const c of chats) {
    const shape = { femaleId: c.match.femaleId, maleId: c.match.maleId, createdAt: c.createdAt, messages: c.messages };
    const talking = new Set(c.messages.map((m) => m.senderId)).size >= 2;
    const silent = talking ? [] : chatSmsTargets(shape, now, true).map((t) => t.userId);
    out.set(c.id, {
      talking,
      members: silent.map((uid) => {
        const row = rows.find((r) => r.conversationId === c.id && r.userId === uid);
        const legacy = c.messages.find((m) => m.senderId !== uid && (m.smsNoticeStatus === "sent" || m.smsNoticeStatus === "sent_admin"));
        return {
          name: (uid === c.match.femaleId ? c.match.female.firstName : c.match.male.firstName) ?? "",
          status: row?.status ?? (legacy ? legacy.smsNoticeStatus : null),
          at: row?.at ?? null,
        };
      }),
    });
  }
  return out;
}
