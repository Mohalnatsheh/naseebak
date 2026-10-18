import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { fulfilCheckoutSession } from "@/lib/payments/fulfil";

export async function GET(request: Request) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("session_id");

    if (!sessionId) {
      return NextResponse.json({ error: "معرف الجلسة مطلوب" }, { status: 400 });
    }

    const checkoutSession = await getStripe().checkout.sessions.retrieve(sessionId);
    // Only the person who started this checkout may look at it
    if (checkoutSession.metadata?.userId !== result.session.user.id) {
      return NextResponse.json({ error: "الجلسة غير موجودة" }, { status: 404 });
    }

    // Paid: add the credits now rather than waiting for the webhook (once, whichever comes first),
    // so the "credits added" message the page shows is true
    if (checkoutSession.payment_status === "paid") await fulfilCheckoutSession(checkoutSession);

    return NextResponse.json({
      status: checkoutSession.status,
      paymentStatus: checkoutSession.payment_status,
    });
  } catch (error) {
    console.error("Session status error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
