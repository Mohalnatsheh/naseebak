import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toCountry, type CountryCode } from "@/lib/countries";

// Real platform numbers for the landing page (aggregate counts only, no personal data), per country
// (`?country=SA`, Jordan by default: a Saudi visitor never sees Jordan's numbers as Saudi ones).
export const dynamic = "force-dynamic";

type PublicStats = { users: number; matches: number; visits: number };

const CACHE_MS = 10 * 60 * 1000;
const cache = new Map<CountryCode, { at: number; data: PublicStats }>();

export async function GET(request: Request) {
  const country = toCountry(new URL(request.url).searchParams.get("country"));
  const hit = cache.get(country);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return NextResponse.json(hit.data);
  }
  try {
    const [users, matches, visits] = await Promise.all([
      db.user.count({ where: { role: "USER", isDeactivated: false, country } }),
      db.mutualMatch.count({ where: { female: { country } } }),
      db.visitRequest.count({ where: { status: "COMPLETED", match: { female: { country } } } }),
    ]);
    const data = { users, matches, visits };
    cache.set(country, { at: Date.now(), data });
    return NextResponse.json(data);
  } catch (error) {
    console.error("Public stats error:", error);
    // Serve the last known numbers if the database is briefly unavailable
    if (hit) return NextResponse.json(hit.data);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
