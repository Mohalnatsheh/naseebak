import type { Metadata } from "next";
import { ChatsShell } from "@/components/chat/chats-shell";
import { getChatWhatsappLayout } from "@/lib/settings";

export const metadata: Metadata = { title: "المحادثات" };

export default async function Layout({ children }: { children: React.ReactNode }) {
  const layout = (await getChatWhatsappLayout()) ? "wa" : "classic";
  return <ChatsShell layout={layout}>{children}</ChatsShell>;
}
