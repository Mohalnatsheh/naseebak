/**
 * Browser helper: opening a page clears the bell for the notifications that lead to it
 * (POST /api/notifications/read-for-page), then tells the dashboard to refresh its counts.
 * Fire-and-forget: a failure only leaves the bell as it was.
 */
/** The same page marked again within this time (a remount while it loads) sends nothing */
const REPEAT_MS = 5000;
const lastMarked = new Map<string, number>();

export function markPageNotificationsRead(path: string, opts: { exact?: boolean } = {}): void {
  const key = `${opts.exact ? "=" : ""}${path}`;
  const now = Date.now();
  if (now - (lastMarked.get(key) ?? 0) < REPEAT_MS) return;
  lastMarked.set(key, now);
  fetch("/api/notifications/read-for-page", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, ...(opts.exact && { exact: true }) }),
  })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (d?.marked > 0) window.dispatchEvent(new Event("naseeb:notifications-read"));
    })
    .catch(() => {});
}
