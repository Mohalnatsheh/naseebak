import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

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
