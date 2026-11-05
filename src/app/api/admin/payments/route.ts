import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { safePagination } from "@/lib/admin/query";
import { getAdminCountry, paymentCountryWhere } from "@/lib/admin/country-filter";
import { paymentsListWhere } from "@/lib/admin/list-filters";
import { findAnyPackage } from "@/lib/payments/packages";
const DAY_MS = 24 * 60 * 60 * 1000;
const AMMAN_OFFSET_MS = 3 * 60 * 60 * 1000;

/** The first of this month at midnight in Amman (UTC+3 all year), as a UTC instant */
function startOfAmmanMonth(now: Date): Date {
  const local = new Date(now.getTime() + AMMAN_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - AMMAN_OFFSET_MS);
}

export async function GET(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;

    const url = new URL(request.url);
    const { page, pageSize, skip } = safePagination(url.searchParams, 20);
    // Admin's selected country (a deleted member's payment is placed by its currency)
    const country = await getAdminCountry(request);
    const byCountry = paymentCountryWhere(country);
    const now = new Date();
    const where = paymentsListWhere(url.searchParams, country, now);

    const startOfMonth = startOfAmmanMonth(now);

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
          status: true,
          disputedAt: true,
          failureReason: true,
          providerTxId: true,
          stripePaymentIntentId: true,
          createdAt: true,
          user: {
            select: { id: true, firstName: true, lastName: true, phone: true, country: true, matchCredits: true },
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
        where: { ...byCountry, status: "FAILED", createdAt: { gte: new Date(now.getTime() - 30 * DAY_MS) } },
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
      payments: payments.map(({ providerTxId, stripePaymentIntentId, ...p }) => ({
        ...p,
        /** What a refund takes back: the package's credits (also for packages no longer sold) */
        credits: findAnyPackage(p.planName)?.credits ?? 0,
        /** For the «View in Stripe» link: a checkout's providerTxId may be something else in old rows */
        stripePaymentIntent: stripePaymentIntentId ?? (providerTxId?.startsWith("pi_") ? providerTxId : null),
      })),
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
