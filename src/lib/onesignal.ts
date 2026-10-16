const ONESIGNAL_APP_ID = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY;

interface PushPayload {
  userId: string;
  title: string;
  body: string;
  url?: string;
  /** Same id replaces the previous push on the device (e.g. one chat) */
  collapseId?: string;
}

/**
 * Send a push notification to a single user via OneSignal REST API v2.
 * Targets users by external_id (set via OneSignal.login(userId) on the client).
 * Fails silently — push errors never break the main notification flow.
 */
export async function sendPushNotification({ userId, title, body, url, collapseId }: PushPayload) {
  try {
    if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
      console.warn("[OneSignal] Missing env vars, skipping push");
      return;
    }

    const payload: Record<string, unknown> = {
      app_id: ONESIGNAL_APP_ID,
      include_aliases: { external_id: [userId] },
      target_channel: "push",
      headings: { ar: title, en: title },
      contents: { ar: body, en: body },
    };

    if (url) {
      payload.url = url;
    }
    if (collapseId) {
      payload.collapse_id = collapseId;
      payload.web_push_topic = collapseId;
    }

    const res = await fetch("https://api.onesignal.com/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Key ${ONESIGNAL_REST_API_KEY}`,
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
