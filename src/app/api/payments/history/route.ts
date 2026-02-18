import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    // Auto-expire PENDING payments older than 30 minutes
    await db.payment.updateMany({
      where: {
        userId: session.user.id,
        status: "PENDING",
        createdAt: { lt: new Date(Date.now() - 30 * 60 * 1000) },
      },
      data: { status: "FAILED" },
    });

    const [payments, user] = await Promise.all([
      db.payment.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" },
      }),
      db.user.findUnique({
        where: { id: session.user.id },
        select: { matchCredits: true },
      }),
    ]);

    return NextResponse.json({
      payments,
      matchCredits: user?.matchCredits ?? 0,
    });
  } catch (error) {
    console.error("Payment history error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
