/** Shared by the sign-in `authorize` callbacks and the login pages (db-free, client-safe). */

/** `code` the login pages read from `signIn()`'s result: "rate_limited:<minutes>" */
export const RATE_LIMITED_CODE = "rate_limited";

/** Minutes to wait from a `signIn()` result code, or null when it isn't the rate limit */
export function rateLimitedMinutes(code: string | null | undefined): number | null {
  if (!code?.startsWith(`${RATE_LIMITED_CODE}:`)) return null;
  const minutes = Number(code.slice(RATE_LIMITED_CODE.length + 1));
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 1;
}
