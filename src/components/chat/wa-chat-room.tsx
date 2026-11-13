"use client";

import { ClassicChatRoom } from "./classic-chat-room";
import type { ChatRoomModel } from "./use-chat-room";

/** The WhatsApp-style room (switch `chat_whatsapp_layout`). Stub until Task 8: today's view */
export function WaChatRoom({ model }: { model: ChatRoomModel }) {
  return <ClassicChatRoom model={model} />;
}
