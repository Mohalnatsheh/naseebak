"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { BellOff, BellRing, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDashboardData } from "@/contexts/dashboard-context";
import { forViewer } from "@/lib/gendered-copy";
import { PushSetupSheet, usePushState } from "@/components/shared/push-setup";

const HIDDEN_KEY = "naseeb:notification-bar-hidden";
/** «لاحقاً» lasts this long (was one browser session: in-app browsers and the installed iPhone app start
 *  new sessions all the time, so the bar came back on nearly every visit) */
const HIDDEN_FOR_MS = 3 * 24 * 60 * 60 * 1000;
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
    const at = Number(localStorage.getItem(HIDDEN_KEY));
    return (!!at && Date.now() - at < HIDDEN_FOR_MS) || sessionStorage.getItem(HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Notifications, until they are on for this device: a short bar on dashboard pages (not home or the chats
 * list, which have their own install/notifications card; not in a chat room, the guide or the setup) whose one button
 * opens the guided setup sheet (PushSetupSheet). The sheet no longer opens by itself on the home page
 * (it stacked on top of the home card): it opens only when the member asks. «لاحقاً» hides the bar for
 * 3 days.
 */
export function NotificationBar() {
  const gender = useDashboardData().profile?.gender;
  const pathname = usePathname();
  const { stage } = usePushState();
  const hidden = useSyncExternalStore(subscribeHidden, readHidden, () => true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_PUSH_SETUP_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_PUSH_SETUP_EVENT, onOpen);
  }, []);

  const sheet = <PushSetupSheet open={open} onOpenChange={setOpen} gender={gender} />;

  const barHidden =
    hidden ||
    !stage ||
    stage === "done" ||
    stage === "none" ||
    pathname === "/dashboard" ||
    // The chats list has its own card (InstallAppCard): one prompt per page
    pathname === "/dashboard/chats" ||
    /^\/dashboard\/chats\/[^/]+/.test(pathname) ||
    pathname.startsWith("/dashboard/install") ||
    pathname.startsWith("/dashboard/profile/setup");
  if (barHidden) return sheet;

  function hide() {
    try {
      localStorage.setItem(HIDDEN_KEY, String(Date.now()));
    } catch {
      // private mode: stays visible (nothing to remember it in)
    }
    window.dispatchEvent(new Event(HIDDEN_CHANGED_EVENT));
  }

  const blocked = stage === "blocked";
  const Icon = blocked ? BellOff : BellRing;
  // The profile didn't load (no gender yet): words that fit everyone, never a masculine command (QA WM-08)
  const known = gender === "MALE" || gender === "FEMALE";
  const text = blocked
    ? known
      ? forViewer(
          gender,
          "الإشعارات مغلقة على هذا الجهاز، فلن تعرف بالتوافق والرسائل فور حدوثها.",
          "الإشعارات مغلقة على هذا الجهاز، فلن تعرفي بالتوافق والرسائل فور حدوثها."
        )
      : "الإشعارات مغلقة على هذا الجهاز."
    : known
      ? forViewer(
          gender,
          "الإشعارات غير مفعّلة: لن تعرف بالاقتراحات والتوافق فور حدوثها.",
          "الإشعارات غير مفعّلة: لن تعرفي بالاقتراحات والتوافق فور حدوثها."
        )
      : "الإشعارات غير مفعّلة على هذا الجهاز.";

  return (
    <>
      <div
        role="region"
        aria-label="الإشعارات"
        // Wraps instead of squeezing: at 200% text the line keeps its width and the button and ✕ go under it (QA WM-05)
        className="mb-4 flex flex-wrap items-center gap-2.5 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2.5 text-xs sm:gap-3 sm:text-sm"
      >
        <Icon className="h-5 w-5 flex-shrink-0 text-accent-foreground" aria-hidden="true" />
        <p className="min-w-0 flex-1 basis-48 leading-relaxed text-foreground/90">{text}</p>
        <div className="ms-auto flex flex-shrink-0 items-center gap-1">
          <Button
            onClick={() => setOpen(true)}
            className="h-auto min-h-11 whitespace-normal focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            {known ? forViewer(gender, "فعّلها الآن", "فعّليها الآن") : "تفعيل الإشعارات"}
          </Button>
          <button
            type="button"
            onClick={hide}
            aria-label="لاحقاً"
            className="-me-1 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      {sheet}
    </>
  );
}
