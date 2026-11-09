import { ChatRoom } from "@/components/chat/chat-room";

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Keyed by chat: switching chats in the desktop list starts the room afresh
  return <ChatRoom key={id} conversationId={id} />;
}
