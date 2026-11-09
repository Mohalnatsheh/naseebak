import { db } from "@/lib/db";
import type { ProSubscription } from "@prisma/client";

const LIVE_STATUSES = ["ACTIVE", "PAST_DUE"] as const;

/** The one definition of a live subscription, shared with the grant task */
export function liveProWhere(now: Date) {
  return { status: { in: [...LIVE_STATUSES] }, currentPeriodEnd: { gt: now } };
}

/**
 * The member's live Pro subscription: status ACTIVE or PAST_DUE and a period end in the future.
 * Independent of `pro_enabled`: the switch gates new sales only, never what a member already paid for.
 */
export async function currentProSubscription(userId: string, now: Date = new Date()): Promise<ProSubscription | null> {
  return db.proSubscription.findFirst({
    where: { userId, status: { in: [...LIVE_STATUSES] }, currentPeriodEnd: { gt: now } },
    orderBy: { currentPeriodEnd: "desc" },
  });
}

/** Whether the member is Pro now. Independent of `pro_enabled` */
export async function isPro(userId: string, now: Date = new Date()): Promise<boolean> {
  return (await currentProSubscription(userId, now)) !== null;
}

/** Which of these members are Pro now, in one query (for card lists). Independent of `pro_enabled` */
export async function proUserIds(userIds: string[], now: Date = new Date()): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows = await db.proSubscription.findMany({
    where: { userId: { in: userIds }, status: { in: [...LIVE_STATUSES] }, currentPeriodEnd: { gt: now } },
    select: { userId: true },
  });
  const out = new Set<string>();
  for (const r of rows) if (r.userId) out.add(r.userId);
  return out;
}
