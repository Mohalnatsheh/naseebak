"use client";

import { useSyncExternalStore } from "react";
import { BellOff, BellRing, ChevronLeft, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useDashboardData } from "@/contexts/dashboard-context";
import { forViewer } from "@/lib/gendered-copy";
import { usePushState } from "@/components/shared/push-setup";
import { openPushSetup } from "@/components/shared/notification-bar";

/**
 * Home / chats card while notifications are off on this device: one button that opens the guided
 * setup sheet (PushSetupSheet, hosted by NotificationBar). Says how many steps are left for this
 * phone so it never looks like a chore. Hidden for 3 days after closing.
 */

const DISMISS_KEY = "naseeb:install-card-dismissed-at";
const DISMISS_DAYS = 3;

function recentlyDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return !!at && Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

const DISMISSED_EVENT = "naseeb:install-card-dismissed";
function subscribeDismissed(onChange: () => void) {
  window.addEventListener(DISMISSED_EVENT, onChange);
  return () => window.removeEventListener(DISMISSED_EVENT, onChange);
}

export function InstallAppCard({ context = "dashboard" }: { context?: "dashboard" | "chats" }) {
  const gender = useDashboardData().profile?.gender;
  const { device, stage } = usePushState();
  const dismissed = useSyncExternalStore(subscribeDismissed, recentlyDismissed, () => true);
  const v = (m: string, f: string) => forViewer(gender, m, f);

  if (dismissed || !device || !stage || stage === "done" || stage === "none") return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // private mode: nothing to remember it in
    }
    window.dispatchEvent(new Event(DISMISSED_EVENT));
  }

  const blocked = stage === "blocked";
  const left =
    stage === "allow" ? 1 : stage === "install" ? 2 : device.os === "ios" ? 3 : 2;
  const title = blocked
    ? v("الإشعارات مغلقة على جهازك", "الإشعارات مغلقة على جهازكِ")
    : `${left === 1 ? "ضغطة واحدة" : left === 2 ? "خطوتان" : "3 خطوات"} ${v("وتصلك", "وتصلكِ")} الإشعارات`;
  const lead =
    context === "chats"
      ? v("حتى تعرف برسائل المحادثة فور وصولها، حتى والموقع مغلق.", "حتى تعرفي برسائل المحادثة فور وصولها، حتى والموقع مغلق.")
      : v(
          "حتى تعرف فوراً عندما يبدي أحدهم اهتمامه أو يحصل توافق — لا تفوّت فرصة بسبب التأخير.",
          "حتى تعرفي فوراً عندما يبدي أحدهم اهتمامه أو يحصل توافق — لا تفوّتي فرصة بسبب التأخير."
        );

  return (
    <Card className="relative overflow-hidden border-accent/40 bg-gradient-to-l from-accent/10 to-transparent">
      <button
        type="button"
        onClick={dismiss}
        aria-label="إخفاء"
        className="absolute top-2 end-2 flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
      >
        <X className="h-4 w-4" />
      </button>
      <CardContent className="space-y-4 pt-5 pb-5">
        <div className="flex items-start gap-4 pe-8">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-accent shadow-md">
            {blocked ? <BellOff className="h-6 w-6" /> : <BellRing className="h-6 w-6" />}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-lg text-foreground">{title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{lead}</p>
          </div>
        </div>
        <Button size="lg" onClick={openPushSetup} className="h-12 w-full gap-1.5 sm:w-auto">
          {blocked ? "طريقة فتحها" : v("ابدأ الآن", "ابدئي الآن")}
          <ChevronLeft className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}
