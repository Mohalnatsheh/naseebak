import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getStripe } from "@/lib/stripe";

// priceJod = display price in JOD, priceUsdCents = Stripe charge in USD cents
// JOD→USD ~1.41 rate: 3 JOD≈$4.23, 4 JOD≈$5.64, 7 JOD≈$9.87
const creditPackages: Record<string, { credits: number; priceJod: number; priceUsdCents: number; name: string }> = {
  credits_3: { credits: 3, priceJod: 3, priceUsdCents: 423, name: "3 أرصدة" },
  credits_5: { credits: 5, priceJod: 4, priceUsdCents: 564, name: "5 أرصدة" },
  credits_10: { credits: 10, priceJod: 7, priceUsdCents: 987, name: "10 أرصدة" },
};

export async function POST(request: Request) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { session } = result;

    const body = await request.json();
    const { packageId } = body;

    const pkg = creditPackages[packageId];
    if (!pkg) {
      return NextResponse.json({ error: "الباقة غير صالحة" }, { status: 400 });
    }

    // Create a PENDING payment record (amount stored in JOD for display)
    const payment = await db.payment.create({
      data: {
        userId: session.user.id,
        type: "MATCH_CREDITS",
        planName: packageId,
        amount: pkg.priceJod,
        provider: "STRIPE",
        status: "PENDING",
        description: `شراء ${pkg.credits} أرصدة في نصيبك`,
      },
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    // Create Stripe Checkout Session in embedded mode (no redirect)
    const checkoutSession = await getStripe().checkout.sessions.create({
      mode: "payment",
      ui_mode: "embedded",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: pkg.name,
            },
            unit_amount: pkg.priceUsdCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        paymentId: payment.id,
        userId: session.user.id,
        packageId,
        credits: String(pkg.credits),
      },
      return_url: `${appUrl}/dashboard/payments?session_id={CHECKOUT_SESSION_ID}`,
    });

    return NextResponse.json({ clientSecret: checkoutSession.client_secret });
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
