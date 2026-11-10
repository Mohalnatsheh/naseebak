"use client";

import { useSyncExternalStore } from "react";
import { useSelectedLayoutSegment } from "next/navigation";
import { ChatList } from "./chat-list";
import { LineArt } from "@/components/shared/line-art";

/** Two panes from this width up (list + chat); below it, one pane as before */
export const TWO_PANE_QUERY = "(min-width: 1024px)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(TWO_PANE_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** True on a wide screen; false on the server and on phones (the one-pane layout renders first) */
export function useTwoPanes(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(TWO_PANE_QUERY).matches,
    () => false
  );
}

/**
 * The chats section (/dashboard/chats and /dashboard/chats/<id>). On a wide screen the list sits beside the open chat,
 * WhatsApp-style; with no chat open, the other pane asks to pick one. Phones and tablets keep one pane, and the
 * routes stay as they are. Only one list is ever mounted, so it polls once.
 */
export function ChatsShell({ children }: { children: React.ReactNode }) {
  const twoPanes = useTwoPanes();
  const openId = useSelectedLayoutSegment();
  // `children` keeps one place in the tree on both layouts (`contents` boxes on phones), so the open chat isn't
  // remounted when the wide layout takes over after hydration
  return (
    <div className={twoPanes ? "flex h-[calc(100dvh-4rem)] gap-4" : "contents"}>
      {twoPanes && (
        <aside className="w-72 shrink-0 xl:w-80" aria-label="قائمة المحادثات">
          <ChatList compact activeId={openId} />
        </aside>
      )}
      <div className={twoPanes ? "flex min-w-0 flex-1" : "contents"}>
        {twoPanes && !openId ? (
          // The majlis (S3) waiting for a chat, with the cups-on-a-tray drawing (S5)
          <div className="majlis flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-border/60 text-center">
            <LineArt kind="cupsTray" />
            <p className="font-semibold text-foreground">يمكنك اختيار محادثة لعرضها</p>
            <p className="max-w-xs text-sm text-muted-foreground">رسائلك خاصة، والمحادثة نصية ومحدودة المدة.</p>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
