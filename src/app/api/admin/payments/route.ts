import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { enumParam, safePagination } from "@/lib/admin/query";
import { getAdminCountry, paymentCountryWhere } from "@/lib/admin/country-filter";
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

    // Admin's selected country (a deleted member's payment is placed by its currency)
    const byCountry = paymentCountryWhere(await getAdminCountry(request));
    const where = { ...byCountry, ...(status ? { status } : {}) };

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [payments, total, totals, monthly, failedRaw] = await Promise.all([
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
          failureReason: true,
          createdAt: true,
          user: {
            select: { id: true, firstName: true, lastName: true, phone: true, country: true },
          },
        },
      }),
      db.payment.count({ where }),
      // Amounts are only ever added up within one currency (JOD, SAR…)
      db.payment.groupBy({
        by: ["currency"],
        where: { ...byCountry, status: "COMPLETED" },
        _sum: { amount: true },
        _count: true,
      }),
      db.payment.groupBy({
        by: ["currency"],
        where: { ...byCountry, status: "COMPLETED", createdAt: { gte: startOfMonth } },
        _sum: { amount: true },
      }),
      // Why checkouts failed in the last 30 days (owner request 2026-11-04)
      db.payment.groupBy({
        by: ["failureReason"],
        where: { ...byCountry, status: "FAILED", createdAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) } },
        _count: true,
      }),
    ]);
    const failed30d = failedRaw
      .map((f) => ({ reason: f.failureReason ?? "UNKNOWN", count: f._count }))
      .sort((a, b) => b.count - a.count);

    const revenue = totals
      .map((t) => ({
        currency: t.currency,
        total: Number(t._sum.amount ?? 0),
        monthly: Number(monthly.find((m) => m.currency === t.currency)?._sum.amount ?? 0),
        count: t._count,
      }))
      .sort((a, b) => a.currency.localeCompare(b.currency));

    return NextResponse.json({
      payments,
      total,
      page,
      totalPages: Math.ceil(total / pageSize),
      summary: {
        /** One entry per currency (a single one when one country is selected) */
        revenue,
        completedCount: revenue.reduce((n, r) => n + r.count, 0),
        /** FAILED in the last 30 days by reason (DECLINED:<Stripe code> kept apart per code; UNKNOWN = not filled in) */
        failed30d,
      },
    });
  } catch (error) {
    console.error("Admin payments error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
