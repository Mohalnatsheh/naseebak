// Admin dashboard → Revenue: per Amman day, from the payments table. A payment counts on the day its checkout was
// opened (a session lives 35 minutes, so that is the day it was paid). Revenue = COMPLETED; refunds are shown apart.
// Pure helpers here (tested); the route runs the queries.

export const AMMAN_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

/** «2026-10-29» for the Amman day of an instant */
export function ammanDay(at: Date): string {
  return new Date(at.getTime() + AMMAN_OFFSET_MS).toISOString().slice(0, 10);
}

export interface DayRow {
  day: string;
  /** Checkouts opened */
  started: number;
  /** Completed payments */
  paid: number;
  revenue: number;
  payers: number;
  refunded: number;
}

/** The last `days` Amman days, oldest first, with zero rows where nothing happened */
export function fillDays(rows: DayRow[], now: Date, days = 14): DayRow[] {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const out: DayRow[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = ammanDay(new Date(now.getTime() - i * DAY));
    out.push(byDay.get(day) ?? { day, started: 0, paid: 0, revenue: 0, payers: 0, refunded: 0 });
  }
  return out;
}

/** Change in percent (rounded), or null when there is nothing to compare with */
export function changePct(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
}

/** Share of opened checkouts that were paid, in percent (rounded), or null with no checkout */
export function conversionPct(paid: number, started: number): number | null {
  return started > 0 ? Math.round((paid / started) * 100) : null;
}

export function sumDays(days: DayRow[]) {
  return days.reduce(
    (a, d) => ({ revenue: a.revenue + d.revenue, paid: a.paid + d.paid, started: a.started + d.started, refunded: a.refunded + d.refunded }),
    { revenue: 0, paid: 0, started: 0, refunded: 0 },
  );
}
