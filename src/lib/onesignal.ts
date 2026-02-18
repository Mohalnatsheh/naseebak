import { db } from "@/lib/db";

const ONESIGNAL_APP_ID = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY;

interface PushPayload {
  userId: string;
  title: string;
  body: string;
  url?: string;
}

/**
 * Send a push notification to a single user via OneSignal REST API.
 * Fails silently — push errors never break the main notification flow.
 */
export async function sendPushNotification({ userId, title, body, url }: PushPayload) {
  try {
    if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
      console.warn("[OneSignal] Missing env vars, skipping push");
      return;
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { oneSignalPlayerId: true },
    });

    if (!user?.oneSignalPlayerId) {
      console.warn(`[OneSignal] No player ID for user ${userId}, skipping push`);
      return;
    }

    const payload: Record<string, unknown> = {
      app_id: ONESIGNAL_APP_ID,
      include_player_ids: [user.oneSignalPlayerId],
      headings: { ar: title, en: title },
      contents: { ar: body, en: body },
    };

    if (url) {
      payload.url = url;
    }

    const res = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${ONESIGNAL_REST_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      console.warn(`[OneSignal] Push failed (${res.status}):`, text);
    }
  } catch (err) {
    console.warn("[OneSignal] Push error:", err);
  }
}

/**
 * Send push notifications to multiple users in parallel.
 * Uses Promise.allSettled so individual failures don't affect others.
 */
export async function sendPushNotificationToMany(
  userIds: string[],
  { title, body, url }: Omit<PushPayload, "userId">
) {
  await Promise.allSettled(
    userIds.map((userId) => sendPushNotification({ userId, title, body, url }))
  );
}
