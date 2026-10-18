/**
 * Single entry point for user notifications: stores the in-app notification (with the
 * link it opens) and sends a push when the user's preference for that type allows it.
 * In-app rows are always kept so nothing is lost; preferences only silence the device push.
 * Never throws — a notification failure must not break the action that triggered it.
 */
import type { NotificationType } from "@prisma/client";
import { db } from "@/lib/db";
import { sendPushNotification } from "@/lib/onesignal";
import { notificationUrl } from "@/lib/notification-links";

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
}

/** Midnight today in Amman (UTC+3 all year since 2022), as a UTC instant */
export function startOfAmmanDay(now = new Date()): Date {
  const AMMAN_OFFSET_MS = 3 * 60 * 60 * 1000;
  const local = new Date(now.getTime() + AMMAN_OFFSET_MS);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - AMMAN_OFFSET_MS);
}

const PREFERENCE_KEY: Partial<Record<NotificationType, string>> = {
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

async function pushAllowed(userId: string, type: NotificationType): Promise<boolean> {
  const key = PREFERENCE_KEY[type];
  if (!key) return true; // SYSTEM, SUBSCRIPTION always go through
  const pref = await db.notificationPreference.findUnique({ where: { userId } });
  return !pref || (pref as unknown as Record<string, unknown>)[key] !== false;
}

export async function notify(input: NotifyInput): Promise<void> {
  const { userId, type, title, body, metadata, pushOnly, collapseId, oncePerDay } = input;
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
    if (await pushAllowed(userId, type)) {
      await sendPushNotification({ userId, title, body, url, collapseId });
    }
  } catch (error) {
    console.error("[notify] failed:", error);
  }
}

export async function notifyMany(userIds: string[], input: Omit<NotifyInput, "userId">): Promise<void> {
  await Promise.all(userIds.map((userId) => notify({ ...input, userId })));
}
