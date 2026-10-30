import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { notify, notifyMany, type PushChannel } from "@/lib/notify";
import { byUserCountry, getAdminCountry, userCountryWhere } from "@/lib/admin/country-filter";
import { countryConfig } from "@/lib/countries";

export async function GET(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;

    const notifications = await db.notification.findMany({
      // Admin's selected country ("ALL" = every country)
      where: { type: "SYSTEM", ...byUserCountry(await getAdminCountry(request), "user") },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        title: true,
        body: true,
        isRead: true,
        createdAt: true,
        user: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    return NextResponse.json({ notifications });
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
    const input = { type: "SYSTEM" as const, title, body: notifBody, url: safeUrl(body.url), channel };
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

    // Broadcast: active users only (not suspended, not deactivated), of the selected country; "app" = only members
    // with the app and a valid sign-in, so website-only members don't get an app message in their list
    const now = new Date();
    const users = await db.user.findMany({
      where: {
        role: "USER",
        isDeactivated: false,
        status: { not: "SUSPENDED" },
        ...userCountryWhere(country),
        ...(channel === "app" && {
          pushDevices: { some: { mobileSession: { revokedAt: null, expiresAt: { gt: now } } } },
        }),
      },
      select: { id: true },
    });

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
