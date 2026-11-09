import { loadStripe, type Stripe } from "@stripe/stripe-js";

/**
 * Stripe.js, loaded only when a checkout actually needs it (QA WA-18 / WEB-PAY-18): never at import, so a page
 * without the publishable key (local setup) still renders, and pages that never pay don't load Stripe at all.
 * Null when the key is missing: the caller says paying isn't available.
 */
const loaded = new Map<string, Promise<Stripe | null>>();

export function getStripe(locale?: "ar"): Promise<Stripe | null> | null {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!key) return null;
  const id = locale ?? "auto";
  let p = loaded.get(id);
  if (!p) {
    p = loadStripe(key, locale ? { locale } : undefined);
    loaded.set(id, p);
  }
  return p;
}
