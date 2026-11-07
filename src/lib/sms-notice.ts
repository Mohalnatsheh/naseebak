/**
 * SMS fallback for a few high-value notices (owner decision 2026-10-18), for members a push can't
 * reach: no push device registered in OneSignal (never allowed notifications, or an iPhone without
 * the installed app). Events: a mutual match, someone said «مهتم» (the hidden-card reveal notice)
 * and a suggestion about to expire.
 *
 * Rules: at most one SMS per member per Amman day (`User.lastSmsNoticeAt`, claimed atomically) — for every
 * notice, admin «send now» included (owner decision 2026-10-22; OTP codes are not notices and are not capped),
 * none at night (23:00–09:00 Amman: held, then sent by `catchUpQuietSms` from the 15-minute job),
 * never for test accounts, admins, suspended or deactivated members, never when the member turned
 * that notification type off, and never when push reachability is unknown (OneSignal not configured
 * or the lookup failed) — an SMS costs money and must not duplicate a push.
 *
 * `notify()` calls this on its own for the three events (matched by type + title, see
 * `smsEventFor`), or when a caller passes `sms: "<event>"`; `sms: false` turns it off.
 */
import { startOfAmmanDay } from "@/lib/amman-day";
import type { NotificationType } from "@prisma/client";
import { db } from "@/lib/db";
import { sendSms } from "@/lib/sms";
import { isTestPhone } from "@/lib/test-accounts";
import { getSetting } from "@/lib/settings";
import { hasAppPushDevice } from "@/lib/fcm";

/** Owner switch (2026-10-29): notice SMS are off unless system_settings sms_notices_enabled = "true". OTP SMS are never affected. */
export async function smsNoticesEnabled(): Promise<boolean> {
  return (await getSetting("sms_notices_enabled")) === "true";
}

export type SmsNoticeEvent = "match" | "interest" | "expiring" | "waiting" | "message" | "chat_open";

const SITE = "naseebak.com";

/**
 * Short, gender-neutral, no names or details (an SMS can be read by anyone holding the phone). Each fits one Arabic
 * SMS: at most `SMS_SINGLE_PART` characters (UCS-2), link included (owner 2026-11-07).
 */
export const SMS_NOTICE_TEXT: Record<SmsNoticeEvent, string> = {
  match: `نصيبك: لديك توافق متبادل جديد! ${SITE}/dashboard/matches`,
  interest: `نصيبك: شخص أبدى اهتمامه بك. ${SITE}/dashboard/suggestions`,
  expiring: `نصيبك: اقتراح ينتهي خلال يومين. ${SITE}/dashboard/suggestions`,
  waiting: `نصيبك: اقتراح بانتظار قرارك. ${SITE}/dashboard/suggestions`,
  message: `نصيبك: لديك رسالة جديدة. ${SITE}/dashboard/chats`,
  chat_open: `نصيبك: محادثتك مفتوحة ولم تبدأ بعد. ${SITE}/dashboard/chats`,
};

/** One Arabic (UCS-2) SMS part */
export const SMS_SINGLE_PART = 70;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Narrowed notice SMS (owner 2026-11-07): the automatic SMS go only for these events, and only to members seen in
 * the last `SMS_ACTIVE_DAYS` days. On production a «مهتم» to someone with no push was answered 25% of the time,
 * 44% with push. An admin «send now» is limited by neither rule.
 */
export const SMS_NOTICE_EVENTS: readonly SmsNoticeEvent[] = ["match", "interest"];
export const SMS_ACTIVE_DAYS = 14;

/**
 * The notices that get the SMS fallback without the caller asking (their call sites live in
 * intro/match.ts, suggestions/mutual.ts and cron/suggestions.ts).
 */
const AUTO_EVENTS: { type: NotificationType; title: string; event: SmsNoticeEvent }[] = [
  { type: "MATCH", title: "توافق متبادل!", event: "match" },
  { type: "SUGGESTION", title: "شخص أبدى اهتمامه بك", event: "interest" },
  { type: "SUGGESTION", title: "اقتراح بانتظار قرارك", event: "expiring" },
];

export function smsEventFor(type: NotificationType, title: string): SmsNoticeEvent | null {
  return AUTO_EVENTS.find((e) => e.type === type && e.title === title)?.event ?? null;
}


/**
 * Whether a push can reach this member: the mobile app with a valid sign-in (FCM, `push_devices`), else an
 * enabled OneSignal web subscription (external_id = user id).
 * null = unknown (OneSignal not configured, or the lookup failed).
 */
export async function hasPushDevice(userId: string): Promise<boolean | null> {
  if (process.env.FCM_CREDENTIALS && (await hasAppPushDevice(userId).catch(() => false))) return true;
  const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
  const key = process.env.ONESIGNAL_REST_API_KEY;
  if (!appId || !key) return null;
  try {
    const res = await fetch(
      `https://api.onesignal.com/apps/${appId}/users/by/external_id/${encodeURIComponent(userId)}`,
      { headers: { Authorization: `Key ${key}` } },
    );
    if (res.status === 404) return false; // never logged in on a device that allowed push
    if (!res.ok) {
      console.warn(`[sms-notice] OneSignal lookup failed (${res.status}) for`, userId);
      return null;
    }
    const data = (await res.json()) as {
      subscriptions?: { type?: string; enabled?: boolean; notification_types?: number }[];
    };
    return (data.subscriptions ?? []).some(
      (s) => /Push$/.test(s.type ?? "") && s.enabled !== false && (s.notification_types ?? 1) > 0,
    );
  } catch (error) {
    console.warn("[sms-notice] OneSignal lookup error:", error);
    return null;
  }
}

export type SmsNoticeResult =
  | "sent" | "skipped" | "has_push" | "unknown_push" | "already_today" | "quiet" | "failed" | "disabled"
  /** Automatic sends only: an event that no longer gets an SMS, or a member away longer than SMS_ACTIVE_DAYS */
  | "not_sms_event" | "inactive";

/** Pure: Amman hour (UTC+3 all year) — no notice SMS 23:00–08:59 (owner decision 2026-10-23, all notices). */
export function isQuietHour(now: Date): boolean {
  const h = (now.getUTCHours() + 3) % 24;
  return h >= 23 || h < 9;
}

/** Send the event's SMS if this member qualifies (see the rules above). Never throws. */
export async function sendSmsNotice(
  userId: string,
  event: SmsNoticeEvent,
  now = new Date(),
  /** Admin «send now»: skip the push check. The once-a-day cap always applies (still never test / suspended / deactivated). */
  opts: { skipPushCheck?: boolean } = {},
): Promise<SmsNoticeResult> {
  try {
    // Notice SMS switched off (owner): nothing is sent or claimed
    if (!(await smsNoticesEnabled())) return "disabled";
    if (!opts.skipPushCheck && !SMS_NOTICE_EVENTS.includes(event)) return "not_sms_event";
    // Night: nothing is sent or claimed; catchUpQuietSms sends it after 09:00 (chat SMS retry on their own)
    if (isQuietHour(now)) return "quiet";
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        phone: true,
        role: true,
        status: true,
        isDeactivated: true,
        lastSmsNoticeAt: true,
        lastActiveAt: true,
        updatedAt: true,
      },
    });
    if (!user?.phone || user.role !== "USER" || user.status === "SUSPENDED" || user.isDeactivated) return "skipped";
    if (isTestPhone(user.phone)) return "skipped";
    const away = !user.lastActiveAt || user.lastActiveAt.getTime() < now.getTime() - SMS_ACTIVE_DAYS * DAY_MS;
    if (!opts.skipPushCheck && away) return "inactive";
    const dayStart = startOfAmmanDay(now);
    if (user.lastSmsNoticeAt && user.lastSmsNoticeAt >= dayStart) return "already_today";

    if (!opts.skipPushCheck) {
      const push = await hasPushDevice(userId);
      if (push === true) return "has_push";
      if (push === null) return "unknown_push";
    }

    // Claim today's SMS (two notices at the same moment send one). This write bumps updatedAt:
    // keep "last seen" where it was for members with no lastActiveAt yet (see runReengagement)
    const { count } = await db.user.updateMany({
      where: { id: userId, OR: [{ lastSmsNoticeAt: null }, { lastSmsNoticeAt: { lt: dayStart } }] },
      data: { lastSmsNoticeAt: now, ...(user.lastActiveAt ? {} : { lastActiveAt: user.updatedAt }) },
    });
    if (count === 0) return "already_today";

    const sent = await sendSms(user.phone, SMS_NOTICE_TEXT[event]);
    if (!sent) {
      console.warn("[sms-notice] SMS failed for", userId, event);
      return "failed";
    }
    console.log("[sms-notice] sent", event, "to", userId);
    return "sent";
  } catch (error) {
    console.error("[sms-notice] failed:", userId, event, error);
    return "failed";
  }
}

/** Same preference keys as notify(): no SMS for a type the member turned off */
const SMS_PREFERENCE: Partial<Record<NotificationType, string>> = { SUGGESTION: "suggestions", MATCH: "matches" };
/** Most important first, when one member got several held notices in the night */
const EVENT_RANK: SmsNoticeEvent[] = ["match", "interest", "expiring"];
/** How far back a held notice still deserves its SMS */
const CATCH_UP_WINDOW_MS = 12 * 60 * 60 * 1000;

/**
 * After 09:00 Amman: the SMS that notify() held back during the night (match / interest / expiring
 * notices created 23:00–09:00) — one per member, the most important one, only while the notice is still
 * unread. Every normal rule still applies inside sendSmsNotice (one per day, no push device, ...).
 * Called by the 15-minute job; a member already texted today simply gets "already_today".
 */
export async function catchUpQuietSms(now = new Date()): Promise<Record<string, number>> {
  if (!(await smsNoticesEnabled())) return { disabled: 1 };
  if (isQuietHour(now)) return { skipped: 1 };
  const since = new Date(now.getTime() - CATCH_UP_WINDOW_MS);
  const rows = await db.notification.findMany({
    where: {
      createdAt: { gte: since },
      isRead: false,
      OR: AUTO_EVENTS.map((e) => ({ type: e.type, title: e.title })),
      user: { OR: [{ lastSmsNoticeAt: null }, { lastSmsNoticeAt: { lt: startOfAmmanDay(now) } }] },
    },
    select: { userId: true, type: true, title: true, createdAt: true },
    orderBy: { createdAt: "asc" },
    take: 2000,
  });
  // Only the notices that were held (made during quiet hours)
  const best = new Map<string, { event: SmsNoticeEvent; type: NotificationType }>();
  for (const r of rows) {
    if (!isQuietHour(r.createdAt)) continue;
    const event = smsEventFor(r.type, r.title);
    if (!event || !SMS_NOTICE_EVENTS.includes(event)) continue;
    const prev = best.get(r.userId);
    if (!prev || EVENT_RANK.indexOf(event) < EVENT_RANK.indexOf(prev.event)) best.set(r.userId, { event, type: r.type });
  }
  const counts: Record<string, number> = {};
  for (const [userId, { event, type }] of [...best].slice(0, 300)) {
    const key = SMS_PREFERENCE[type];
    if (key) {
      const pref = await db.notificationPreference.findUnique({ where: { userId } });
      if (pref && (pref as unknown as Record<string, unknown>)[key] === false) {
        counts.opted_out = (counts.opted_out ?? 0) + 1;
        continue;
      }
    }
    const status = await sendSmsNotice(userId, event, now);
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return counts;
}
