"use client";

import { useCallback, useSyncExternalStore } from "react";
import { usePushState } from "@/components/shared/push-setup";

const HIDDEN_KEY = "naseeb:chat-push-hidden";
const CHANGED = "naseeb:chat-push-hidden-changed";

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  return () => window.removeEventListener(CHANGED, onChange);
}
function readHidden(): boolean {
  try {
    return localStorage.getItem(HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * The chat's push chip (the lowest of the one status bar's three priorities): shown while this device can't get
 * notifications yet; its button opens the guided setup (open in Safari/Chrome → add to Home Screen → allow).
 * ✕ hides it on this browser for good. Owner idea 2026-10-28: 62% of members in open chats had no push device.
 */
export function useChatPushChip() {
  const { stage } = usePushState();
  // Unknown on the server: treated as dismissed, so nothing flashes in
  const dismissed = useSyncExternalStore(subscribe, readHidden, () => true);
  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(HIDDEN_KEY, "1");
    } catch {
      // private mode: nothing to remember it in
    }
    window.dispatchEvent(new Event(CHANGED));
  }, []);
  return {
    pushOff: !!stage && stage !== "done" && stage !== "none",
    blocked: stage === "blocked",
    dismissed,
    dismiss,
  };
}
