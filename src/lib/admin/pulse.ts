import { db } from "@/lib/db";
import {
  byUserCountry,
  matchCountryWhere,
  paymentCountryWhere,
  userCountryWhere,
  type AdminCountry,
} from "@/lib/admin/country-filter";

export const DAY_MS = 24 * 60 * 60 * 1000;

export type Window = { from: Date; to: Date };

/** The Amman date of an Amman midnight instant, as `activity_days.day` stores it (UTC midnight of that date) */
export function ammanDate(ammanMidnight: Date): Date {
  const local = new Date(ammanMidnight.getTime() + 3 * 60 * 60 * 1000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}

/**
 * First full day of `activity_days` for everyone: the app was counted earlier (a member or two a day) and the website
 * from the afternoon of 2026-11-04. An average of active members starts here, or it reads far too low.
 */
export const FIRST_TRACKED_DAY = new Date("2026-11-05T00:00:00Z");

/** Whole Amman dates in [from, to) on or after the first tracked day */
export function trackedDays(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - Math.max(from.getTime(), FIRST_TRACKED_DAY.getTime())) / DAY_MS));
}

/** Members seen on these Amman dates (`activity_days.day` is a DATE), summed per day */
export async function activeMembers(country: AdminCountry, from: Date, to: Date): Promise<number> {
  const rows = await db.activityDay.findMany({
    where: { day: { gte: from, lt: to }, user: { role: "USER", ...userCountryWhere(country) } },
    select: { userId: true, day: true },
    distinct: ["userId", "day"],
  });
  return rows.length;
}

/** The numbers of a time window: Admin home («Today») and Insights («Weekly») */
export async function pulseFor(country: AdminCountry, w: Window) {
  const range = { gte: w.from, lt: w.to };
  const members = { role: "USER" as const, ...userCountryWhere(country) };
  const payments = paymentCountryWhere(country);
  const recipient = byUserCountry(country, "recipient");
  const [signups, interestA, interestB, matches, paid, revenue, unpaid] = await Promise.all([
    db.user.count({ where: { ...members, createdAt: range } }),
    db.suggestion.count({ where: { ...recipient, recipientDecision: "INTERESTED", recipientDecidedAt: range } }),
    db.suggestion.count({ where: { ...recipient, candidateDecision: "INTERESTED", candidateDecidedAt: range } }),
    db.mutualMatch.count({ where: { ...matchCountryWhere(country), createdAt: range } }),
    db.payment.count({ where: { ...payments, status: "COMPLETED", createdAt: range } }),
    db.payment.groupBy({ by: ["currency"], where: { ...payments, status: "COMPLETED", createdAt: range }, _sum: { amount: true } }),
    db.payment.count({ where: { ...payments, status: { in: ["FAILED", "PENDING"] }, createdAt: range } }),
  ]);
  return {
    signups,
    interest: interestA + interestB,
    matches,
    paid,
    unpaid,
    revenue: revenue.map((r) => ({ currency: r.currency, amount: Number(r._sum.amount ?? 0) })),
  };
}
