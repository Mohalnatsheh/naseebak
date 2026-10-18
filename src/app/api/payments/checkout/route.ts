import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import { CHECKOUT_APP } from "@/lib/payments/fulfil";
import { CHECKOUT_TTL_MS, findPackage } from "@/lib/payments/packages";

/** Stripe's error fields worth logging (never the full request) */
function stripeErrorInfo(error: unknown) {
  const e = error as { type?: string; code?: string; statusCode?: number; message?: string; requestId?: string };
  return { type: e?.type, code: e?.code, statusCode: e?.statusCode, message: e?.message, requestId: e?.requestId };
}

export async function POST(request: Request) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { session } = result;

    const body = await request.json().catch(() => ({}));
    const pkg = findPackage(body?.packageId);
    if (!pkg) {
      return NextResponse.json({ error: "الباقة غير صالحة" }, { status: 400 });
    }

    // The row id goes into the Stripe metadata, but the row itself is written only once Stripe has
    // returned a session: a failed Stripe call never leaves a "pending" checkout behind
    const paymentId = randomUUID();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    let checkoutSession;
    try {
      // Embedded mode (no redirect); charged in USD, shown in JOD (lib/payments/packages)
      checkoutSession = await getStripe().checkout.sessions.create({
        mode: "payment",
        ui_mode: "embedded",
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: { name: pkg.name },
              unit_amount: pkg.priceUsdCents,
            },
            quantity: 1,
          },
        ],
        metadata: {
          app: CHECKOUT_APP,
          paymentId,
          userId: session.user.id,
          packageId: pkg.id,
          credits: String(pkg.credits),
        },
        return_url: `${appUrl}/dashboard/payments?session_id={CHECKOUT_SESSION_ID}`,
        expires_at: Math.floor((Date.now() + CHECKOUT_TTL_MS) / 1000),
      });
    } catch (error) {
      console.error("[payments] Stripe checkout session failed:", stripeErrorInfo(error), {
        userId: session.user.id,
        packageId: pkg.id,
      });
      return NextResponse.json({ error: "تعذّر بدء عملية الدفع الآن. حاول مرة أخرى بعد قليل." }, { status: 502 });
    }

    // Amount stored in JOD for display; the charge itself is pkg.priceUsdCents
    await db.payment.create({
      data: {
        id: paymentId,
        userId: session.user.id,
        type: "MATCH_CREDITS",
        planName: pkg.id,
        amount: pkg.priceJod,
        provider: "STRIPE",
        status: "PENDING",
        stripeSessionId: checkoutSession.id,
        description: `شراء ${pkg.credits} أرصدة في نصيبك`,
      },
    });

    return NextResponse.json({ clientSecret: checkoutSession.client_secret, paymentId });
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
