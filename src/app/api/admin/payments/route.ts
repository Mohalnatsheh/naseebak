import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get("page") || "1");
    const status = url.searchParams.get("status") || "";
    const limit = 20;
    const skip = (page - 1) * limit;

    const where = status ? { status: status as "PENDING" | "COMPLETED" | "FAILED" | "REFUNDED" } : {};

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [payments, total, totalRevenue, monthlyRevenue] = await Promise.all([
      db.payment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          planName: true,
          amount: true,
          currency: true,
          provider: true,
          status: true,
          createdAt: true,
          user: {
            select: { id: true, firstName: true, lastName: true, phone: true },
          },
        },
      }),
      db.payment.count({ where }),
      db.payment.aggregate({
        where: { status: "COMPLETED" },
        _sum: { amount: true },
        _count: true,
      }),
      db.payment.aggregate({
        where: { status: "COMPLETED", createdAt: { gte: startOfMonth } },
        _sum: { amount: true },
      }),
    ]);

    return NextResponse.json({
      payments,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      summary: {
        totalRevenue: totalRevenue._sum.amount || 0,
        completedCount: totalRevenue._count || 0,
        monthlyRevenue: monthlyRevenue._sum.amount || 0,
      },
    });
  } catch (error) {
    console.error("Admin payments error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
