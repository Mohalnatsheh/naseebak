/**
 * Last activity. `User.lastActiveAt` is refreshed at most once per hour (dashboard counts poll,
 * suggestions page, sign-in). Users from before the field existed have null, so "active" falls
 * back to `updatedAt`: active = COALESCE(lastActiveAt, updatedAt) within the last 30 days.
 */
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
export const ACTIVE_WINDOW_DAYS = 30;
export const TOUCH_INTERVAL_MS = HOUR_MS;
/** Shared suggestions: only people really seen (lastActiveAt, no updatedAt fallback) this recently are suggested to others */
export const CANDIDATE_ACTIVE_DAYS = 7;

/** Seen on the site in the last `days` days — `lastActiveAt` only (null = not seen since tracking began) */
export function recentlySeenWhere(days = CANDIDATE_ACTIVE_DAYS, now = new Date()): Prisma.UserWhereInput {
  return { lastActiveAt: { gte: new Date(now.getTime() - days * DAY_MS) } };
}

/** Record activity, at most once per hour per user (one conditional write; never throws). */
export async function touchLastActive(userId: string, now = new Date()): Promise<void> {
  try {
    await db.user.updateMany({
      where: {
        id: userId,
        OR: [{ lastActiveAt: null }, { lastActiveAt: { lt: new Date(now.getTime() - TOUCH_INTERVAL_MS) } }],
      },
      data: { lastActiveAt: now },
    });
  } catch (error) {
    console.error("[activity] touch failed:", error);
  }
}

/** The moment that counts as "last seen": lastActiveAt, else updatedAt (null when neither is known). */
export function lastSeen(u: { lastActiveAt?: Date | null; updatedAt?: Date | null }): Date | null {
  return u.lastActiveAt ?? u.updatedAt ?? null;
}

/** Seen within the last `days` days. Unknown (neither field loaded) counts as active. */
export function isActive(
  u: { lastActiveAt?: Date | null; updatedAt?: Date | null },
  days = ACTIVE_WINDOW_DAYS,
  now = new Date()
): boolean {
  const seen = lastSeen(u);
  if (!seen) return true;
  return seen.getTime() >= now.getTime() - days * DAY_MS;
}

/** Prisma filter: COALESCE(lastActiveAt, updatedAt) >= now - days. */
export function activeWhere(days = ACTIVE_WINDOW_DAYS, now = new Date()): Prisma.UserWhereInput {
  const since = new Date(now.getTime() - days * DAY_MS);
  return {
    OR: [{ lastActiveAt: { gte: since } }, { lastActiveAt: null, updatedAt: { gte: since } }],
  };
}

/** Prisma filter: last seen between `maxDays` and `minDays` ago (idle for at least minDays, at most maxDays). */
export function idleBetweenWhere(minDays: number, maxDays: number, now = new Date()): Prisma.UserWhereInput {
  const newest = new Date(now.getTime() - minDays * DAY_MS);
  const oldest = new Date(now.getTime() - maxDays * DAY_MS);
  return {
    OR: [
      { lastActiveAt: { lt: newest, gte: oldest } },
      { lastActiveAt: null, updatedAt: { lt: newest, gte: oldest } },
    ],
  };
}
