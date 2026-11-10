"use client";

import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { getStripe } from "@/lib/stripe-client";

/**
 * Stripe's embedded checkout, in its own chunk (QA PA-M3): the payments page loads it, and Stripe.js, only once a
 * checkout has started.
 */
export default function StripeEmbeddedCheckout({ clientSecret }: { clientSecret: string }) {
  return (
    <EmbeddedCheckoutProvider stripe={getStripe()} options={{ clientSecret }}>
      <EmbeddedCheckout className="min-h-[400px]" />
    </EmbeddedCheckoutProvider>
  );
}
