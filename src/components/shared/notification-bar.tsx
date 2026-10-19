"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { BellOff, BellRing, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDashboardData } from "@/contexts/dashboard-context";
import { forViewer } from "@/lib/gendered-copy";
import { readOnboardingDone } from "@/lib/onboarding";
import { PushSetupSheet, usePushState } from "@/components/shared/push-setup";

const HIDDEN_KEY = "naseeb:notification-bar-hidden";
const AUTO_OPENED_KEY = "naseeb:push-setup-auto-at";
const AUTO_OPEN_EVERY_MS = 24 * 60 * 60 * 1000;
/** Fired by the home card (and anything else) to open the guided setup */
export const OPEN_PUSH_SETUP_EVENT = "naseeb:open-push-setup";

export function openPushSetup() {
  window.dispatchEvent(new Event(OPEN_PUSH_SETUP_EVENT));
}

const HIDDEN_CHANGED_EVENT = "naseeb:notification-bar-hidden-changed";
function subscribeHidden(onChange: () => void) {
  window.addEventListener(HIDDEN_CHANGED_EVENT, onChange);
  return () => window.removeEventListener(HIDDEN_CHANGED_EVENT, onChange);
}
function readHidden(): boolean {
  try {
    return sessionStorage.getItem(HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

function autoOpenDue(): boolean {
  try {
    const at = Number(localStorage.getItem(AUTO_OPENED_KEY));
    if (at && Date.now() - at < AUTO_OPEN_EVERY_MS) return false;
    localStorage.setItem(AUTO_OPENED_KEY, String(Date.now()));
    return true;
  } catch {
    return false; // storage blocked: never nag on every load
  }
}

/**
 * Notifications, until they are on for this device:
 * - a short bar on every dashboard page (not home, which has its own card; not in a chat room, the
 *   guide or the setup) whose one button opens the guided setup sheet (PushSetupSheet)
 * - on phones the sheet also opens by itself on the home page, at most once a day, after the
 *   onboarding guide (and right after it finishes)
 * «لاحقاً» hides the bar until the browser is closed.
 */
export function NotificationBar() {
  const gender = useDashboardData().profile?.gender;
  const pathname = usePathname();
  const { device, stage } = usePushState();
  const hidden = useSyncExternalStore(subscribeHidden, readHidden, () => true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_PUSH_SETUP_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_PUSH_SETUP_EVENT, onOpen);
  }, []);

  const actionable = stage === "browser" || stage === "install" || stage === "allow";
  const phone = device?.os === "ios" || device?.os === "android";

  // Auto-open on the home page (phones, something to do, onboarding seen), at most once a day
  useEffect(() => {
    if (pathname !== "/dashboard" || !actionable || !phone) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tryOpen = () => {
      if (!readOnboardingDone(window.localStorage)) return;
      timer = setTimeout(() => autoOpenDue() && setOpen(true), 1200);
    };
    tryOpen();
    window.addEventListener("naseeb:onboarding-done", tryOpen);
    return () => {
      window.removeEventListener("naseeb:onboarding-done", tryOpen);
      if (timer) clearTimeout(timer);
    };
  }, [pathname, actionable, phone]);

  const sheet = <PushSetupSheet open={open} onOpenChange={setOpen} gender={gender} />;

  const barHidden =
    hidden ||
    !stage ||
    stage === "done" ||
    stage === "none" ||
    pathname === "/dashboard" ||
    /^\/dashboard\/chats\/[^/]+/.test(pathname) ||
    pathname.startsWith("/dashboard/install") ||
    pathname.startsWith("/dashboard/profile/setup");
  if (barHidden) return sheet;

  function hide() {
    try {
      sessionStorage.setItem(HIDDEN_KEY, "1");
    } catch {
      // private mode: stays visible (nothing to remember it in)
    }
    window.dispatchEvent(new Event(HIDDEN_CHANGED_EVENT));
  }

  const blocked = stage === "blocked";
  const Icon = blocked ? BellOff : BellRing;
  const text = blocked
    ? forViewer(
        gender,
        "الإشعارات مغلقة على هذا الجهاز، فلن تعرف بالتوافق والرسائل فور حدوثها.",
        "الإشعارات مغلقة على هذا الجهاز، فلن تعرفي بالتوافق والرسائل فور حدوثها."
      )
    : forViewer(
        gender,
        "الإشعارات غير مفعّلة: لن تعرف بالاقتراحات والتوافق فور حدوثها.",
        "الإشعارات غير مفعّلة: لن تعرفي بالاقتراحات والتوافق فور حدوثها."
      );

  return (
    <>
      <div
        role="region"
        aria-label="الإشعارات"
        className="mb-4 flex items-center gap-2.5 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2.5 text-xs sm:gap-3 sm:text-sm"
      >
        <Icon className="h-5 w-5 flex-shrink-0 text-accent-foreground" aria-hidden="true" />
        <p className="min-w-0 flex-1 leading-relaxed text-foreground/90">{text}</p>
        <Button onClick={() => setOpen(true)} className="h-11 flex-shrink-0">
          {forViewer(gender, "فعّلها الآن", "فعّليها الآن")}
        </Button>
        <button
          type="button"
          onClick={hide}
          aria-label="لاحقاً"
          className="-me-1 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {sheet}
    </>
  );
}
