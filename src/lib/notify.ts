/**
 * Single entry point for user notifications: stores the in-app notification (with the
 * link it opens) and sends a push when the user's preference for that type allows it.
 * In-app rows are always kept so nothing is lost; preferences only silence the device push.
 * Never throws — a notification failure must not break the action that triggered it.
 */
import type { NotificationType } from "@prisma/client";
import { db } from "@/lib/db";
import { sendPushNotification } from "@/lib/onesignal";
import { sendFcmPush } from "@/lib/fcm";
import { notificationUrl } from "@/lib/notification-links";
import { sendSmsNotice, smsEventFor, type SmsNoticeEvent } from "@/lib/sms-notice";
import type { PreferenceKey } from "@/lib/notification-prefs";
import { toLebanese } from "@/lib/notifications/lebanese";
import { activeCountryCodes } from "@/lib/countries/settings";

export { CHAT_NOTICE_PREFERENCE, type PreferenceKey } from "@/lib/notification-prefs";

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  /** Page to open; defaults to the type's page */
  url?: string;
  metadata?: Record<string, unknown>;
  /** Push only, no in-app row (chat messages) */
  pushOnly?: boolean;
  /** Replace earlier pushes with the same id on the device instead of stacking them */
  collapseId?: string;
  /**
   * At most one notification with this key per person per day (Amman time): later ones that day are
   * dropped, in-app row and push alike (e.g. "new suggestions", which top-ups create many times a day)
   */
  oncePerDay?: string;
  /**
   * SMS fallback for members with no push device (lib/sms-notice.ts, max 1 SMS per member per day).
   * Default: on for the match / «مهتم» / expiring-card notices (recognised by type + title), off
   * otherwise. Pass an event to opt in, or false to opt out.
   */
  sms?: SmsNoticeEvent | false;
  /**
   * Which push preference silences this notice, when it isn't the type's own (e.g. chat expiry /
   * "2 days left" / family nudge are CHAT rows but follow «طلبات التعارف», not «رسائل المحادثات»,
   * so muting message pushes doesn't hide them). null = always pushed, like SYSTEM.
   */
  preference?: PreferenceKey | null;
  /** Which push to send: the website (OneSignal), the mobile app (FCM) or both (default). The in-app row is the same. */
  channel?: PushChannel;
  /** Send the text exactly as written (an admin's own words): never rewritten into a member's dialect */
  verbatim?: boolean;
  /** The reader's country when the caller already has it: saves looking it up */
  country?: string | null;
}

export type PushChannel = "all" | "web" | "app";

/** Midnight today in Amman (UTC+3 all year since 2022), as a UTC instant */
export function startOfAmmanDay(now = new Date()): Date {
  const AMMAN_OFFSET_MS = 3 * 60 * 60 * 1000;
  const local = new Date(now.getTime() + AMMAN_OFFSET_MS);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - AMMAN_OFFSET_MS);
}

const PREFERENCE_KEY: Partial<Record<NotificationType, PreferenceKey>> = {
  SUGGESTION: "suggestions",
  INTEREST: "interests",
  MATCH: "matches",
  VISIT_UPDATE: "visitUpdates",
  PAYMENT: "payments",
  IDENTITY: "identity",
  SUPPORT: "support",
  INTRO_REQUEST: "introRequests",
  CHAT: "chatMessages",
};

async function pushAllowed(userId: string, type: NotificationType, override?: PreferenceKey | null): Promise<boolean> {
  const key = override === undefined ? PREFERENCE_KEY[type] : override;
  if (!key) return true; // SYSTEM, SUBSCRIPTION always go through
  const pref = await db.notificationPreference.findUnique({ where: { userId } });
  return !pref || (pref as unknown as Record<string, unknown>)[key] !== false;
}

/**
 * The body as this reader gets it: Lebanese members read it in Lebanese dialect (lib/notifications/lebanese.ts).
 * The title stays: jobs find earlier notices by their stored title (daily limits, reminders, SMS fallback, Insights).
 */
function bodyFor(body: string, country: string | null | undefined): string {
  return country === "LB" ? toLebanese(body) : body;
}

/**
 * Whether any active country reads notices in a dialect (only Lebanon). While none does, readers' countries are not
 * looked up at all, so Jordanian and Saudi notices cost no extra query (country settings are cached for 30 s).
 */
async function dialectInUse(): Promise<boolean> {
  try {
    return (await activeCountryCodes()).includes("LB");
  } catch {
    return false;
  }
}

/** The reader's country, or null when unknown (the text then goes out as written) */
async function countryOf(userId: string): Promise<string | null> {
  try {
    const user = await db.user.findUnique({ where: { id: userId }, select: { country: true } });
    return user?.country ?? null;
  } catch {
    return null;
  }
}

export async function notify(input: NotifyInput): Promise<void> {
  if (input.verbatim) return deliver(input, null);
  if (input.country !== undefined) return deliver(input, input.country);
  return deliver(input, (await dialectInUse()) ? await countryOf(input.userId) : null);
}

async function deliver(input: NotifyInput, country: string | null): Promise<void> {
  const { userId, type, title, metadata, pushOnly, collapseId, oncePerDay, channel = "all" } = input;
  const body = bodyFor(input.body, country);
  const url = input.url ?? notificationUrl(type, metadata);
  try {
    if (oncePerDay) {
      const sentToday = await db.notification.findFirst({
        where: { userId, type, createdAt: { gte: startOfAmmanDay() }, metadata: { path: ["daily"], equals: oncePerDay } },
        select: { id: true },
      });
      if (sentToday) return;
    }
    if (!pushOnly) {
      await db.notification.create({
        data: { userId, type, title, body, metadata: { ...metadata, url, ...(oncePerDay && { daily: oncePerDay }) } as object },
      });
    }
    if (await pushAllowed(userId, type, input.preference)) {
      // Website (OneSignal) and mobile app (FCM) in parallel; each fails silently on its own
      await Promise.all([
        channel !== "app" && sendPushNotification({ userId, title, body, url, collapseId }),
        channel !== "web" && sendFcmPush({ userId, title, body, url, collapseId }),
      ]);
      const smsEvent = input.sms === false ? null : (input.sms ?? smsEventFor(type, title));
      // Not awaited: the OneSignal lookup + SMS must not slow the action that triggered it
      if (smsEvent) void sendSmsNotice(userId, smsEvent);
    }
  } catch (error) {
    console.error("[notify] failed:", error);
  }
}

export async function notifyMany(userIds: string[], input: Omit<NotifyInput, "userId">): Promise<void> {
  // Every reader's country in one query, so each notice is worded for its reader
  let countries = new Map<string, string>();
  if (!input.verbatim && userIds.length > 0 && (await dialectInUse())) {
    try {
      const users = await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, country: true } });
      countries = new Map(users.map((u) => [u.id, u.country]));
    } catch {
      // Unknown country: the text goes out as written
    }
  }
  await Promise.all(userIds.map((userId) => deliver({ ...input, userId }, countries.get(userId) ?? null)));
}
