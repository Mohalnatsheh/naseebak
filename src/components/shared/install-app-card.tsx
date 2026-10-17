"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BellOff, ChevronLeft, Smartphone, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { currentDevice, pushPermission, type Device } from "@/lib/install-env";
import { canPromptInstall, onInstallPromptChange } from "@/lib/install-prompt";
import { InstallSteps } from "@/components/shared/install-guide";

/**
 * "Install Naseebak" card. Installing gives an app icon and, on iPhone, is the only way to get
 * notifications (Apple allows web push only for sites added to the Home Screen).
 * - Inside Instagram / Facebook / TikTok browsers: how to reopen the site in Safari / Chrome
 * - One-tap install where the browser offers it; otherwise the steps for this phone and browser
 * - Already installed but notifications blocked: a pointer to the unblock steps
 * Full guide: /dashboard/install. Hidden on desktop without one-tap install, and for 14 days after closing.
 */

const DISMISS_KEY = "naseeb:install-card-dismissed-at";
const DISMISS_DAYS = 14;

function recentlyDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return !!at && Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

type Mode = "hidden" | "install" | "blocked";

export function InstallAppCard({ context = "dashboard" }: { context?: "dashboard" | "chats" }) {
  const [mode, setMode] = useState<Mode>("hidden");
  const [device, setDevice] = useState<Device | null>(null);

  useEffect(() => {
    const update = () => {
      const d = currentDevice();
      setDevice(d);
      if (recentlyDismissed()) return setMode("hidden");
      if (d.standalone) return setMode(pushPermission() === "denied" ? "blocked" : "hidden");
      const mobile = d.os === "ios" || d.os === "android";
      setMode(mobile || d.inApp || canPromptInstall() ? "install" : "hidden");
    };
    update();
    return onInstallPromptChange(update);
  }, []);

  if (mode === "hidden" || !device) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // private mode: just hide for now
    }
    setMode("hidden");
  }

  const blocked = mode === "blocked";
  const lead = blocked
    ? "الإشعارات محظورة على هذا الجهاز، فلن تصلك الاقتراحات والرسائل. يمكنك تفعيلها من إعدادات الهاتف."
    : context === "chats"
      ? "حتى تصلك رسائل المحادثات فور وصولها، حتى لو كان الموقع مغلقاً."
      : "حتى تصلك الاقتراحات وطلبات التعارف والرسائل فور وصولها.";

  return (
    <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-l from-primary/[0.06] to-transparent">
      <button
        type="button"
        onClick={dismiss}
        aria-label="إخفاء"
        className="absolute top-3 left-3 rounded-lg p-1 text-muted-foreground hover:bg-muted"
      >
        <X className="h-4 w-4" />
      </button>
      <CardContent className="pt-5 pb-5">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary text-primary-foreground shadow-md">
            {blocked ? <BellOff className="h-6 w-6" /> : <Smartphone className="h-6 w-6" />}
          </div>
          <div className="min-w-0 flex-1 pe-6">
            <h3 className="font-bold text-foreground">{blocked ? "فعّل إشعارات نصيبك" : "ثبّت نصيبك على جهازك"}</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{lead}</p>
          </div>
        </div>

        {!blocked && (
          <div className="mt-4">
            <InstallSteps device={device} onInstalled={() => setMode("hidden")} />
          </div>
        )}

        <Link
          href="/dashboard/install"
          className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
        >
          {blocked ? "خطوات تفعيل الإشعارات" : "كل الخطوات وتفعيل الإشعارات"}
          <ChevronLeft className="h-4 w-4" />
        </Link>
      </CardContent>
    </Card>
  );
}
