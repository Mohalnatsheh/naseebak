import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { enumParam, safePagination } from "@/lib/admin/query";
import type { PaymentStatus } from "@prisma/client";

const PAYMENT_STATUSES: PaymentStatus[] = ["PENDING", "COMPLETED", "FAILED", "REFUNDED"];

export async function GET(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;

    const url = new URL(request.url);
    const { page, pageSize, skip } = safePagination(url.searchParams, 20);
    // Unknown status values are ignored (all payments) instead of a Prisma 500
    const status = enumParam(url.searchParams.get("status"), PAYMENT_STATUSES);

    const where = status ? { status } : {};

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
          disputedAt: true,
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
