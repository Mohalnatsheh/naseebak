/**
 * Where members use Naseebak, per Amman day (admin dashboard → «Active by device»): one `activity_days` row per member,
 * day and source. Recorded from the calls both the website and the app make on every visit (`/api/me/counts`,
 * `/api/suggestions`, `/api/mobile/me`). An in-memory set (PM2 runs one process) keeps it to one write per member,
 * day and source; a restart only costs one duplicate-skipping insert. Never throws.
 */
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { ammanDay } from "@/lib/admin/revenue";
import { webDeviceFromUserAgent } from "@/lib/alerts";
import { activeMobileSession } from "@/lib/mobile-auth";

export const ACTIVITY_SOURCES = ["WEB_ANDROID", "WEB_IPHONE", "WEB_DESKTOP", "APP_ANDROID", "APP_IOS", "APP_OTHER"] as const;
export type ActivitySource = (typeof ACTIVITY_SOURCES)[number];

const WEB_SOURCE = { android: "WEB_ANDROID", iphone: "WEB_IPHONE", desktop: "WEB_DESKTOP" } as const;

/** The app sends `X-App-Platform: android | ios` (builds after 1.0.0); older builds are told apart by their push device */
export function appSource(platform: string | null | undefined): ActivitySource {
  const p = platform?.trim().toLowerCase();
  return p === "ios" ? "APP_IOS" : p === "android" ? "APP_ANDROID" : "APP_OTHER";
}

export function webSource(userAgent: string | null | undefined): ActivitySource {
  return WEB_SOURCE[webDeviceFromUserAgent(userAgent)];
}

const isBearer = (authorization: string | null) => !!authorization && /^Bearer\s+\S+/i.test(authorization.trim());

let seenDay = "";
const seen = new Set<string>();

export async function recordActivityDay(userId: string, now = new Date()): Promise<void> {
  try {
    const day = ammanDay(now);
    if (day !== seenDay) {
      seen.clear();
      seenDay = day;
    }
    const h = await headers();
    const authorization = h.get("authorization");
    const app = isBearer(authorization);
    const key = `${userId}|${app ? "app" : webSource(h.get("user-agent"))}`;
    if (seen.has(key)) return;

    let source: ActivitySource;
    if (!app) source = webSource(h.get("user-agent"));
    else {
      source = appSource(h.get("x-app-platform"));
      if (source === "APP_OTHER") {
        const session = await activeMobileSession(authorization, now);
        const device = await db.pushDevice.findFirst({
          where: session ? { mobileSessionId: session.id } : { userId },
          orderBy: { updatedAt: "desc" },
          select: { platform: true },
        });
        source = appSource(device?.platform);
      }
    }

    await db.activityDay.createMany({ data: [{ userId, day: new Date(`${day}T00:00:00Z`), source }], skipDuplicates: true });
    seen.add(key);
  } catch (error) {
    console.error("[activity] day record failed:", error);
  }
}
