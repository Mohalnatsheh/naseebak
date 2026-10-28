"use client";

import { useSyncExternalStore } from "react";
import { BellOff, BellRing, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { forPartner, forViewer } from "@/lib/gendered-copy";
import { usePushState } from "@/components/shared/push-setup";
import { openPushSetup } from "@/components/shared/notification-bar";

const HIDDEN_KEY = "naseeb:chat-push-hidden";
const CHANGED = "naseeb:chat-push-hidden-changed";

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  return () => window.removeEventListener(CHANGED, onChange);
}
function readHidden(): boolean {
  try {
    return sessionStorage.getItem(HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * In an open chat, on a device that can't get notifications yet: one slim line under the header (never over the
 * messages or the composer) — «فعّل الإشعارات لتعرف فوراً عندما تردّ سارة» — whose button opens the guided setup
 * (open in Safari/Chrome → add to Home Screen → allow; PushSetupSheet). Goes away once notifications are on;
 * «لاحقاً» hides it for this browser session. Owner idea 2026-10-28: 62% of members in open chats had no push device.
 */
export function ChatPushBanner({ viewerGender, partnerName }: { viewerGender?: string; partnerName: string }) {
  const { stage } = usePushState();
  const hidden = useSyncExternalStore(subscribe, readHidden, () => true);
  if (hidden || !stage || stage === "done" || stage === "none") return null;

  const blocked = stage === "blocked";
  const Icon = blocked ? BellOff : BellRing;
  const text = blocked
    ? `الإشعارات مغلقة على هذا الجهاز، ${forViewer(viewerGender, "فقد تفوتك", "فقد تفوتكِ")} رسائل ${partnerName}.`
    : `${forViewer(viewerGender, "فعّل", "فعّلي")} الإشعارات ${forViewer(viewerGender, "لتعرف", "لتعرفي")} فوراً عندما ${forPartner(viewerGender, "يردّ", "تردّ")} ${partnerName}.`;

  function hide() {
    try {
      sessionStorage.setItem(HIDDEN_KEY, "1");
    } catch {
      // private mode: nothing to remember it in
    }
    window.dispatchEvent(new Event(CHANGED));
  }

  return (
    <div role="region" aria-label="الإشعارات" className="flex min-h-11 items-center gap-2 border-b border-border/40 bg-primary/5 px-3 py-1.5 text-sm">
      <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0 flex-1 leading-snug text-foreground/85">{text}</span>
      <Button size="xs" onClick={openPushSetup} className="shrink-0">
        {blocked ? "طريقة الفتح" : forViewer(viewerGender, "فعّلها", "فعّليها")}
      </Button>
      <button
        type="button"
        onClick={hide}
        aria-label="لاحقاً"
        className="-me-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
