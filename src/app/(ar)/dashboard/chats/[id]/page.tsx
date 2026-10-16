import { ChatRoom } from "@/components/chat/chat-room";

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ChatRoom conversationId={id} />;
}
