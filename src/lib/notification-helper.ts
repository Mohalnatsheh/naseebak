import { db } from "@/lib/db";
import { sendPushNotification } from "@/lib/onesignal";

type NotificationType =
  | "SUGGESTION"
  | "INTEREST"
  | "MATCH"
  | "VISIT_UPDATE"
  | "IDENTITY"
  | "PAYMENT"
  | "SUBSCRIPTION"
  | "SYSTEM"
  | "SUPPORT";

const typeToPreferenceKey: Record<string, string> = {
  SUGGESTION: "suggestions",
  INTEREST: "interests",
  MATCH: "matches",
  VISIT_UPDATE: "visitUpdates",
  PAYMENT: "payments",
  IDENTITY: "identity",
  SUPPORT: "support",
};

/**
 * Create a notification and send push — respecting user preferences.
 * SYSTEM and SUBSCRIPTION types always go through (no preference check).
 * If no preference record exists, defaults are all enabled.
 */
export async function createNotificationIfAllowed(
  userId: string,
  type: NotificationType,
  title: string,
  body: string,
  metadata?: Record<string, unknown>,
  pushUrl?: string,
) {
  // SYSTEM and SUBSCRIPTION always go through
  const prefKey = typeToPreferenceKey[type];
  if (prefKey) {
    const pref = await db.notificationPreference.findUnique({
      where: { userId },
    });
    if (pref && !(pref as Record<string, unknown>)[prefKey]) {
      // User has explicitly disabled this type
      return null;
    }
  }

  const notification = await db.notification.create({
    data: {
      userId,
      type,
      title,
      body,
      metadata: metadata ? (metadata as Record<string, string>) : undefined,
    },
  });

  // Fire-and-forget push
  sendPushNotification({ userId, title, body, url: pushUrl }).catch(() => {});

  return notification;
}
