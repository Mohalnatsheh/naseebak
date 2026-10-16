"use client";

import { useEffect, useRef, useState } from "react";

export interface ChannelHandlers {
  onMessage: (m: { id: string; senderId: string; body: string; createdAt: string }) => void;
  onRead: (e: { by: string; at: string }) => void;
  onStatus: (e: { status: string; expiresAt?: string }) => void;
  /** Called every few seconds when real-time isn't available */
  poll: () => void;
}

const POLL_MS = 4000;

/**
 * Live chat events through Ably (subscribe-only token from the server).
 * Falls back to polling when Ably isn't configured or the connection drops.
 */
export function useChatChannel(conversationId: string, handlers: ChannelHandlers): "connecting" | "live" | "polling" {
  const [mode, setMode] = useState<"connecting" | "live" | "polling">("connecting");
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    let realtime: { close: () => void } | null = null;

    const startPolling = () => {
      if (cancelled || timer) return;
      setMode("polling");
      timer = setInterval(() => ref.current.poll(), POLL_MS);
    };
    const stopPolling = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    (async () => {
      try {
        const probe = await fetch("/api/chats/ably-token");
        if (!probe.ok) return startPolling();
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
            ref.current.poll(); // catch up on anything missed while disconnected
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
      realtime?.close();
    };
  }, [conversationId]);

  return mode;
}
