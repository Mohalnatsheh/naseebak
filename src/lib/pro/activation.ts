/** Waiting for Pro after the Stripe return (db-free: the Pro page imports it) */

/** How long a return from Stripe waits for the webhook to turn Pro on */
export const PRO_ACTIVATION_WAIT_MS = 10_000;
/** Pause between two looks at /api/pro */
export const PRO_ACTIVATION_POLL_MS = 1_500;

export type ProActivationResult = "active" | "timeout" | "left";

/**
 * Polls `load` until it reports Pro, the wait runs out, or the member left the page (`isMounted` false: stop at once,
 * nothing more is loaded or shown). A failed load (`null`) is just another try.
 */
export async function waitForProActivation({
  load,
  isMounted,
  now = Date.now,
  sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
  waitMs = PRO_ACTIVATION_WAIT_MS,
  pollMs = PRO_ACTIVATION_POLL_MS,
}: {
  load: () => Promise<{ isPro: boolean } | null>;
  isMounted: () => boolean;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  waitMs?: number;
  pollMs?: number;
}): Promise<ProActivationResult> {
  const until = now() + waitMs;
  while (now() < until) {
    if (!isMounted()) return "left";
    const pro = await load();
    if (!isMounted()) return "left";
    if (pro?.isPro) return "active";
    await sleep(pollMs);
  }
  return isMounted() ? "timeout" : "left";
}
