import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { parsePagination } from "@/lib/utils";
import { CHECKOUT_TTL_MS } from "@/lib/payments/packages";

export async function GET(request: Request) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { session } = result;

    const { searchParams } = new URL(request.url);
    const { page, pageSize, skip } = parsePagination(searchParams, 10);

    // A pending row whose Stripe session has expired (CHECKOUT_TTL_MS) is over. Older sessions
    // (before the expiry was set) stay payable for 24h; fulfil still credits a late payment.
    await db.payment.updateMany({
      where: {
        userId: session.user.id,
        status: "PENDING",
        createdAt: { lt: new Date(Date.now() - CHECKOUT_TTL_MS) },
      },
      data: { status: "FAILED" },
    });

    const where = { userId: session.user.id };

    const [payments, total, user] = await Promise.all([
      db.payment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      db.payment.count({ where }),
      db.user.findUnique({
        where: { id: session.user.id },
        select: { matchCredits: true },
      }),
    ]);

    return NextResponse.json({
      payments,
      matchCredits: user?.matchCredits ?? 0,
      page,
      totalPages: Math.ceil(total / pageSize),
      total,
    });
  } catch (error) {
    console.error("Payment history error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
