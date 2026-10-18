/**
 * Postgres-backed fixed-window rate limit (table rate_limit_buckets), for limits that must survive
 * deploys/restarts and hold across processes: OTP send and verify. One atomic upsert per call.
 * If the database call fails, it falls back to the in-memory limiter rather than locking people out.
 */
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

export async function rateLimitDb(
  key: string,
  { maxAttempts = 5, windowMs = 15 * 60 * 1000 } = {},
): Promise<{ success: boolean; remaining: number; resetAt: number }> {
  try {
    const now = new Date();
    const resetAt = new Date(now.getTime() + windowMs);
    const rows = await db.$queryRaw<{ count: number; resetAt: Date }[]>`
      INSERT INTO "rate_limit_buckets" ("key", "count", "resetAt")
      VALUES (${key}, 1, ${resetAt})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "rate_limit_buckets"."resetAt" <= ${now} THEN 1 ELSE "rate_limit_buckets"."count" + 1 END,
        "resetAt" = CASE WHEN "rate_limit_buckets"."resetAt" <= ${now} THEN ${resetAt} ELSE "rate_limit_buckets"."resetAt" END
      RETURNING "count", "resetAt"`;
    const row = rows[0];
    const count = Number(row.count);
    const until = new Date(row.resetAt).getTime();
    return { success: count <= maxAttempts, remaining: Math.max(0, maxAttempts - count), resetAt: until };
  } catch (error) {
    console.error("[rate-limit] database limiter failed, using memory:", key, error);
    return rateLimit(key, { maxAttempts, windowMs });
  }
}

/** Daily clean-up of finished windows */
export async function purgeExpiredRateLimits(now = new Date()): Promise<number> {
  const { count } = await db.rateLimitBucket.deleteMany({ where: { resetAt: { lt: now } } });
  return count;
}
