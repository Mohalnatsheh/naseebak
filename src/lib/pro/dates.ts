/** Date steps of Pro plans (db-free) */
import type { ProPlanId } from "@/lib/pro/plans";

/** One calendar month later, clamped to the month's last day (31 Jan -> 28 Feb) */
export function addMonth(d: Date): Date {
  return addMonths(d, 1);
}

function addMonths(d: Date, n: number): Date {
  const out = new Date(d.getTime());
  const day = out.getUTCDate();
  out.setUTCDate(1);
  out.setUTCMonth(out.getUTCMonth() + n);
  const last = new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0)).getUTCDate();
  out.setUTCDate(Math.min(day, last));
  return out;
}

/** One billing period of the plan after `d` */
export function addPlanPeriod(d: Date, plan: ProPlanId): Date {
  if (plan === "weekly") return new Date(d.getTime() + 7 * 24 * 60 * 60 * 1000);
  return addMonths(d, plan === "yearly" ? 12 : 1);
}
