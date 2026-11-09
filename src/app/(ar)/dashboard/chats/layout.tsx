import type { Metadata } from "next";
import { ChatsShell } from "@/components/chat/chats-shell";

export const metadata: Metadata = { title: "المحادثات" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <ChatsShell>{children}</ChatsShell>;
}
