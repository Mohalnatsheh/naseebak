/**
 * Proxy helpers for the session cookie (QA WA-01). Background requests (router prefetches and RSC payloads) answer
 * without the refreshed session cookie, so one still in flight at sign-out can't put the cookie back.
 */

/** A router prefetch or an RSC payload request (not a page load the member asked for) */
export function isBackgroundRequest(headers: Headers): boolean {
  return (
    headers.get("next-router-prefetch") !== null ||
    headers.get("purpose") === "prefetch" ||
    headers.get("sec-purpose")?.includes("prefetch") === true ||
    headers.get("rsc") !== null
  );
}

/** A Set-Cookie that sets (refreshes) the session token. Clearing it (empty value) is still allowed through */
const SESSION_COOKIE = /^(__Secure-)?authjs\.session-token(\.\d+)?=[^;]/;

/** The same response without a refreshed session token (clearing it and other cookies, e.g. the country, are kept) */
export function withoutSessionCookie(res: Response): Response {
  const cookies = res.headers.getSetCookie();
  if (!cookies.some((c) => SESSION_COOKIE.test(c))) return res;
  res.headers.delete("set-cookie");
  for (const cookie of cookies) if (!SESSION_COOKIE.test(cookie)) res.headers.append("set-cookie", cookie);
  return res;
}
