"use client";

import { useChatLayout } from "./chat-layout-context";
import { ClassicChatRoom } from "./classic-chat-room";
import { useChatRoom } from "./use-chat-room";
import { WaChatRoom } from "./wa-chat-room";

/** One chat: the engine (useChatRoom) and the view the switch `chat_whatsapp_layout` picks (today's when off) */
export function ChatRoom({ conversationId }: { conversationId: string }) {
  const model = useChatRoom(conversationId);
  return useChatLayout() === "wa" ? <WaChatRoom model={model} /> : <ClassicChatRoom model={model} />;
}
