"use client";

import { useChatLayout } from "./chat-layout-context";
import { useChatList } from "./use-chat-list";
import { ClassicChatList } from "./classic-chat-list";
import { WaChatList } from "./wa-chat-list";

/**
 * The chats list. The data and its reload triggers live in `useChatList`; the layout (switch `chat_whatsapp_layout`)
 * picks the view. `compact`: the desktop side pane beside an open chat (≥1024 px).
 */
export function ChatList({ compact = false, activeId }: { compact?: boolean; activeId?: string | null } = {}) {
  const data = useChatList();
  const layout = useChatLayout();
  return layout === "wa" ? (
    <WaChatList compact={compact} activeId={activeId} data={data} />
  ) : (
    <ClassicChatList compact={compact} activeId={activeId} data={data} />
  );
}
