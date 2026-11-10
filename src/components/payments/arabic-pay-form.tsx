"use client";

import { useState } from "react";
import { getStripe } from "@/lib/stripe-client";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { Loader2, Lock } from "lucide-react";


const appearance = {
  theme: "stripe" as const,
  variables: {
    colorPrimary: "#22476a",
    colorText: "#1a2230",
    fontFamily: "Cairo, system-ui, sans-serif",
    borderRadius: "12px",
    spacingUnit: "4px",
  },
};

function PayButton({ priceLabel, returnUrl }: { priceLabel: string; returnUrl: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setError("");
    // Stripe sends the member to `returnUrl` (adding payment_intent and redirect_status); cards needing a bank check
    // (3-D Secure) open it first. Errors here are shown in Arabic by Stripe itself.
    const { error: failure } = await stripe.confirmPayment({ elements, confirmParams: { return_url: returnUrl } });
    if (failure) {
      setError(failure.message || "تعذّر إتمام الدفع. تأكّد من بيانات البطاقة وحاول مرة أخرى.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={pay} className="space-y-5">
      <PaymentElement options={{ layout: "tabs" }} />
      {error && (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={!stripe || busy}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-bold text-primary-foreground disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Lock className="h-4 w-4" aria-hidden />}
        {busy ? "جارٍ الدفع…" : `ادفع ${priceLabel}`}
      </button>
    </form>
  );
}

/** The card form of /pay/<id> (lib/payments/intent): Stripe Payment Element in Arabic, Naseebak colours */
export function ArabicPayForm({ clientSecret, priceLabel, returnUrl }: { clientSecret: string; priceLabel: string; returnUrl: string }) {
  // Stripe's own fields in Arabic, right to left (Payment Element supports `ar`; Stripe Checkout does not)
  const stripe = getStripe("ar");
  if (!stripe) {
    return <p role="alert" className="text-center text-sm text-destructive">الدفع غير متاح حالياً. حاول مرة أخرى لاحقاً.</p>;
  }
  return (
    <Elements
      stripe={stripe}
      options={{
        clientSecret,
        locale: "ar",
        appearance,
        fonts: [{ cssSrc: "https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" }],
      }}
    >
      <PayButton priceLabel={priceLabel} returnUrl={returnUrl} />
    </Elements>
  );
}
