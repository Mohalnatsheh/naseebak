import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    const body = await request.json();
    const { paymentId } = body;

    if (paymentId) {
      // Cancel a specific payment
      await db.payment.updateMany({
        where: {
          id: paymentId,
          userId: session.user.id,
          status: "PENDING",
        },
        data: { status: "FAILED" },
      });
    } else {
      // Cancel all stale PENDING payments for this user (older than 30 minutes)
      await db.payment.updateMany({
        where: {
          userId: session.user.id,
          status: "PENDING",
          createdAt: { lt: new Date(Date.now() - 30 * 60 * 1000) },
        },
        data: { status: "FAILED" },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Cancel payment error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
