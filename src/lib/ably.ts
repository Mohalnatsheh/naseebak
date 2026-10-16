/**
 * Ably carries chat events only; Postgres stores the messages.
 * Only the server publishes (after the message filter); browsers get subscribe-only
 * tokens for their own conversations from /api/chats/ably-token.
 * Without ABLY_API_KEY (local dev) everything here is a no-op and the chat page polls.
 */
import * as Ably from "ably";

let rest: Ably.Rest | null = null;

function client(): Ably.Rest | null {
  const key = process.env.ABLY_API_KEY;
  if (!key) return null;
  rest ??= new Ably.Rest({ key });
  return rest;
}

export function isAblyConfigured(): boolean {
  return !!process.env.ABLY_API_KEY;
}

export function chatChannelName(conversationId: string): string {
  return `chat:${conversationId}`;
}

export type ChatEventName = "message" | "read" | "status";

export async function publishChatEvent(conversationId: string, name: ChatEventName, data: unknown): Promise<void> {
  const ably = client();
  if (!ably) return;
  try {
    await ably.channels.get(chatChannelName(conversationId)).publish(name, data);
  } catch (error) {
    console.warn("[Ably] publish failed:", error);
  }
}

/** Short-lived, subscribe-only token for the given conversations */
export async function createChatTokenRequest(userId: string, conversationIds: string[]): Promise<Ably.TokenRequest | null> {
  const ably = client();
  if (!ably) return null;
  const capability: Record<string, string[]> = {};
  for (const id of conversationIds) capability[chatChannelName(id)] = ["subscribe"];
  // Ably needs at least one channel; a private no-op channel keeps the token valid
  if (conversationIds.length === 0) capability[`user:${userId}`] = ["subscribe"];
  return ably.auth.createTokenRequest({
    clientId: userId,
    capability: JSON.stringify(capability),
    ttl: 60 * 60 * 1000,
  });
}
