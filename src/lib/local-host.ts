/** The page is served from this machine (the local mock checkout's only home): never a dev panel on naseebak.com */
export function isLocalHostname(hostname: string): boolean {
  return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(hostname) || hostname.endsWith(".localhost");
}
