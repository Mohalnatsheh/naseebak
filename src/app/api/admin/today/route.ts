import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { startOfAmmanDay } from "@/lib/amman-day";
import { LAST_EVENING_RUN_KEY, LAST_FREQUENT_RUN_KEY, LAST_RUN_KEY, type DailyRunSummary } from "@/lib/cron/daily";
import { adminTodo } from "@/lib/admin/todo";
import { activeMembers, ammanDate, DAY_MS, FIRST_TRACKED_DAY, pulseFor, trackedDays } from "@/lib/admin/pulse";
import { countryConfig } from "@/lib/countries";
import { getAdminCountry, type AdminCountry } from "@/lib/admin/country-filter";

const DAY = DAY_MS;

/**
 * «Usual by now»: the same numbers for the 7 days before today, each day only up to this time of day (Amman). Members
 * are busiest in the evening, so scaling «so far» by the share of the day gone would read every afternoon as a drop.
 */
async function usualByNow(country: AdminCountry, from: Date, to: Date, clock: string) {
  const firstDay = FIRST_TRACKED_DAY.toISOString().slice(0, 10);
  // Columns are UTC without a zone: state the instants as UTC whatever the session's time zone is
  const utc = (d: Date) => Prisma.sql`(${d.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
  const inWeek = (col: string) =>
    Prisma.sql`${Prisma.raw(col)} >= ${utc(from)} AND ${Prisma.raw(col)} < ${utc(to)} AND (${Prisma.raw(col)} + interval '3 hours')::time < ${clock}::time`;
  const userIn = country === "ALL" ? Prisma.empty : Prisma.sql`AND u.country = ${country}`;
  const payIn =
    country === "ALL"
      ? Prisma.empty
      : Prisma.sql`AND (u.country = ${country} OR (p."userId" IS NULL AND p.currency = ${countryConfig(country).currency.code}))`;
  const count = async (query: Prisma.Sql) => Number((await db.$queryRaw<{ n: bigint }[]>(query))[0]?.n ?? 0);
  const [signups, interestA, interestB, matches, paid, unpaid, active, revenue] = await Promise.all([
    count(Prisma.sql`SELECT count(*) n FROM users u WHERE u.role = 'USER' ${userIn} AND ${inWeek('u."createdAt"')}`),
    count(Prisma.sql`SELECT count(*) n FROM suggestions s JOIN users u ON u.id = s."femaleId" WHERE s."recipientDecision" = 'INTERESTED' ${userIn} AND ${inWeek('s."recipientDecidedAt"')}`),
    count(Prisma.sql`SELECT count(*) n FROM suggestions s JOIN users u ON u.id = s."femaleId" WHERE s."candidateDecision" = 'INTERESTED' ${userIn} AND ${inWeek('s."candidateDecidedAt"')}`),
    count(Prisma.sql`SELECT count(*) n FROM mutual_matches m JOIN users u ON u.id = m."femaleId" WHERE true ${userIn} AND ${inWeek('m."createdAt"')}`),
    count(Prisma.sql`SELECT count(*) n FROM payments p LEFT JOIN users u ON u.id = p."userId" WHERE p.status = 'COMPLETED' ${payIn} AND ${inWeek('p."createdAt"')}`),
    count(Prisma.sql`SELECT count(*) n FROM payments p LEFT JOIN users u ON u.id = p."userId" WHERE p.status IN ('FAILED', 'PENDING') ${payIn} AND ${inWeek('p."createdAt"')}`),
    // A member first seen that day before this time (each place has its own row: the earliest counts)
    count(Prisma.sql`SELECT count(*) n FROM (
      SELECT a."userId", a.day FROM activity_days a JOIN users u ON u.id = a."userId"
      WHERE u.role = 'USER' ${userIn} AND a.day >= ${firstDay}::date AND a."createdAt" >= ${utc(from)} AND a."createdAt" < ${utc(to)}
      GROUP BY 1, 2 HAVING (min(a."createdAt") + interval '3 hours')::time < ${clock}::time) x`),
    db.$queryRaw<{ currency: string; amount: Prisma.Decimal }[]>(
      Prisma.sql`SELECT p.currency, sum(p.amount) amount FROM payments p LEFT JOIN users u ON u.id = p."userId" WHERE p.status = 'COMPLETED' ${payIn} AND ${inWeek('p."createdAt"')} GROUP BY 1`
    ),
  ]);
  return {
    signups,
    active,
    interest: interestA + interestB,
    matches,
    paid,
    unpaid,
    revenue: revenue.map((r) => ({ currency: r.currency, amount: Number(r.amount) })),
    /** Full days of activity data in the 7 (`FIRST_TRACKED_DAY`): the active average divides by this, not 7 */
    activeDays: trackedDays(ammanDate(from), ammanDate(to)),
  };
}

async function lastRun(key: string): Promise<{ finishedAt: string; errors: number } | null> {
  const row = await db.systemSetting.findUnique({ where: { key } });
  if (!row?.value) return null;
  try {
    const run = JSON.parse(row.value) as DailyRunSummary;
    return { finishedAt: run.finishedAt, errors: run.totals?.errors ?? 0 };
  } catch {
    return null;
  }
}

/**
 * Admin home («Today»): what waits for an admin, today's numbers against yesterday and the 7-day daily average,
 * and whether the scheduled jobs ran. `?todo=1` returns only the to-do counts (sidebar badges, polled).
 * Amman days; `activity_days` is stored as the Amman date, so its window uses the same instants.
 */
export async function GET(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const country = await getAdminCountry(request);
    const todo = await adminTodo(country);
    if (new URL(request.url).searchParams.get("todo")) return NextResponse.json({ todo });

    const now = new Date();
    const today = startOfAmmanDay(now);
    const todayDate = ammanDate(today);
    const weekFrom = new Date(today.getTime() - 7 * DAY);
    const clock = new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(11, 19);
    const [todayPulse, yesterday, week, usual, activeToday, activeYesterday, activeWeek, morning, evening, frequent] = await Promise.all([
      pulseFor(country, { from: today, to: now }),
      pulseFor(country, { from: new Date(today.getTime() - DAY), to: today }),
      pulseFor(country, { from: weekFrom, to: today }),
      usualByNow(country, weekFrom, today, clock),
      activeMembers(country, todayDate, new Date(todayDate.getTime() + DAY)),
      activeMembers(country, new Date(todayDate.getTime() - DAY), todayDate),
      activeMembers(country, new Date(Math.max(todayDate.getTime() - 7 * DAY, FIRST_TRACKED_DAY.getTime())), todayDate),
      lastRun(LAST_RUN_KEY),
      lastRun(LAST_EVENING_RUN_KEY),
      lastRun(LAST_FREQUENT_RUN_KEY),
    ]);

    return NextResponse.json({
      todo,
      /** Amman time now, «15:42» */
      clock: clock.slice(0, 5),
      pulse: {
        today: { ...todayPulse, active: activeToday },
        yesterday: { ...yesterday, active: activeYesterday },
        /** Totals of the 7 days before today (the page divides by 7) */
        week: { ...week, active: activeWeek },
        /** Totals of the same 7 days, each only up to this time of day */
        usual,
      },
      jobs: { morning, evening, frequent },
      now: now.toISOString(),
    });
  } catch (error) {
    console.error("Admin today error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
