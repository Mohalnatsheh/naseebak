"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/chat/service";

export interface ChannelHandlers {
  /** `kind` / `media` are additive (absent from events published before media existed) */
  onMessage: (m: {
    id: string; senderId: string; body: string; createdAt: string; clientNonce?: string;
    kind?: ChatMessage["kind"]; media?: ChatMessage["media"];
  }) => void;
  onRead: (e: { by: string; at: string }) => void;
  onStatus: (e: { status: string; expiresAt?: string }) => void;
  /** Called every few seconds when real-time isn't available; resolves true when something new arrived */
  poll: () => Promise<boolean> | void;
}

/** Polling starts every 4 s, slows down by half each quiet poll up to 30 s, and is back at 4 s on activity */
export const POLL_MIN_MS = 4000;
export const POLL_MAX_MS = 30000;

export function nextPollDelay(current: number, gotSomething: boolean): number {
  return gotSomething ? POLL_MIN_MS : Math.min(POLL_MAX_MS, Math.round(current * 1.5));
}

/**
 * Live chat events through Ably (subscribe-only token from the server).
 * Falls back to polling when Ably isn't configured (`{ enabled: false }`) or the connection drops. Polling
 * pauses while the tab is hidden and backs off while the chat is quiet; `wake()` (a send, the tab coming
 * back) polls at the fast pace again.
 */
export function useChatChannel(
  conversationId: string,
  handlers: ChannelHandlers,
): { mode: "connecting" | "live" | "polling"; wake: () => void } {
  const [mode, setMode] = useState<"connecting" | "live" | "polling">("connecting");
  const ref = useRef(handlers);
  ref.current = handlers;
  const wakeRef = useRef<() => void>(() => {});

  useEffect(() => {
    let cancelled = false;
    let polling = false;
    let inFlight = false;
    // wake() while a poll is on its way: the next delay is the fast one, whatever that poll found
    let woken = false;
    let delay = POLL_MIN_MS;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let realtime: { close: () => void } | null = null;

    const hidden = () => typeof document !== "undefined" && document.visibilityState === "hidden";
    const clear = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    const schedule = () => {
      clear();
      // A poll on its way schedules the next one itself; a hidden tab doesn't poll at all
      if (cancelled || !polling || inFlight || hidden()) return;
      timer = setTimeout(tick, delay);
    };
    const tick = async () => {
      timer = null;
      inFlight = true;
      let got = false;
      try {
        got = (await ref.current.poll()) === true;
      } catch {
        got = false;
      }
      inFlight = false;
      delay = nextPollDelay(delay, got || woken);
      woken = false;
      schedule();
    };
    const startPolling = () => {
      if (cancelled || polling) return;
      polling = true;
      delay = POLL_MIN_MS;
      setMode("polling");
      schedule();
    };
    const stopPolling = () => {
      polling = false;
      clear();
    };
    wakeRef.current = () => {
      delay = POLL_MIN_MS;
      if (inFlight) woken = true;
      schedule();
    };
    const onVisibility = () => {
      // Back on the tab: the chat page fetches at once; polling resumes at the fast pace
      if (!hidden()) wakeRef.current();
      else clear();
    };
    document.addEventListener("visibilitychange", onVisibility);

    (async () => {
      try {
        const probe = await fetch("/api/chats/ably-token");
        const info: { enabled?: boolean; keyName?: string } | null = probe.ok ? await probe.json().catch(() => null) : null;
        if (!info || info.enabled === false || !info.keyName) return startPolling();
        const Ably = await import("ably");
        if (cancelled) return;
        const client = new Ably.Realtime({
          authCallback: (_params, cb) => {
            fetch("/api/chats/ably-token")
              .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
              .then((token) => cb(null, token))
              .catch((e) => cb(String(e), null));
          },
        });
        realtime = client;
        client.connection.on((change) => {
          if (change.current === "connected") {
            stopPolling();
            setMode("live");
            void ref.current.poll(); // catch up on anything missed while disconnected
          } else if (["disconnected", "suspended", "failed"].includes(change.current)) {
            startPolling();
          }
        });
        const channel = client.channels.get(`chat:${conversationId}`);
        await channel.subscribe((msg) => {
          if (msg.name === "message") ref.current.onMessage(msg.data);
          else if (msg.name === "read") ref.current.onRead(msg.data);
          else if (msg.name === "status") ref.current.onStatus(msg.data);
        });
      } catch {
        startPolling();
      }
    })();

    return () => {
      cancelled = true;
      stopPolling();
      document.removeEventListener("visibilitychange", onVisibility);
      wakeRef.current = () => {};
      realtime?.close();
    };
  }, [conversationId]);

  const wake = useCallback(() => wakeRef.current(), []);
  return { mode, wake };
}
