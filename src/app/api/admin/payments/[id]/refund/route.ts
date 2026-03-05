import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import { sendPushNotification } from "@/lib/onesignal";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { id } = await params;

    const payment = await db.payment.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        providerTxId: true,
        provider: true,
        userId: true,
        amount: true,
        planName: true,
      },
    });

    if (!payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    if (payment.status !== "COMPLETED") {
      return NextResponse.json({ error: "Only completed payments can be refunded" }, { status: 400 });
    }

    if (payment.provider !== "STRIPE" || !payment.providerTxId) {
      return NextResponse.json({ error: "Refund only supported for Stripe payments with a transaction ID" }, { status: 400 });
    }

    // Issue Stripe refund via payment intent
    await getStripe().refunds.create({
      payment_intent: payment.providerTxId,
    });

    // Update payment status
    await db.payment.update({
      where: { id },
      data: { status: "REFUNDED" },
    });

    // Determine credits to deduct based on plan
    const creditPackages: Record<string, number> = {
      credits_3: 3,
      credits_5: 5,
      credits_10: 10,
    };
    const creditsToDeduct = payment.planName ? creditPackages[payment.planName] || 0 : 0;

    if (creditsToDeduct > 0) {
      // Deduct credits (floor at 0)
      const user = await db.user.findUnique({ where: { id: payment.userId }, select: { matchCredits: true } });
      const newCredits = Math.max(0, (user?.matchCredits || 0) - creditsToDeduct);
      await db.user.update({
        where: { id: payment.userId },
        data: { matchCredits: newCredits },
      });
    }

    // Notify user
    await db.notification.create({
      data: {
        userId: payment.userId,
        type: "PAYMENT",
        title: "تم استرداد المبلغ",
        body: `تم استرداد مبلغ ${Number(payment.amount).toFixed(2)} دينار أردني إلى حسابك.`,
      },
    });

    sendPushNotification({
      userId: payment.userId,
      title: "تم استرداد المبلغ",
      body: `تم استرداد مبلغ ${Number(payment.amount).toFixed(2)} دينار أردني إلى حسابك.`,
      url: "/dashboard/payments",
    });

    return NextResponse.json({ message: "Refund processed successfully" });
  } catch (error) {
    console.error("Admin refund error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
