/**
 * One `[admin-chat-view]` line per admin and media file per minute (ADM-28). A voice note plays through several Range
 * requests and a photo is fetched by the thumbnail and the full-size link, which logged the same view two or more
 * times. In memory on purpose: PM2 runs one process, and a lost entry only means one extra log line.
 */
const SEEN_MS = 60_000;
const MAX_KEYS = 5_000;
const seen = new Map<string, number>();

/** True when this admin's fetch of this message's media should be logged now. */
export function shouldLogMediaView(adminId: string, messageId: string, now = Date.now()): boolean {
  const key = `${adminId}:${messageId}`;
  const at = seen.get(key);
  if (at !== undefined && now - at < SEEN_MS) return false;
  if (seen.size >= MAX_KEYS) {
    for (const [k, t] of seen) if (now - t >= SEEN_MS) seen.delete(k);
    if (seen.size >= MAX_KEYS) seen.clear();
  }
  seen.set(key, now);
  return true;
}
