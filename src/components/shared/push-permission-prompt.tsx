"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";

const DISMISSED_KEY = "naseeb_push_prompt_dismissed";

const ONBOARDING_KEY = "naseeb_onboarding_completed";
/** Shown once per browser session at most, whatever the answer (closing the browser's own popup leaves it undecided) */
const SHOWN_THIS_SESSION_KEY = "naseeb_push_prompt_shown";

export function PushPermissionPrompt() {
  const [visible, setVisible] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    // Don't show if: no Notification API, already granted/denied, or user dismissed
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "default") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      try {
        if (localStorage.getItem(DISMISSED_KEY)) return;
        if (sessionStorage.getItem(SHOWN_THIS_SESSION_KEY)) return;
        // Wait until the welcome guide is finished, so two dialogs never stack
        if (!localStorage.getItem(ONBOARDING_KEY)) return;
      } catch {
        return;
      }
      timer = setTimeout(() => {
        try {
          sessionStorage.setItem(SHOWN_THIS_SESSION_KEY, "1");
        } catch {
          // Private mode: it may show again next page, never worse than before
        }
        setVisible(true);
      }, 5000);
    };
    // Checked again on every page change: right after the welcome guide closes nothing opens,
    // the prompt waits for the next page so the two never come back to back
    schedule();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [pathname]);

  if (!visible || pathname.startsWith("/dashboard/profile/setup")) return null;

  const handleEnable = async () => {
    try {
      await Notification.requestPermission();
    } catch {
      // Browser blocked the request
    } finally {
      // Close whatever the answer — a denied permission can't be asked again from here
      setVisible(false);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "1");
    setVisible(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="relative w-[90%] max-w-sm rounded-2xl border border-border/50 bg-card p-6 shadow-2xl shadow-primary/10 animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-secondary text-primary-foreground shadow-lg shadow-primary/20">
            <Bell className="h-7 w-7" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-lg font-bold text-foreground">
              فعّل الإشعارات الفورية
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              احصل على تنبيه فوري عند وصول اقتراح جديد أو توافق متبادل أو رسالة جديدة
            </p>
          </div>
          <div className="flex items-center gap-3 w-full pt-1">
            <Button
              onClick={handleEnable}
              className="flex-1 h-11 rounded-xl text-sm font-semibold bg-gradient-to-l from-primary to-primary/90 shadow-md shadow-primary/15"
            >
              تفعيل الإشعارات
            </Button>
            <Button
              variant="outline"
              onClick={handleDismiss}
              className="flex-1 h-11 rounded-xl text-sm font-medium border-border/60"
            >
              لاحقاً
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
