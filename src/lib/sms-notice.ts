/**
 * SMS fallback for a few high-value notices (owner decision 2026-10-18), for members a push can't
 * reach: no push device registered in OneSignal (never allowed notifications, or an iPhone without
 * the installed app). Events: a mutual match, someone said «مهتم» (the hidden-card reveal notice)
 * and a suggestion about to expire.
 *
 * Rules: at most one SMS per member per Amman day (`User.lastSmsNoticeAt`, claimed atomically),
 * never for test accounts, admins, suspended or deactivated members, never when the member turned
 * that notification type off, and never when push reachability is unknown (OneSignal not configured
 * or the lookup failed) — an SMS costs money and must not duplicate a push.
 *
 * `notify()` calls this on its own for the three events (matched by type + title, see
 * `smsEventFor`), or when a caller passes `sms: "<event>"`; `sms: false` turns it off.
 */
import type { NotificationType } from "@prisma/client";
import { db } from "@/lib/db";
import { sendSms } from "@/lib/sms";
import { isTestPhone } from "@/lib/test-accounts";

export type SmsNoticeEvent = "match" | "interest" | "expiring";

const SITE = "naseebak.com";

/** Short, gender-neutral, no names or details (an SMS can be read by anyone holding the phone) */
export const SMS_NOTICE_TEXT: Record<SmsNoticeEvent, string> = {
  match: `نصيبك: لديك توافق متبادل جديد! ادخل إلى حسابك لمعرفة الخطوة التالية: ${SITE}/dashboard/matches`,
  interest: `نصيبك: شخص أبدى اهتمامه بك. يمكنك الاطلاع على الاقتراح من حسابك: ${SITE}/dashboard/suggestions`,
  expiring: `نصيبك: لديك اقتراح توافق بانتظار قرارك وينتهي خلال يومين: ${SITE}/dashboard/suggestions`,
};

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

/** Midnight today in Amman (UTC+3 all year), as a UTC instant */
function startOfAmmanDay(now: Date): Date {
  const offset = 3 * 60 * 60 * 1000;
  const local = new Date(now.getTime() + offset);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - offset);
}

/**
 * Whether OneSignal has an enabled push subscription for this member (external_id = user id).
 * null = unknown (not configured, or the lookup failed).
 */
export async function hasPushDevice(userId: string): Promise<boolean | null> {
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

export type SmsNoticeResult = "sent" | "skipped" | "has_push" | "unknown_push" | "already_today" | "failed";

/** Send the event's SMS if this member qualifies (see the rules above). Never throws. */
export async function sendSmsNotice(
  userId: string,
  event: SmsNoticeEvent,
  now = new Date(),
): Promise<SmsNoticeResult> {
  try {
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
    const dayStart = startOfAmmanDay(now);
    if (user.lastSmsNoticeAt && user.lastSmsNoticeAt >= dayStart) return "already_today";

    const push = await hasPushDevice(userId);
    if (push === true) return "has_push";
    if (push === null) return "unknown_push";

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
