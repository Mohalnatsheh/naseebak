import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

const PREFERENCE_KEYS = [
  "suggestions", "interests", "matches", "visitUpdates", "payments", "identity", "support", "introRequests", "chatMessages",
] as const;

/** Website push for this member in OneSignal (external_id = user id): on / off / null when it can't be checked */
async function webPushStatus(userId: string): Promise<{ on: boolean | null; devices: string[] }> {
  const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
  const key = process.env.ONESIGNAL_REST_API_KEY;
  if (!appId || !key) return { on: null, devices: [] };
  try {
    const res = await fetch(`https://api.onesignal.com/apps/${appId}/users/by/external_id/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Key ${key}` },
      signal: AbortSignal.timeout(5000),
    });
    if (res.status === 404) return { on: false, devices: [] };
    if (!res.ok) return { on: null, devices: [] };
    const data = (await res.json()) as { subscriptions?: { type?: string; enabled?: boolean; notification_types?: number; device_os?: string }[] };
    const push = (data.subscriptions ?? []).filter((s) => /Push$/.test(s.type ?? ""));
    const enabled = push.filter((s) => s.enabled !== false && (s.notification_types ?? 1) > 0);
    return { on: enabled.length > 0, devices: enabled.map((s) => (s.type ?? "Push").replace(/Push$/, "")) };
  } catch {
    return { on: null, devices: [] };
  }
}

/**
 * Admin → member page «Devices & notifications» (owner request 2026-11-04): where the member last used Naseebak
 * (`activity_days`, since 4 Nov 2026), their app sign-ins and app push devices, website push in OneSignal, and the
 * notification types they turned off. Read-only.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const { id } = await params;
    const now = new Date();

    const user = await db.user.findUnique({ where: { id }, select: { id: true, lastActiveAt: true } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const [days, sessions, pushDevices, prefs, web] = await Promise.all([
      db.activityDay.findMany({ where: { userId: id }, orderBy: [{ day: "desc" }, { createdAt: "desc" }], take: 30, select: { day: true, source: true } }),
      db.mobileSession.findMany({
        where: { userId: id, revokedAt: null, expiresAt: { gt: now } },
        select: { createdAt: true, lastUsedAt: true },
        orderBy: { lastUsedAt: { sort: "desc", nulls: "last" } },
      }),
      db.pushDevice.findMany({
        where: { userId: id, mobileSession: { revokedAt: null, expiresAt: { gt: now } } },
        select: { platform: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
      }),
      db.notificationPreference.findUnique({ where: { userId: id } }),
      webPushStatus(id),
    ]);

    const off = prefs ? PREFERENCE_KEYS.filter((k) => (prefs as Record<string, unknown>)[k] === false) : [];
    return NextResponse.json({
      lastActiveAt: user.lastActiveAt,
      lastDevice: days[0] ? { source: days[0].source, day: days[0].day.toISOString().slice(0, 10) } : null,
      recent: days.map((d) => ({ day: d.day.toISOString().slice(0, 10), source: d.source })),
      app: {
        signedIn: sessions.length,
        lastUsedAt: sessions[0]?.lastUsedAt ?? null,
        push: pushDevices.map((p) => ({ platform: p.platform, since: p.updatedAt })),
      },
      webPush: web,
      notificationsOff: off,
    });
  } catch (error) {
    console.error("Admin user devices error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
