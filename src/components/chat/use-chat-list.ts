"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatSummary } from "@/lib/chat/service";
import { useDashboardData } from "@/contexts/dashboard-context";
import { markPageNotificationsRead } from "@/lib/notifications-client";
import { sharedGet } from "@/lib/shared-get";

/**
 * The chats list's data: the first load, the reload triggers (badges, bell, read, my send, back on the tab) and the
 * retry. Shared by the classic and the WhatsApp-style list.
 */
export type ChatListData = { chats: ChatSummary[] | null; loadFailed: boolean; reload: () => void };

export function useChatList(): ChatListData {
  // Opening this page clears the bell for the notifications that lead here
  useEffect(() => {
    markPageNotificationsRead("/dashboard/chats", { exact: true });
  }, []);

  const [chats, setChats] = useState<ChatSummary[] | null>(null);
  // Only the first load can fail visibly; a failed refresh keeps the list already on screen
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const loaded = useRef(false);
  const { counts } = useDashboardData();
  // No poll of its own (QA WC2-07, PA-M6): the list reloads when the dashboard's badges or bell change (they poll every
  // 30 s, only while the tab is visible), when something was read, after my own send, and back on the tab. A hidden
  // tab never polls, and with Ably live nothing extra runs. Loads go through sharedGet, so overlapping triggers share
  // one request.
  const { unreadCount } = useDashboardData();
  const reloadRef = useRef<() => void>(() => {});
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () =>
      sharedGet("/api/chats")
        .then((r) => {
          if (!r.ok) throw new Error(`chats ${r.status}`);
          return r.json();
        })
        .then((d) => {
          if (!alive) return;
          loaded.current = true;
          setChats(d.conversations ?? []);
          setLoadFailed(false);
        })
        .catch(() => {
          if (alive && !loaded.current) setLoadFailed(true);
        });
    // A burst of triggers (a read, then the badges it changed) is one reload
    const soon = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        void load();
      }, 300);
    };
    reloadRef.current = soon;
    const onVisible = () => {
      if (document.visibilityState === "visible") soon();
    };
    load();
    window.addEventListener("naseeb:notifications-read", soon);
    window.addEventListener("naseeb:chat-sent", soon);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      reloadRef.current = () => {};
      window.removeEventListener("naseeb:notifications-read", soon);
      window.removeEventListener("naseeb:chat-sent", soon);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reloadKey]);

  // A new message elsewhere moves the unread badge or the bell: reload then (skipping the first render)
  const seen = useRef<string | null>(null);
  useEffect(() => {
    const key = `${counts.unreadChats}:${unreadCount}`;
    if (seen.current !== null && seen.current !== key) reloadRef.current();
    seen.current = key;
  }, [counts.unreadChats, unreadCount]);

  const reload = () => {
    setLoadFailed(false);
    setReloadKey((k) => k + 1);
  };
  return { chats, loadFailed, reload };
}
