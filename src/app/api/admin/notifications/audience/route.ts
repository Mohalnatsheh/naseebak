import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAdminCountry } from "@/lib/admin/country-filter";
import { broadcastAudienceWhere } from "@/lib/admin/reach-audience";
import { countryConfig } from "@/lib/countries";
import type { PushChannel } from "@/lib/notify";

/** Read-only: how many members a broadcast would reach now, for the confirmation. `channel` all|web|app */
export async function GET(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const raw = new URL(request.url).searchParams.get("channel") ?? "all";
    if (!["all", "web", "app"].includes(raw)) {
      return NextResponse.json({ error: "channel must be all, web or app" }, { status: 400 });
    }
    const country = await getAdminCountry(request);
    const count = await db.user.count({ where: broadcastAudienceWhere(country, raw as PushChannel, new Date()) });
    return NextResponse.json({ count, country: country === "ALL" ? null : countryConfig(country).nameEn });
  } catch (error) {
    console.error("Admin notification audience error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
