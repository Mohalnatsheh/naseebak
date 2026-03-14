import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { parsePagination } from "@/lib/utils";

export async function GET(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const { session } = result;

    const url = new URL(request.url);
    const { page, pageSize, skip } = parsePagination(url.searchParams, 20);
    const status = url.searchParams.get("status") || "";

    const where = status ? { status: status as "PENDING" | "COMPLETED" | "FAILED" | "REFUNDED" } : {};

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [payments, total, totalRevenue, monthlyRevenue] = await Promise.all([
      db.payment.findMany({
        where,
        skip,
        take: pageSize,
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
      totalPages: Math.ceil(total / pageSize),
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
