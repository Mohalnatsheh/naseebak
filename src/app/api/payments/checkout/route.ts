import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { appPaymentsFor } from "@/lib/mobile-config";
import { db } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import { CHECKOUT_APP } from "@/lib/payments/fulfil";
import { CHECKOUT_TTL_MS, findPackage, packPurchaseDescription } from "@/lib/payments/packages";
import { checkoutPresentation, isPresentationError, productName } from "@/lib/payments/checkout-branding";
import { newPayToken, payPagePath, paymentIntentParams, usesArabicCheckout } from "@/lib/payments/intent";
import { MOCK_SESSION_PREFIX, paymentsMockEnabled } from "@/lib/payments/mock";
import { toCountry } from "@/lib/countries";
import { getCountrySettings, purchasesAvailable } from "@/lib/countries/settings";

/** Stripe's error fields worth logging (never the full request) */
function stripeErrorInfo(error: unknown) {
  const e = error as { type?: string; code?: string; statusCode?: number; message?: string; requestId?: string };
  return { type: e?.type, code: e?.code, statusCode: e?.statusCode, message: e?.message, requestId: e?.requestId };
}

/**
 * Starts a checkout for one of the member's country's packages.
 * - Web (default): Stripe embedded checkout → `{ clientSecret, paymentId }`.
 * - App (`mode: "hosted"`): a Stripe-hosted page → `{ checkoutUrl, paymentId }`; the app opens it and polls
 *   `GET /api/payments/[id]/status`. Credits are only ever added by `fulfilCheckoutSession` (webhook / status / daily).
 * - Local only (`PAYMENTS_MOCK=true`): no Stripe call; `{ mock: true, paymentId }`, completed through
 *   `/api/dev/mock-checkout/[paymentId]`.
 * Refused (403 PURCHASES_DISABLED) while the member's country isn't selling (src/lib/countries/settings.ts).
 */
export async function POST(request: Request) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { session } = result;

    const body = await request.json().catch(() => ({}));
    const hosted = body?.mode === "hosted";
    // Only the packages of the member's own country are on sale to them
    const me = await db.user.findUnique({ where: { id: session.user.id }, select: { country: true, phone: true } });
    const country = toCountry(me?.country);
    // The app's checkout follows the app-only payments switch (the website's embedded checkout doesn't)
    if (hosted && !(await appPaymentsFor(me?.phone))) {
      return NextResponse.json({ error: "الشراء غير متاح في التطبيق حالياً", code: "APP_PURCHASES_DISABLED" }, { status: 403 });
    }
    const countrySettings = await getCountrySettings(country);
    if (!purchasesAvailable(countrySettings)) {
      return NextResponse.json({ error: "الشراء غير متاح في دولتك حالياً", code: "PURCHASES_DISABLED" }, { status: 403 });
    }
    const pkg = findPackage(body?.packageId, country, countrySettings.packagePrices);
    if (!pkg) {
      return NextResponse.json({ error: "الباقة غير صالحة", code: "INVALID_PACKAGE" }, { status: 400 });
    }

    // The row id goes into the Stripe metadata, but the row itself is written only once Stripe has
    // returned a session: a failed Stripe call never leaves a "pending" checkout behind
    const paymentId = randomUUID();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const metadata = { app: CHECKOUT_APP, paymentId, userId: session.user.id, packageId: pkg.id, credits: String(pkg.credits) };

    let sessionId: string | null = null;
    let intentId: string | null = null;
    let payToken: string | null = null;
    let reply: Record<string, unknown> | null = null;
    // Arabic payment page (switch `arabic_checkout`, lib/payments/intent): a PaymentIntent paid on /pay/<id>.
    // If Stripe refuses it, the member gets the usual checkout below instead — never an error.
    if (!paymentsMockEnabled() && (await usesArabicCheckout(me?.phone))) {
      try {
        const intent = await getStripe().paymentIntents.create(paymentIntentParams(pkg, { paymentId, userId: session.user.id }));
        intentId = intent.id;
        payToken = newPayToken();
        const path = payPagePath(paymentId, payToken, hosted ? "app" : "web");
        reply = hosted ? { checkoutUrl: `${appUrl}${path}`, paymentId } : { payUrl: path, paymentId };
      } catch (error) {
        console.error("[payments] Arabic payment page: intent failed, using Stripe Checkout:", stripeErrorInfo(error), { userId: session.user.id });
        intentId = null;
        payToken = null;
      }
    }
    if (reply) {
      // created above
    } else if (paymentsMockEnabled()) {
      sessionId = `${MOCK_SESSION_PREFIX}${paymentId}`;
      reply = { mock: true, paymentId };
    } else {
      try {
        const lineItems = [{ price_data: { currency: pkg.chargeCurrency, product_data: { name: productName(pkg) }, unit_amount: pkg.chargeAmount }, quantity: 1 }];
        const expiresAt = Math.floor((Date.now() + CHECKOUT_TTL_MS) / 1000);
        // Jordan: charged in USD, shown in JOD · Saudi Arabia: SAR (lib/payments/packages)
        const base = hosted
          ? {
              mode: "payment" as const,
              line_items: lineItems,
              metadata,
              success_url: `${appUrl}/payments/return?status=success&session_id={CHECKOUT_SESSION_ID}`,
              cancel_url: `${appUrl}/payments/return?status=cancelled&payment_id=${paymentId}`,
              expires_at: expiresAt,
            }
          : {
              mode: "payment" as const,
              ui_mode: "embedded" as const,
              line_items: lineItems,
              metadata,
              return_url: `${appUrl}/dashboard/payments?session_id={CHECKOUT_SESSION_ID}`,
              expires_at: expiresAt,
            };
        // Naseebak's name, logo, an Arabic price line and the statement name (lib/payments/checkout-branding). If Stripe
        // ever refuses one of those extras, the plain session is created instead: a checkout must never fail for them.
        let checkoutSession: Awaited<ReturnType<ReturnType<typeof getStripe>["checkout"]["sessions"]["create"]>>;
        try {
          checkoutSession = await getStripe().checkout.sessions.create({ ...base, ...checkoutPresentation(pkg, hosted) });
        } catch (error) {
          if (!isPresentationError(error)) throw error;
          console.error("[payments] checkout branding refused, creating a plain session:", stripeErrorInfo(error));
          checkoutSession = await getStripe().checkout.sessions.create(base);
        }
        sessionId = checkoutSession.id;
        reply = hosted ? { checkoutUrl: checkoutSession.url, paymentId } : { clientSecret: checkoutSession.client_secret, paymentId };
      } catch (error) {
        console.error("[payments] Stripe checkout session failed:", stripeErrorInfo(error), {
          userId: session.user.id,
          packageId: pkg.id,
        });
        return NextResponse.json({ error: "تعذّر بدء عملية الدفع الآن. حاول مرة أخرى بعد قليل." }, { status: 502 });
      }
    }

    // Amount stored in the display currency (JOD / SAR); the charge itself is pkg.chargeAmount
    await db.payment.create({
      data: {
        id: paymentId,
        userId: session.user.id,
        type: "MATCH_CREDITS",
        planName: pkg.id,
        amount: pkg.price,
        currency: pkg.currency,
        provider: "STRIPE",
        status: "PENDING",
        stripeSessionId: sessionId,
        stripePaymentIntentId: intentId,
        payToken,
        description: `${sessionId?.startsWith(MOCK_SESSION_PREFIX) ? "[MOCK] " : ""}${packPurchaseDescription(pkg.credits)}`,
      },
    });

    return NextResponse.json(reply!);
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
