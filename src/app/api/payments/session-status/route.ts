import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("session_id");

    if (!sessionId) {
      return NextResponse.json({ error: "معرف الجلسة مطلوب" }, { status: 400 });
    }

    const checkoutSession = await getStripe().checkout.sessions.retrieve(sessionId);

    return NextResponse.json({
      status: checkoutSession.status,
      paymentStatus: checkoutSession.payment_status,
    });
  } catch (error) {
    console.error("Session status error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
