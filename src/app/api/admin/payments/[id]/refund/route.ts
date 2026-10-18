import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import { applyRefund } from "@/lib/payments/refund";

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
      select: { id: true, status: true, providerTxId: true, provider: true },
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

    // Credits back + notice; the charge.refunded webhook for the same refund is then a no-op
    const outcome = await applyRefund({ paymentId: payment.id, adminId: session.user.id, note: "Admin refund" });
    if (outcome !== "refunded") {
      return NextResponse.json({ error: "Payment was already refunded" }, { status: 409 });
    }

    return NextResponse.json({ message: "Refund processed successfully" });
  } catch (error) {
    console.error("Admin refund error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
