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
      if (d?.marked > 0) notifyNotificationsRead(typeof d.unreadCount === "number" ? d.unreadCount : undefined);
    })
    .catch(() => {});
}

/**
 * Tells the dashboard (bell, badges) and the chat list that something was read. `unreadCount`: the bell count the
 * read call answered (PA-M6), so nobody fetches /api/notifications/unread-count for it.
 */
export function notifyNotificationsRead(unreadCount?: number): void {
  window.dispatchEvent(new CustomEvent("naseeb:notifications-read", { detail: { unreadCount } }));
}

/** My own message went out: the chat list beside the room shows it (QA WC2-07) */
export function notifyChatSent(): void {
  window.dispatchEvent(new Event("naseeb:chat-sent"));
}

/** A chat ended, was extended or changed state: the chat list beside the room reloads (the same signal as a send) */
export function notifyChatChanged(): void {
  window.dispatchEvent(new Event("naseeb:chat-sent"));
}
