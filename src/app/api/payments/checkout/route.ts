import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getStripe } from "@/lib/stripe";

const creditPackages: Record<string, { credits: number; price: number; name: string }> = {
  credits_3: { credits: 3, price: 3, name: "3 رصيد توافق" },
  credits_5: { credits: 5, price: 4, name: "5 رصيد توافق" },
  credits_10: { credits: 10, price: 7, name: "10 رصيد توافق" },
};

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    // Only females can purchase credits
    if (session.user.gender !== "FEMALE") {
      return NextResponse.json(
        { error: "شراء الرصيد متاح للإناث فقط" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { packageId } = body;

    const pkg = creditPackages[packageId];
    if (!pkg) {
      return NextResponse.json({ error: "الباقة غير صالحة" }, { status: 400 });
    }

    // Create a PENDING payment record
    const payment = await db.payment.create({
      data: {
        userId: session.user.id,
        type: "MATCH_CREDITS",
        planName: packageId,
        amount: pkg.price,
        provider: "STRIPE",
        status: "PENDING",
        description: `شراء ${pkg.credits} رصيد توافق`,
      },
    });

    // JOD is a 3-decimal currency — amount in fils = price × 1000
    const amountInFils = pkg.price * 1000;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    // Create Stripe Checkout Session
    const checkoutSession = await getStripe().checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "jod",
            product_data: {
              name: pkg.name,
            },
            unit_amount: amountInFils,
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
      success_url: `${appUrl}/dashboard/payments?success=true`,
      cancel_url: `${appUrl}/dashboard/payments?cancelled=true`,
    });

    // Save Stripe session ID on the payment record
    await db.payment.update({
      where: { id: payment.id },
      data: { providerTxId: checkoutSession.id },
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
