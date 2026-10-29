import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { startOfAmmanDay } from "@/lib/amman-day";
import { findAnyPackage } from "@/lib/payments/packages";
import { changePct, conversionPct, fillDays, sumDays, type DayRow } from "@/lib/admin/revenue";

const DAY = 24 * 60 * 60 * 1000;
const num = (v: unknown) => Number(v ?? 0);

/**
 * Admin dashboard → Revenue (JOD, Amman days): today, yesterday, the day before, the last 14 days, 7 / 30 days with the
 * change from the period before, all time, today's packages, and the latest payments.
 */
export async function GET() {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;

    const now = new Date();
    const today0 = startOfAmmanDay(now);
    const since = new Date(today0.getTime() - 59 * DAY);

    const [dailyRaw, allTime, todayPackages, sameTimeYesterday, recent] = await Promise.all([
      db.$queryRaw<{ day: string; started: bigint; paid: bigint; revenue: unknown; payers: bigint; refunded: unknown }[]>`
        SELECT to_char(("createdAt" + interval '3 hours')::date, 'YYYY-MM-DD') AS day,
          count(*) AS started,
          count(*) FILTER (WHERE status = 'COMPLETED') AS paid,
          coalesce(sum(amount) FILTER (WHERE status = 'COMPLETED'), 0) AS revenue,
          count(DISTINCT "userId") FILTER (WHERE status = 'COMPLETED') AS payers,
          coalesce(sum(amount) FILTER (WHERE status = 'REFUNDED'), 0) AS refunded
        FROM payments WHERE "createdAt" >= ${since}
        GROUP BY 1`,
      db.$queryRaw<{ revenue: unknown; paid: bigint; payers: bigint; refunded: unknown }[]>`
        SELECT coalesce(sum(amount) FILTER (WHERE status = 'COMPLETED'), 0) AS revenue,
          count(*) FILTER (WHERE status = 'COMPLETED') AS paid,
          count(DISTINCT "userId") FILTER (WHERE status = 'COMPLETED') AS payers,
          coalesce(sum(amount) FILTER (WHERE status = 'REFUNDED'), 0) AS refunded
        FROM payments`,
      db.payment.groupBy({
        by: ["planName"],
        where: { status: "COMPLETED", createdAt: { gte: today0 } },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      db.payment.aggregate({
        where: { status: "COMPLETED", createdAt: { gte: new Date(today0.getTime() - DAY), lte: new Date(now.getTime() - DAY) } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      db.payment.findMany({
        where: { status: "COMPLETED" },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: { id: true, createdAt: true, amount: true, planName: true, user: { select: { id: true, firstName: true, gender: true } } },
      }),
    ]);

    const rows: DayRow[] = dailyRaw.map((r) => ({
      day: r.day, started: num(r.started), paid: num(r.paid), revenue: num(r.revenue), payers: num(r.payers), refunded: num(r.refunded),
    }));
    const sixty = fillDays(rows, now, 60);
    const last = (n: number, skip = 0) => sixty.slice(sixty.length - n - skip, sixty.length - skip);
    const [dayBefore, yesterday, today] = last(3);
    const d7 = sumDays(last(7)), p7 = sumDays(last(7, 7));
    const d30 = sumDays(last(30)), p30 = sumDays(last(30, 30));
    const label = (id: string | null) => {
      const p = findAnyPackage(id);
      return p ? `${p.credits} credits · ${p.priceJod} JOD` : id ?? "—";
    };

    return NextResponse.json({
      asOf: now,
      days: last(14),
      today: { ...today, conversion: conversionPct(today.paid, today.started) },
      yesterday: { ...yesterday, conversion: conversionPct(yesterday.paid, yesterday.started) },
      dayBefore: { ...dayBefore, conversion: conversionPct(dayBefore.paid, dayBefore.started) },
      // Today so far vs yesterday up to the same time of day
      pace: {
        todayRevenue: today.revenue,
        yesterdaySameTime: num(sameTimeYesterday._sum.amount),
        change: changePct(today.revenue, num(sameTimeYesterday._sum.amount)),
      },
      week: { ...d7, change: changePct(d7.revenue, p7.revenue), conversion: conversionPct(d7.paid, d7.started) },
      month: { ...d30, change: changePct(d30.revenue, p30.revenue), conversion: conversionPct(d30.paid, d30.started) },
      allTime: {
        revenue: num(allTime[0]?.revenue), paid: num(allTime[0]?.paid), payers: num(allTime[0]?.payers), refunded: num(allTime[0]?.refunded),
      },
      todayPackages: todayPackages
        .map((p) => ({ package: label(p.planName), count: p._count._all, revenue: num(p._sum.amount) }))
        .sort((a, b) => b.revenue - a.revenue),
      recent: recent.map((p) => ({
        id: p.id, at: p.createdAt, amount: num(p.amount), package: label(p.planName),
        member: p.user ? { id: p.user.id, firstName: p.user.firstName, gender: p.user.gender } : null,
      })),
    });
  } catch (error) {
    console.error("[admin revenue] failed:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
