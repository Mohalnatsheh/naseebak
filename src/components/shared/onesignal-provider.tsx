"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";

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

        await OneSignal.init({
          appId: appId!,
          allowLocalhostAsSecureOrigin: process.env.NODE_ENV === "development",
        });

        await OneSignal.login(session!.user!.id!);

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
