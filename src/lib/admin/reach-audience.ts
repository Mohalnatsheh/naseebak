import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { PushChannel } from "@/lib/notify";
import { userCountryWhere, type AdminCountry } from "@/lib/admin/country-filter";

/**
 * Who a broadcast reaches: active users only (not suspended, not deactivated) of the selected country;
 * "app" = only members with the app and a valid sign-in, so website-only members don't get an app
 * message in their list. The send and the confirmation's count both use this.
 */
export function broadcastAudienceWhere(country: AdminCountry, channel: PushChannel, now: Date): Prisma.UserWhereInput {
  return {
    role: "USER",
    isDeactivated: false,
    status: { not: "SUSPENDED" },
    ...userCountryWhere(country),
    ...(channel === "app" && {
      pushDevices: { some: { mobileSession: { revokedAt: null, expiresAt: { gt: now } } } },
    }),
  };
}

/** Same title + body within this gap counts as one send (a broadcast is written in batches) */
const SEND_GAP_MINUTES = 10;
const RECENT_DAYS = 90;
const MAX_SENDS = 30;

export interface NotificationSend {
  title: string;
  body: string;
  sentAt: Date;
  recipients: number;
  read: number;
  /** Who it went to, when it went to one person */
  user: { id: string; firstName: string; lastName: string } | null;
}

/** Recent system notifications, one row per send, newest first */
export async function recentNotificationSends(country: AdminCountry): Promise<NotificationSend[]> {
  const byCountry = country === "ALL" ? Prisma.empty : Prisma.sql`AND u.country = ${country}`;
  const rows = await db.$queryRaw<(Omit<NotificationSend, "user"> & { userId: string })[]>`
    WITH recent AS (
      SELECT n.title, n.body, n."isRead", n."createdAt", n."userId",
        CASE WHEN n."createdAt" - LAG(n."createdAt") OVER (PARTITION BY n.title, n.body ORDER BY n."createdAt")
             <= make_interval(mins => ${SEND_GAP_MINUTES}::int) THEN 0 ELSE 1 END AS starts
      FROM notifications n JOIN users u ON u.id = n."userId"
      WHERE n.type = 'SYSTEM' AND n."createdAt" > now() - make_interval(days => ${RECENT_DAYS}::int) ${byCountry}
    ), numbered AS (
      SELECT *, SUM(starts) OVER (PARTITION BY title, body ORDER BY "createdAt" ROWS UNBOUNDED PRECEDING) AS send
      FROM recent
    )
    SELECT title, body, MIN("createdAt") AS "sentAt", COUNT(*)::int AS recipients,
      (COUNT(*) FILTER (WHERE "isRead"))::int AS read, MIN("userId") AS "userId"
    FROM numbered GROUP BY title, body, send ORDER BY "sentAt" DESC LIMIT ${MAX_SENDS}`;

  const singles = rows.filter((r) => r.recipients === 1).map((r) => r.userId);
  const users = singles.length
    ? await db.user.findMany({ where: { id: { in: singles } }, select: { id: true, firstName: true, lastName: true } })
    : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  return rows.map(({ userId, ...r }) => ({ ...r, user: r.recipients === 1 ? byId.get(userId) ?? null : null }));
}
