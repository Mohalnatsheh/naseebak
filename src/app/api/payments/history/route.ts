import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { parsePagination } from "@/lib/utils";

export async function GET(request: Request) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { session } = result;

    const { searchParams } = new URL(request.url);
    const { page, pageSize, skip } = parsePagination(searchParams, 10);

    // Auto-expire PENDING payments older than 30 minutes
    await db.payment.updateMany({
      where: {
        userId: session.user.id,
        status: "PENDING",
        createdAt: { lt: new Date(Date.now() - 30 * 60 * 1000) },
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
