"use client";

import { useCallback, useSyncExternalStore } from "react";
import { usePushState } from "@/components/shared/push-setup";

const HIDDEN_KEY = "naseeb:chat-push-hidden";
const CHANGED = "naseeb:chat-push-hidden-changed";

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  return () => window.removeEventListener(CHANGED, onChange);
}
function readHidden(): string | null {
  try {
    return localStorage.getItem(HIDDEN_KEY);
  } catch {
    return null;
  }
}

/** What ✕ stores: which chip was hidden, «تفعيل» (off) or «طريقة الفتح» (blocked) */
export function pushChipHideValue(blocked: boolean): string {
  return blocked ? "blocked" : "off";
}

/** Hidden only for the chip that was showing: a member who later blocks notifications sees «طريقة الفتح» once.
 *  "1" was stored before 2026-11-10, when only «تفعيل» could be hidden that way */
export function pushChipDismissed(stored: string | null, blocked: boolean): boolean {
  if (!stored) return false;
  if (stored === "1") return !blocked;
  return stored === pushChipHideValue(blocked);
}

/**
 * The chat's push chip (the lowest of the one status bar's three priorities): shown while this device can't get
 * notifications yet; its button opens the guided setup (open in Safari/Chrome → add to Home Screen → allow).
 * ✕ hides that chip on this browser for good (the «طريقة الفتح» variant still shows once if notifications get blocked
 * later). Owner idea 2026-10-28: 62% of members in open chats had no push device.
 */
export function useChatPushChip() {
  const { stage } = usePushState();
  const blocked = stage === "blocked";
  // Unknown on the server: treated as dismissed, so nothing flashes in
  const stored = useSyncExternalStore(subscribe, readHidden, () => "server");
  const dismissed = stored === "server" || pushChipDismissed(stored, blocked);
  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(HIDDEN_KEY, pushChipHideValue(blocked));
    } catch {
      // private mode: nothing to remember it in
    }
    window.dispatchEvent(new Event(CHANGED));
  }, [blocked]);
  return {
    pushOff: !!stage && stage !== "done" && stage !== "none",
    blocked,
    dismissed,
    dismiss,
  };
}
