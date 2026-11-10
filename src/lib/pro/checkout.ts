import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import { getProEnabled } from "@/lib/settings";
import { toCountry } from "@/lib/countries";
import { getCountrySettings, purchasesAvailable } from "@/lib/countries/settings";
import { CHECKOUT_APP } from "@/lib/payments/fulfil";
import { MOCK_SESSION_PREFIX, paymentsMockEnabled } from "@/lib/payments/mock";
import { CHECKOUT_TTL_MS } from "@/lib/payments/packages";
import { PRO_PAGE_PATH, PRO_PLAN_IDS, PRO_PLAN_LABELS, proOffersFor, proPlanName, type ProPlanId } from "@/lib/pro/plans";
import { currentProSubscription } from "@/lib/pro/status";

export type ProErrorCode = "DISABLED" | "UNAVAILABLE" | "ALREADY_PRO" | "UNKNOWN_PLAN";

/** The one place for the Arabic text of each Pro checkout refusal */
export const PRO_ERROR_MESSAGES: Record<ProErrorCode, string> = {
  DISABLED: "الاشتراك في Pro غير متاح حالياً",
  UNAVAILABLE: "الشراء غير متاح في دولتك حالياً",
  ALREADY_PRO: "لديك اشتراك Pro فعّال بالفعل",
  UNKNOWN_PLAN: "الباقة غير صالحة",
};

/** The checkout route's own refusals, next to the Pro ones */
export const PRO_ROUTE_MESSAGES = {
  APP_PURCHASES_DISABLED: "الشراء غير متاح في التطبيق حالياً",
  CHECKOUT_FAILED: "تعذّر بدء عملية الدفع الآن. يمكنك المحاولة مرة أخرى بعد قليل.",
} as const;

export class ProError extends Error {
  constructor(public readonly code: ProErrorCode) {
    super(PRO_ERROR_MESSAGES[code]);
    this.name = "ProError";
  }
}

/** Stripe keeps a Checkout session open for 24 hours at most: older PENDING rows have no open session left */
const STRIPE_SESSION_MAX_MS = 24 * 60 * 60 * 1000;

/**
 * Best effort: expires the member's other open Pro checkouts, so two tabs (or the website and the app) can't both be
 * paid into two subscriptions. A session Stripe won't expire (already expired, or paid meanwhile) is left to its
 * webhook; a paid one that turns into a second subscription is cancelled there and left to an admin to refund (lib/pro/duplicate).
 */
async function expireOpenProCheckouts(userId: string): Promise<void> {
  let open: { id: string; stripeSessionId: string | null }[];
  try {
    open = await db.payment.findMany({
      where: {
        userId,
        status: "PENDING",
        planName: { in: PRO_PLAN_IDS.map(proPlanName) },
        stripeSessionId: { not: null },
        createdAt: { gte: new Date(Date.now() - STRIPE_SESSION_MAX_MS) },
      },
      select: { id: true, stripeSessionId: true },
    });
  } catch (e) {
    console.error("[pro] open checkouts lookup failed", e);
    return;
  }
  for (const p of open) {
    const sessionId = p.stripeSessionId!;
    try {
      if (!sessionId.startsWith(MOCK_SESSION_PREFIX)) await getStripe().checkout.sessions.expire(sessionId);
      await db.payment.updateMany({ where: { id: p.id, status: "PENDING" }, data: { status: "FAILED", failureReason: "CANCELLED" } });
    } catch (e) {
      console.warn("[pro] could not expire an older checkout", p.id, (e as { code?: string })?.code ?? e);
    }
  }
}

/**
 * Starts a Pro subscription checkout (Stripe-hosted page, mode «subscription»). The Payment row is written only after
 * Stripe returned a session, so a failed call leaves nothing pending. The row id travels in the metadata.
 * Local mock (`PAYMENTS_MOCK=true`): no Stripe call, a `mock_pro_<uuid>` session id and a return url with `mockPro`.
 * Granting happens only in the webhook handlers (lib/pro/stripe-events), never here.
 * The session lives CHECKOUT_TTL_MS (like packages), and the member's other open Pro checkouts are expired first.
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

  await expireOpenProCheckouts(userId);

  const paymentId = randomUUID();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const mock = paymentsMockEnabled();
  let sessionId: string;
  let url: string;
  if (mock) {
    sessionId = `${MOCK_SESSION_PREFIX}pro_${randomUUID()}`;
    url = `${PRO_PAGE_PATH}?mockPro=${paymentId}`;
  } else {
    // credits: what the offer said, so a plan changed in the checkout window never alters what was bought
    const metadata = { app: CHECKOUT_APP, kind: "pro", userId, plan, country, paymentId, credits: String(offer.credits) };
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
      expires_at: Math.floor((Date.now() + CHECKOUT_TTL_MS) / 1000),
      success_url: `${appUrl}${PRO_PAGE_PATH}?pro=success`,
      cancel_url: `${appUrl}${PRO_PAGE_PATH}?pro=cancel`,
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
