"use client";

import { useState, useEffect } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";

const DISMISSED_KEY = "naseeb_push_prompt_dismissed";

export function PushPermissionPrompt() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Don't show if: no Notification API, already granted/denied, or user dismissed
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "default") return;
    if (localStorage.getItem(DISMISSED_KEY)) return;

    const timer = setTimeout(() => setVisible(true), 5000);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  const handleEnable = async () => {
    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        setVisible(false);
      }
    } catch {
      // Browser blocked the request
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
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-secondary text-white shadow-lg shadow-primary/20">
            <Bell className="h-7 w-7" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-lg font-bold text-foreground">
              فعّل الإشعارات الفورية
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              احصل على تنبيه فوري عند وصول اقتراح جديد أو توافق متبادل
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
