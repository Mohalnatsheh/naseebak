"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TYPING_SHOW_MS } from "@/lib/chat/typing";
import { createThrottle } from "./chat-interactions";

/** The client signals typing at most this often (the server shows it for TYPING_SHOW_MS after the last signal) */
export const TYPING_SIGNAL_MS = 3000;

/**
 * «يكتب الآن…», my side: `notify()` on every keystroke sends `POST /api/chats/[id]/typing` at most every 3 s while the
 * chat is open for writing. `reset()` after sending a message (the server clears my typing then). Fire and forget:
 * a failed signal costs nothing.
 */
export function useTypingSignal(conversationId: string, enabled: boolean) {
  const enabledRef = useRef(enabled);
  useEffect(() => {
    enabledRef.current = enabled;
  });
  const throttled = useMemo(
    () =>
      createThrottle(() => {
        void fetch(`/api/chats/${conversationId}/typing`, { method: "POST" }).catch(() => {});
      }, TYPING_SIGNAL_MS),
    [conversationId]
  );
  const notify = useCallback(() => {
    if (enabledRef.current) throttled();
  }, [throttled]);
  return { notify, reset: throttled.reset };
}

/**
 * «يكتب الآن…», the other side: `mark()` on a live `typing` event or a poll's `partnerTyping`; it shows for
 * TYPING_SHOW_MS after the last signal, and `clear()` (their message arrived, a poll says no) hides it at once.
 */
export function usePartnerTyping() {
  const [typing, setTyping] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setTyping(false);
  }, []);
  const mark = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setTyping(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      setTyping(false);
    }, TYPING_SHOW_MS);
  }, []);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return { typing, mark, clear };
}
