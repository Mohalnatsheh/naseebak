import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordCredit } from "@/lib/credits";
import { getStripe } from "@/lib/stripe";
import { notify } from "@/lib/notify";

/** Credits granted by each package (see /api/payments/checkout) — taken back on refund */
const CREDIT_PACKAGES: Record<string, number> = {
  credits_3: 3,
  credits_5: 5,
  credits_10: 10,
};

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const { session } = result;

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

    // Issue the Stripe refund first; the idempotency key makes a retry (e.g. after a DB failure
    // below) return the same refund instead of refunding twice
    try {
      await getStripe().refunds.create(
        { payment_intent: payment.providerTxId },
        { idempotencyKey: `refund-${payment.id}` }
      );
    } catch (err) {
      const code = (err as { code?: string })?.code;
      // Already refunded on Stripe (e.g. from the Stripe dashboard): still record it here
      if (code !== "charge_already_refunded") throw err;
    }

    const creditsToDeduct = payment.planName ? CREDIT_PACKAGES[payment.planName] || 0 : 0;

    const refunded = await db.$transaction(async (tx) => {
      // COMPLETED guard: a concurrent refund of the same payment only deducts once
      const claimed = await tx.payment.updateMany({
        where: { id: payment.id, status: "COMPLETED" },
        data: { status: "REFUNDED" },
      });
      if (claimed.count !== 1) return false;

      if (creditsToDeduct > 0) {
        const user = await tx.user.findUnique({ where: { id: payment.userId }, select: { matchCredits: true } });
        const before = user?.matchCredits || 0;
        const after = Math.max(0, before - creditsToDeduct); // floor at 0
        if (after !== before) {
          await tx.user.update({ where: { id: payment.userId }, data: { matchCredits: after } });
          await recordCredit(
            {
              userId: payment.userId,
              delta: after - before,
              reason: "REFUND",
              refId: payment.id,
              adminId: session.user.id,
            },
            tx
          );
        }
      }
      return true;
    });

    if (!refunded) {
      return NextResponse.json({ error: "Payment was already refunded" }, { status: 409 });
    }

    await notify({
      userId: payment.userId,
      type: "PAYMENT",
      title: "تم استرداد المبلغ",
      body: `تم استرداد مبلغ ${Number(payment.amount).toFixed(2)} دينار أردني إلى حسابك.`,
      url: "/dashboard/payments",
      metadata: { paymentId: payment.id },
    });

    return NextResponse.json({ message: "Refund processed successfully" });
  } catch (error) {
    console.error("Admin refund error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
