/**
 * Where to go after sign-in: the `callbackUrl` NextAuth adds when a signed-out member opens a
 * dashboard link (e.g. a push about a match). Same-site only — never an open redirect.
 * Accepts a path ("/dashboard/matches?match=1") or an absolute URL on `origin` (NextAuth sends the
 * full URL); anything else (other hosts, "//evil.com", "/\\evil.com", javascript:, auth pages,
 * API routes) falls back to `fallback`. Pure, safe for client components.
 */
export function safeCallbackPath(raw: string | null | undefined, origin: string, fallback = "/dashboard"): string {
  if (!raw) return fallback;
  const value = raw.trim();
  if (!value) return fallback;
  let path: string;
  if (value.startsWith("/")) {
    // Protocol-relative ("//host") and backslash tricks ("/\host") are other hosts
    if (value.startsWith("//") || value.startsWith("/\\")) return fallback;
    path = value;
  } else {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return fallback;
    }
    if (url.origin !== origin) return fallback;
    path = `${url.pathname}${url.search}${url.hash}`;
  }
  // Re-parse against our origin: the result must still be on it
  try {
    const resolved = new URL(path, origin);
    if (resolved.origin !== origin) return fallback;
    const p = resolved.pathname;
    if (p === "/login" || p === "/register" || p.startsWith("/api/") || p.startsWith("/admin")) return fallback;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return fallback;
  }
}
