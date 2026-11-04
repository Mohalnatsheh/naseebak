import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { ammanDay } from "@/lib/admin/revenue";
import { getAdminCountry } from "@/lib/admin/country-filter";
import { ACTIVITY_SOURCES, type ActivitySource } from "@/lib/activity-days";

const DAY = 24 * 60 * 60 * 1000;
const WINDOWS = { today: 1, yesterday: 1, week: 7, month: 30, all: 0 } as const;
type Window = keyof typeof WINDOWS;
type Counts = Record<ActivitySource, number> & { total: number };

const empty = (): Counts => ({ ...(Object.fromEntries(ACTIVITY_SOURCES.map((s) => [s, 0])) as Record<ActivitySource, number>), total: 0 });

/**
 * Admin dashboard → «Active by device» for the admin's selected country: distinct members per source (website on
 * Android / iPhone / computer, app on Android / iPhone) today, yesterday, the last 7 and 30 days, all time, and per day
 * for the last 14 days. `total` counts a member once even when they used several. `members`: everyone registered
 * (role USER, the country), how many were seen on at least one device, and the rest. Website data starts the day
 * recording went live; app history was filled from earlier app sign-ins.
 */
export async function GET(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;

    const country = await getAdminCountry(request);
    const inCountry = country === "ALL" ? Prisma.empty : Prisma.sql`AND u.country = ${country}`;
    const now = new Date();
    const today = ammanDay(now);
    const dayAt = (daysBack: number) => new Date(`${ammanDay(new Date(now.getTime() - daysBack * DAY))}T00:00:00Z`);
    const from: Record<Window, Date> = { today: dayAt(0), yesterday: dayAt(1), week: dayAt(6), month: dayAt(29), all: new Date("2000-01-01T00:00:00Z") };
    const to: Record<Window, Date> = { today: dayAt(0), yesterday: dayAt(1), week: dayAt(0), month: dayAt(0), all: dayAt(0) };

    const windows = await Promise.all(
      (Object.keys(WINDOWS) as Window[]).map(async (w) => {
        const rows = await db.$queryRaw<{ source: string | null; members: bigint }[]>`
          SELECT a.source, count(DISTINCT a."userId") AS members
          FROM activity_days a JOIN users u ON u.id = a."userId"
          WHERE a.day BETWEEN ${from[w]}::date AND ${to[w]}::date ${inCountry}
          GROUP BY ROLLUP (a.source)`;
        const counts = empty();
        for (const r of rows) {
          if (r.source === null) counts.total = Number(r.members);
          else if ((ACTIVITY_SOURCES as readonly string[]).includes(r.source)) counts[r.source as ActivitySource] = Number(r.members);
        }
        return [w, counts] as const;
      }),
    );

    const dailyRows = await db.$queryRaw<{ day: string; source: string | null; members: bigint }[]>`
      SELECT to_char(a.day, 'YYYY-MM-DD') AS day, a.source, count(DISTINCT a."userId") AS members
      FROM activity_days a JOIN users u ON u.id = a."userId"
      WHERE a.day >= ${dayAt(13)}::date ${inCountry}
      GROUP BY a.day, ROLLUP (a.source)`;
    const byDay = new Map<string, Counts>();
    for (let i = 13; i >= 0; i--) byDay.set(ammanDay(new Date(now.getTime() - i * DAY)), empty());
    for (const r of dailyRows) {
      const c = byDay.get(r.day);
      if (!c) continue;
      if (r.source === null) c.total = Number(r.members);
      else if ((ACTIVITY_SOURCES as readonly string[]).includes(r.source)) c[r.source as ActivitySource] = Number(r.members);
    }

    const [first, registered] = await Promise.all([
      db.activityDay.findFirst({ where: { source: { startsWith: "WEB_" } }, orderBy: { day: "asc" }, select: { day: true } }),
      db.user.count({ where: { role: "USER", ...(country === "ALL" ? {} : { country }) } }),
    ]);
    const seen = (Object.fromEntries(windows) as Record<Window, Counts>).all.total;
    return NextResponse.json({
      asOf: now.toISOString(),
      today,
      since: first ? first.day.toISOString().slice(0, 10) : null,
      members: { registered, seen, notSeen: Math.max(0, registered - seen) },
      ...Object.fromEntries(windows),
      days: [...byDay].map(([day, counts]) => ({ day, ...counts })),
    });
  } catch (error) {
    console.error("Admin activity by device error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
