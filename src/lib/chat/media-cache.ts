/**
 * A short in-process cache of chat media bytes, by message id. Players (Safari, the app's audio players) ask for one
 * voice note in several Range requests within seconds; without it each would download the whole file from Bunny
 * again. Small and short-lived: one PM2 process, so at most MEDIA_CACHE_MAX_BYTES of memory, each entry
 * MEDIA_CACHE_TTL_MS. Keyed by message id only: the storage path is never a key or a log line.
 */
export const MEDIA_CACHE_TTL_MS = 60_000;
export const MEDIA_CACHE_MAX_BYTES = 32 * 1024 * 1024;

const store = new Map<string, { buf: Buffer; at: number }>();
let total = 0;

function drop(key: string) {
  const hit = store.get(key);
  if (!hit) return;
  total -= hit.buf.length;
  store.delete(key);
}

export function clearMediaCache() {
  store.clear();
  total = 0;
}

/** The file of `key`, from the cache while fresh, else from `read` (a miss, null, is never cached) */
export async function readMediaCached(key: string, read: () => Promise<Buffer | null>, now: number = Date.now()): Promise<Buffer | null> {
  const hit = store.get(key);
  if (hit && now - hit.at < MEDIA_CACHE_TTL_MS) {
    // Most recently used goes last
    store.delete(key);
    store.set(key, hit);
    return hit.buf;
  }
  drop(key);
  const buf = await read();
  if (!buf || buf.length > MEDIA_CACHE_MAX_BYTES) return buf;
  for (const [k, v] of store) {
    if (total + buf.length <= MEDIA_CACHE_MAX_BYTES && now - v.at < MEDIA_CACHE_TTL_MS) break;
    drop(k);
  }
  store.set(key, { buf, at: now });
  total += buf.length;
  return buf;
}
