/**
 * Browser-side push helpers around OneSignal (react-onesignal is loaded lazily by OneSignalProvider).
 * Kept free of server imports so client components can use it.
 */
import { signOut } from "next-auth/react";

let ready = false;

/** Called by OneSignalProvider once the SDK is initialised and logged in as the user */
export function markOneSignalReady(): void {
  ready = true;
}

/**
 * Ask for notification permission through OneSignal, so the device is registered for this user's
 * pushes. Falls back to the browser prompt when OneSignal isn't running (no app id, local dev).
 */
export async function requestPushPermission(): Promise<void> {
  try {
    if (ready) {
      const { default: OneSignal } = await import("react-onesignal");
      await OneSignal.Notifications.requestPermission();
      return;
    }
  } catch (error) {
    console.warn("[OneSignal] permission request failed, using the browser prompt:", error);
  }
  if ("Notification" in window && Notification.permission === "default") {
    await Notification.requestPermission().catch(() => {});
  }
}

/**
 * Sign out and unlink this device from the account first, so a shared phone stops receiving the
 * previous person's pushes (chat messages included). Never blocks the sign-out for long.
 */
export async function signOutAndUnlinkPush(callbackUrl = "/login"): Promise<void> {
  if (ready) {
    try {
      const { default: OneSignal } = await import("react-onesignal");
      await Promise.race([OneSignal.logout(), new Promise((r) => setTimeout(r, 1500))]);
    } catch (error) {
      console.warn("[OneSignal] logout failed:", error);
    }
    ready = false;
  }
  await signOut({ callbackUrl });
}
