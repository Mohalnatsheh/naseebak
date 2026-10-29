/**
 * Mock checkout (local development and automated tests only). When `PAYMENTS_MOCK=true` on a local machine, checkout
 * creates the usual PENDING Payment row with a `mock_…` session id instead of calling Stripe; the tester then completes
 * or cancels it through `POST /api/dev/mock-checkout/[paymentId]`, which credits through the real
 * `fulfilCheckoutSession` — so the once-only crediting is exactly the production path. Never on a real server.
 */
export const MOCK_SESSION_PREFIX = "mock_";

export function paymentsMockEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.PAYMENTS_MOCK !== "true") return false;
  if (env.NODE_ENV !== "production") return true;
  // A local production build (next start on this machine) — never naseebak.com
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(env.NEXT_PUBLIC_APP_URL ?? "");
}
