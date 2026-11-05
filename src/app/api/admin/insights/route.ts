import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getAdminCountry } from "@/lib/admin/country-filter";
import { noSuggestionReasons, paymentInsights, stuckMembers, supplyGaps, weeklySummary } from "@/lib/admin/insights";

/** Admin → Insights: one report per tab, loaded when the tab opens (`lib/admin/insights.ts`) */
export async function GET(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const country = await getAdminCountry(request);
    const tab = new URL(request.url).searchParams.get("tab");
    if (tab === "payments") return NextResponse.json(await paymentInsights(country));
    if (tab === "stuck") return NextResponse.json(await stuckMembers(country));
    if (tab === "supply") return NextResponse.json(await supplyGaps(country));
    if (tab === "reasons") return NextResponse.json(await noSuggestionReasons(country));
    if (tab === "weekly") return NextResponse.json({ weeks: await weeklySummary(country) });
    return NextResponse.json({ error: "Unknown report" }, { status: 400 });
  } catch (error) {
    console.error("Admin insights error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
