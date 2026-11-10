import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { notify, notifyMany, type PushChannel } from "@/lib/notify";
import { getAdminCountry } from "@/lib/admin/country-filter";
import { broadcastAudienceWhere, recentNotificationSends } from "@/lib/admin/reach-audience";
import { countryConfig } from "@/lib/countries";

export async function GET(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;

    // Admin's selected country ("ALL" = every country), one row per send
    return NextResponse.json({ sends: await recentNotificationSends(await getAdminCountry(request)) });
  } catch (error) {
    console.error("Admin notifications error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** Only in-site relative paths ("/dashboard/..."); anything else falls back to the dashboard. */
function safeUrl(url: unknown): string {
  if (typeof url !== "string") return "/dashboard";
  const u = url.trim();
  return u.startsWith("/") && !u.startsWith("//") ? u : "/dashboard";
}

const BROADCAST_BATCH = 25;

export async function POST(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const { userId } = body;
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const notifBody = typeof body.body === "string" ? body.body.trim() : "";

    if (!title || !notifBody) {
      return NextResponse.json({ error: "Title and body are required" }, { status: 400 });
    }

    // "all" (website + app), "web" (OneSignal only) or "app" (FCM only, and only members who have the app)
    const channel: PushChannel = body.channel ?? "all";
    if (!(["all", "web", "app"] as const).includes(channel)) {
      return NextResponse.json({ error: "channel must be all, web or app" }, { status: 400 });
    }
    // `adminSend` tells admin sends apart from automatic SYSTEM notices in «Recent» (ADM-27)
    const input = { type: "SYSTEM" as const, title, body: notifBody, url: safeUrl(body.url), channel, metadata: { adminSend: true } };
    // Sends only reach the admin's selected country ("ALL" = every country)
    const country = await getAdminCountry(request);

    if (userId) {
      if (typeof userId !== "string") {
        return NextResponse.json({ error: "Invalid user" }, { status: 400 });
      }
      const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, country: true } });
      if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
      if (country !== "ALL" && user.country !== country) {
        return NextResponse.json(
          { error: `This member is in ${countryConfig(user.country).nameEn}: switch the admin country to send to them` },
          { status: 409 }
        );
      }
      await notify({ ...input, userId });
      return NextResponse.json({ message: "Notification sent to user" });
    }

    // Broadcast: see broadcastAudienceWhere (same rule as the confirmation's count)
    const users = await db.user.findMany({ where: broadcastAudienceWhere(country, channel, new Date()), select: { id: true } });

    if (users.length === 0) {
      return NextResponse.json({ message: "No users to notify" });
    }

    const userIds = users.map((u) => u.id);
    // Batches keep the DB pool and push provider from being flooded
    for (let i = 0; i < userIds.length; i += BROADCAST_BATCH) {
      await notifyMany(userIds.slice(i, i + BROADCAST_BATCH), input);
    }

    const where = country === "ALL" ? "" : ` in ${countryConfig(country).nameEn}`;
    const via = channel === "web" ? " (website push only)" : channel === "app" ? " (app push only)" : "";
    return NextResponse.json({ message: `Notification sent to ${users.length} users${where}${via}` });
  } catch (error) {
    console.error("Admin send notification error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
