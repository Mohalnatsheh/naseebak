"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { markOneSignalReady } from "@/lib/push-client";

export function OneSignalProvider() {
  const { data: session } = useSession();
  const initialized = useRef(false);

  useEffect(() => {
    const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
    if (!appId || appId === "your-onesignal-app-id") return;
    if (!session?.user?.id) return;
    if (session.user.role === "ADMIN") return;
    if (initialized.current) return;
    initialized.current = true;

    async function initOneSignal() {
      try {
        const OneSignalModule = await import("react-onesignal");
        const OneSignal = OneSignalModule.default;

        // Safari needs its web id (OneSignal dashboard → Settings → Web); the bell widget stays off,
        // the dashboard has its own Arabic bar (NotificationBar)
        const safariWebId = process.env.NEXT_PUBLIC_ONESIGNAL_SAFARI_WEB_ID;
        await OneSignal.init({
          appId: appId!,
          ...(safariWebId && { safari_web_id: safariWebId }),
          allowLocalhostAsSecureOrigin: process.env.NODE_ENV === "development",
        });

        await OneSignal.login(session!.user!.id!);
        // Sign-out now unlinks this device, and permission requests go through OneSignal
        markOneSignalReady();

        // Allowed in the browser but not subscribed (allowed before OneSignal loaded, or opted out
        // earlier): subscribe now, so "allowed" always means pushes arrive
        if (typeof Notification !== "undefined" && Notification.permission === "granted" && !OneSignal.User.PushSubscription.optedIn) {
          await OneSignal.User.PushSubscription.optIn().catch((e: unknown) => console.warn("[OneSignal] opt-in failed:", e));
        }

        // Allowed later on this page (a browser prompt shown before the SDK was ready, or the
        // browser's own settings): subscribe as soon as the permission turns to granted
        OneSignal.Notifications.addEventListener("permissionChange", (granted: boolean) => {
          if (granted && !OneSignal.User.PushSubscription.optedIn) {
            OneSignal.User.PushSubscription.optIn().catch((e: unknown) => console.warn("[OneSignal] opt-in failed:", e));
          }
        });

        // Save player ID to backend
        const playerId = await OneSignal.User.PushSubscription.id;
        if (playerId) {
          await fetch("/api/push/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ playerId }),
          });
        }

        // Listen for subscription changes
        OneSignal.User.PushSubscription.addEventListener("change", async (event: { current: { id?: string | null } }) => {
          const newId = event.current?.id;
          if (newId) {
            await fetch("/api/push/register", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ playerId: newId }),
            });
          }
        });
      } catch (err) {
        console.warn("[OneSignal] Init error:", err);
      }
    }

    initOneSignal();
  }, [session]);

  return null;
}
