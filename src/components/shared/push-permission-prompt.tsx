"use client";

import { useState, useEffect } from "react";
import { Bell, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
    <Card className="relative overflow-hidden border-primary/30 bg-gradient-to-l from-primary/5 via-primary/3 to-transparent shadow-md animate-in slide-in-from-top-2 duration-500">
      <div className="absolute top-0 right-0 h-24 w-24 rounded-full bg-primary/5 blur-2xl translate-x-6 -translate-y-6" />
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-foreground text-sm">
              فعّل الإشعارات الفورية
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              احصل على تنبيه فوري عند وصول اقتراح جديد أو توافق متبادل
            </p>
            <div className="flex items-center gap-2 mt-3">
              <Button
                size="sm"
                onClick={handleEnable}
                className="h-8 rounded-lg text-xs px-4 bg-primary hover:bg-primary/90"
              >
                تفعيل الإشعارات
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDismiss}
                className="h-8 rounded-lg text-xs px-3 text-muted-foreground hover:text-foreground"
              >
                لاحقاً
              </Button>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
