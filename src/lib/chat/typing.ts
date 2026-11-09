/**
 * «يكتب الآن…»: who is typing in which chat, in memory only (one PM2 process, CLAUDE.md). Nothing is stored.
 * Clients signal at most every 3 s; the indicator shows for TYPING_SHOW_MS after the last signal.
 */
export const TYPING_SHOW_MS = 5000;
/** A live `typing` event is published at most this often per member and chat */
export const TYPING_PUBLISH_MS = 2000;

const lastTyping = new Map<string, number>();
const key = (conversationId: string, userId: string) => `${conversationId}:${userId}`;

function prune(now: number): void {
  // Insertion order is refresh order (entries are deleted before being set again): stop at the first fresh one
  for (const [k, at] of lastTyping) {
    if (now - at < TYPING_SHOW_MS) break;
    lastTyping.delete(k);
  }
}

/** Record a typing signal; true when a live event should go out (not one within the last TYPING_PUBLISH_MS) */
export function noteTyping(conversationId: string, userId: string, now = Date.now()): boolean {
  prune(now);
  const k = key(conversationId, userId);
  const before = lastTyping.get(k);
  if (before !== undefined && now - before < TYPING_PUBLISH_MS) return false;
  lastTyping.delete(k);
  lastTyping.set(k, now);
  return true;
}

export function isTyping(conversationId: string, userId: string, now = Date.now()): boolean {
  const at = lastTyping.get(key(conversationId, userId));
  return at !== undefined && now - at < TYPING_SHOW_MS;
}

/** A sent message ends the typing signal */
export function clearTyping(conversationId: string, userId: string): void {
  lastTyping.delete(key(conversationId, userId));
}
