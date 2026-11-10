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

/** ✕ hides the chip for one day, then it asks again (owner, 2026-11-11: daily) */
export const PUSH_CHIP_HIDE_MS = 24 * 60 * 60 * 1000;

/** What ✕ stores: which chip was hidden, «تفعيل» (off) or «طريقة الفتح» (blocked), and when */
export function pushChipHideValue(blocked: boolean, now: number = Date.now()): string {
  return `${blocked ? "blocked" : "off"}:${now}`;
}

/** Hidden only for the chip that was showing (a member who later blocks notifications sees «طريقة الفتح»), and only
 *  for a day. Values stored before 2026-11-11 had no time ("1", "off", "blocked"): they no longer hide anything */
export function pushChipDismissed(stored: string | null, blocked: boolean, now: number = Date.now()): boolean {
  if (!stored) return false;
  const [kind, at] = stored.split(":");
  const time = Number(at);
  if (!at || !Number.isFinite(time)) return false;
  return kind === (blocked ? "blocked" : "off") && now - time < PUSH_CHIP_HIDE_MS;
}

/**
 * The chat's push chip (the lowest of the one status bar's three priorities): shown while this device can't get
 * notifications yet; its button opens the guided setup (open in Safari/Chrome → add to Home Screen → allow).
 * ✕ hides that chip on this browser for a day (the «طريقة الفتح» variant still shows if notifications get blocked
 * meanwhile). Owner idea 2026-10-28: 62% of members in open chats had no push device.
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
