/**
 * Browser-side push helpers around OneSignal (react-onesignal is loaded lazily by OneSignalProvider).
 * Kept free of server imports so client components can use it.
 */
import { signOut } from "next-auth/react";

let ready = false;
let readyWaiters: (() => void)[] = [];

/** How long a browser-prompt grant waits for the SDK before giving up (the provider retries on load) */
export const READY_WAIT_MS = 10_000;

/** Called by OneSignalProvider once the SDK is initialised and logged in as the user */
export function markOneSignalReady(): void {
  ready = true;
  const waiters = readyWaiters;
  readyWaiters = [];
  for (const resolve of waiters) resolve();
}

/** Resolves true once OneSignal is ready, or false after `ms` */
function waitForOneSignalReady(ms: number): Promise<boolean> {
  if (ready) return Promise.resolve(true);
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      readyWaiters = readyWaiters.filter((w) => w !== done);
      resolve(false);
    }, ms);
    readyWaiters.push(done);
  });
}

/**
 * The browser prompt said yes before the SDK finished loading: nothing is subscribed yet. Wait for the
 * SDK (up to READY_WAIT_MS) and opt this device in, so "allowed" means pushes arrive now, not after
 * the next page load.
 */
async function optInWhenReady(): Promise<void> {
  if (!(await waitForOneSignalReady(READY_WAIT_MS))) return;
  try {
    const { default: OneSignal } = await import("react-onesignal");
    if (!OneSignal.User.PushSubscription.optedIn) await OneSignal.User.PushSubscription.optIn();
  } catch (error) {
    console.warn("[OneSignal] opt-in after the browser prompt failed:", error);
  }
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
    const permission = await Notification.requestPermission().catch(() => "default" as const);
    // Not awaited: the setup screen shows its success step at once, the opt-in follows in the background
    if (permission === "granted") void optInWhenReady();
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
