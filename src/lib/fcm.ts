/**
 * Push to the mobile app through Firebase Cloud Messaging (the website stays on OneSignal, src/lib/onesignal.ts).
 * Devices are Firebase Installation IDs (FIDs, FCM direct send) in `push_devices`, registered by the app with
 * `POST /api/mobile/push`; only devices whose app sign-in is still valid get a push. FIDs FCM reports as gone are deleted.
 *
 * Credentials: FCM_CREDENTIALS = the Firebase service-account JSON (one line). Missing → push is skipped.
 * Fails silently — push errors never break the main notification flow.
 */
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getMessaging, type FidMulticastMessage } from "firebase-admin/messaging";
import { db } from "@/lib/db";

/** Android notification channel the app creates (naseebak_app/lib/core/push/push_service.dart) */
export const FCM_ANDROID_CHANNEL = "naseebak_default";

/** FCM errors that mean the device will never get a push again (not invalid-argument: a bad payload gives it too) */
const DEAD_DEVICE_CODES = new Set([
  "messaging/installation-id-not-registered",
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

let app: App | null | undefined;

function firebaseApp(): App | null {
  if (app !== undefined) return app;
  const raw = process.env.FCM_CREDENTIALS;
  if (!raw) {
    app = null;
    return app;
  }
  try {
    const existing = getApps().find((a) => a.name === "naseebak-fcm");
    app = existing ?? initializeApp({ credential: cert(JSON.parse(raw)) }, "naseebak-fcm");
  } catch (error) {
    console.warn("[FCM] Bad FCM_CREDENTIALS, push disabled:", error);
    app = null;
  }
  return app;
}

/** FIDs of a member's app devices with a valid sign-in */
export async function activePushFids(userId: string, now = new Date()): Promise<string[]> {
  const rows = await db.pushDevice.findMany({
    where: { userId, mobileSession: { revokedAt: null, expiresAt: { gt: now } } },
    select: { fid: true },
  });
  return rows.map((r) => r.fid);
}

/** Whether the member has the app with push on a valid sign-in (SMS fallback check) */
export async function hasAppPushDevice(userId: string, now = new Date()): Promise<boolean> {
  return (await activePushFids(userId, now)).length > 0;
}

interface FcmPayload {
  userId: string;
  title: string;
  body: string;
  /** Site path the notice opens (the app maps it to a screen, like the in-app list) */
  url?: string;
  /** Same id replaces the previous push on the device (e.g. one chat) */
  collapseId?: string;
}

export function buildFcmMessage(fids: string[], { title, body, url, collapseId }: Omit<FcmPayload, "userId">): FidMulticastMessage {
  return {
    fids,
    notification: { title, body },
    data: { ...(url && { url }) },
    android: {
      priority: "high",
      ...(collapseId && { collapseKey: collapseId }),
      notification: { channelId: FCM_ANDROID_CHANNEL, ...(collapseId && { tag: collapseId }) },
    },
    apns: {
      headers: { ...(collapseId && { "apns-collapse-id": collapseId.slice(0, 64) }) },
      payload: { aps: { sound: "default", ...(collapseId && { "thread-id": collapseId }) } },
    },
  };
}

export async function sendFcmPush(payload: FcmPayload): Promise<void> {
  try {
    const firebase = firebaseApp();
    if (!firebase) return;
    const fids = await activePushFids(payload.userId);
    if (fids.length === 0) return;

    const res = await getMessaging(firebase).sendEachForMulticast(buildFcmMessage(fids, payload));
    const dead = res.responses.flatMap((r, i) => (!r.success && DEAD_DEVICE_CODES.has(r.error?.code ?? "") ? [fids[i]] : []));
    if (dead.length > 0) await db.pushDevice.deleteMany({ where: { fid: { in: dead } } });
    if (res.failureCount > dead.length) {
      const other = res.responses.find((r) => !r.success && !DEAD_DEVICE_CODES.has(r.error?.code ?? ""));
      console.warn(`[FCM] ${res.failureCount - dead.length} push(es) failed for`, payload.userId, other?.error?.code);
    }
  } catch (err) {
    console.warn("[FCM] Push error:", err);
  }
}
