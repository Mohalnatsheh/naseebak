import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Real platform numbers for the landing page (aggregate counts only, no personal data).
export const dynamic = "force-dynamic";

type PublicStats = { users: number; matches: number; visits: number };

const CACHE_MS = 10 * 60 * 1000;
let cache: { at: number; data: PublicStats } | null = null;

export async function GET() {
  if (cache && Date.now() - cache.at < CACHE_MS) {
    return NextResponse.json(cache.data);
  }
  try {
    const [users, matches, visits] = await Promise.all([
      db.user.count({ where: { role: "USER", isDeactivated: false } }),
      db.mutualMatch.count(),
      db.visitRequest.count({ where: { status: "COMPLETED" } }),
    ]);
    cache = { at: Date.now(), data: { users, matches, visits } };
    return NextResponse.json(cache.data);
  } catch (error) {
    console.error("Public stats error:", error);
    // Serve the last known numbers if the database is briefly unavailable
    if (cache) return NextResponse.json(cache.data);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
