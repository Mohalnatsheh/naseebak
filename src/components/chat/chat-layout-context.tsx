"use client";

import { createContext, useContext } from "react";

/** "classic" = today's chat; "wa" = the WhatsApp-style layout (switch `chat_whatsapp_layout`) */
export type ChatLayout = "classic" | "wa";

const ChatLayoutContext = createContext<ChatLayout>("classic");

export function ChatLayoutProvider({ layout, children }: { layout: ChatLayout; children: React.ReactNode }) {
  return <ChatLayoutContext.Provider value={layout}>{children}</ChatLayoutContext.Provider>;
}

/** The chat layout in force; "classic" outside a provider */
export function useChatLayout(): ChatLayout {
  return useContext(ChatLayoutContext);
}
