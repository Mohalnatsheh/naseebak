import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import { getProEnabled } from "@/lib/settings";
import { toCountry } from "@/lib/countries";
import { getCountrySettings, purchasesAvailable } from "@/lib/countries/settings";
import { CHECKOUT_APP } from "@/lib/payments/fulfil";
import { MOCK_SESSION_PREFIX, paymentsMockEnabled } from "@/lib/payments/mock";
import { PRO_PLAN_LABELS, proOffersFor, proPlanName, type ProPlanId } from "@/lib/pro/plans";
import { currentProSubscription } from "@/lib/pro/status";

export type ProErrorCode = "DISABLED" | "UNAVAILABLE" | "ALREADY_PRO" | "UNKNOWN_PLAN";

/** The one place for the Arabic text of each Pro checkout refusal */
export const PRO_ERROR_MESSAGES: Record<ProErrorCode, string> = {
  DISABLED: "الاشتراك في Pro غير متاح حالياً",
  UNAVAILABLE: "الشراء غير متاح في دولتك حالياً",
  ALREADY_PRO: "أنت مشترك في Pro بالفعل",
  UNKNOWN_PLAN: "الباقة غير صالحة",
};

export class ProError extends Error {
  constructor(public readonly code: ProErrorCode) {
    super(PRO_ERROR_MESSAGES[code]);
    this.name = "ProError";
  }
}

/**
 * Starts a Pro subscription checkout (Stripe-hosted page, mode «subscription»). The Payment row is written only after
 * Stripe returned a session, so a failed call leaves nothing pending. The row id travels in the metadata.
 * Local mock (`PAYMENTS_MOCK=true`): no Stripe call, a `mock_pro_<uuid>` session id and a return url with `mockPro`.
 * Granting happens only in the webhook handlers (lib/pro/webhook), never here.
 */
export async function startProCheckout(userId: string, plan: ProPlanId): Promise<{ url: string; paymentId: string }> {
  if (!(await getProEnabled())) throw new ProError("DISABLED");
  const me = await db.user.findUnique({ where: { id: userId }, select: { country: true } });
  const country = toCountry(me?.country);
  const countrySettings = await getCountrySettings(country);
  if (!purchasesAvailable(countrySettings)) throw new ProError("UNAVAILABLE");
  if (await currentProSubscription(userId)) throw new ProError("ALREADY_PRO");
  const offer = proOffersFor(country, countrySettings.proPlans).find((o) => o.id === plan);
  if (!offer) throw new ProError("UNKNOWN_PLAN");

  const paymentId = randomUUID();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const mock = paymentsMockEnabled();
  let sessionId: string;
  let url: string;
  if (mock) {
    sessionId = `${MOCK_SESSION_PREFIX}pro_${randomUUID()}`;
    url = `/dashboard/payments?mockPro=${paymentId}`;
  } else {
    const metadata = { app: CHECKOUT_APP, kind: "pro", userId, plan, country, paymentId };
    const checkout = await getStripe().checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: offer.chargeCurrency,
            unit_amount: offer.chargeAmount,
            recurring: { interval: offer.interval },
            product_data: { name: `نصيبك Pro — ${PRO_PLAN_LABELS[plan]}` },
          },
        },
      ],
      metadata,
      subscription_data: { metadata },
      success_url: `${appUrl}/dashboard/payments?pro=success`,
      cancel_url: `${appUrl}/dashboard/payments?pro=cancel`,
    });
    if (!checkout.url) throw new Error("Stripe returned no checkout url");
    sessionId = checkout.id;
    url = checkout.url;
  }

  // Display price and currency (JOD / SAR); the charge itself is offer.chargeAmount
  await db.payment.create({
    data: {
      id: paymentId,
      userId,
      type: "SUBSCRIPTION",
      planName: proPlanName(plan),
      amount: offer.price,
      currency: offer.currency,
      provider: "STRIPE",
      status: "PENDING",
      stripeSessionId: sessionId,
      description: `${mock ? "[MOCK] " : ""}اشتراك نصيبك Pro (${PRO_PLAN_LABELS[plan]})`,
    },
  });
  return { url, paymentId };
}
