import type { JWT } from "next-auth/jwt";
import { db } from "@/lib/db";
import { authConfig } from "@/lib/auth.config";

/**
 * Website session revocation (QA WA-01, 2026-11-10). Web sessions are JWT cookies that every request re-issues
 * (rolling expiry), so a request that left before a sign-out could hand the browser a fresh cookie after it.
 * Sign-out stamps `User.sessionsRevokedAt`; the `jwt` callback refuses any token whose sign-in (`authAt`, set once at
 * sign-in and kept through every refresh) is not later than that stamp, which also clears the cookie.
 *
 * The app's Bearer tokens (MobileSession, src/lib/mobile-auth.ts) never pass through here.
 *
 * The stamp is cached per process for a short while (PM2 runs one process; the proxy and the routes share it through
 * globalThis), and sign-out writes the cache at once, so a revoked token is refused on the very next request.
 */

const CACHE_MS = 30_000;

type CacheEntry = { stamp: number | null; at: number };
const globalCache = globalThis as unknown as { __naseebRevocations?: Map<string, CacheEntry> };
function cache(): Map<string, CacheEntry> {
  if (!globalCache.__naseebRevocations) globalCache.__naseebRevocations = new Map();
  return globalCache.__naseebRevocations;
}

async function revokedStamp(userId: string, now: number): Promise<number | null> {
  const hit = cache().get(userId);
  if (hit && now - hit.at < CACHE_MS) return hit.stamp;
  const user = await db.user.findUnique({ where: { id: userId }, select: { sessionsRevokedAt: true } });
  const stamp = user?.sessionsRevokedAt ? user.sessionsRevokedAt.getTime() : null;
  if (cache().size > 5000) cache().clear();
  cache().set(userId, { stamp, at: now });
  return stamp;
}

/** Whether a session token is still good: false once the member signed out after this token's sign-in */
export async function sessionStillValid(token: Pick<JWT, "id" | "authAt">, now = Date.now()): Promise<boolean> {
  const userId = typeof token.id === "string" ? token.id : null;
  if (!userId) return true;
  let stamp: number | null;
  try {
    stamp = await revokedStamp(userId, now);
  } catch (error) {
    // A database blip must not sign everyone out: the account guards (requireUser) still read the user fresh
    console.error("[session-revocation] lookup failed:", error);
    return true;
  }
  if (stamp === null) return true;
  // Tokens from before this field existed carry no sign-in time: a sign-out revokes them too
  const authAt = typeof token.authAt === "number" ? token.authAt : 0;
  return authAt > stamp;
}

/** Sign-out: every web session signed in until now is refused from the next request on */
export async function revokeWebSessions(userId: string, now = new Date()): Promise<void> {
  await db.user.update({ where: { id: userId }, data: { sessionsRevokedAt: now } });
  cache().set(userId, { stamp: now.getTime(), at: Date.now() });
}

/** Tests only */
export function clearRevocationCache() {
  cache().clear();
}

type JwtParams = Parameters<typeof authConfig.callbacks.jwt>[0];

/** The `jwt` callback with revocation: a revoked session answers null, which clears its cookie */
export async function jwtWithRevocation(params: JwtParams): Promise<JWT | null> {
  const token = authConfig.callbacks.jwt(params);
  if (params.user) return token;
  return (await sessionStillValid(token)) ? token : null;
}

/** NextAuth callbacks for every server-side instance (routes, pages and the proxy) */
export const serverAuthCallbacks = { ...authConfig.callbacks, jwt: jwtWithRevocation };
