import { NextResponse } from "next/server";
import { listCountrySettings, publicCountry } from "@/lib/countries/settings";

/**
 * Public: the countries a visitor or the app can pick (active ones only), with safe display data. Never provider
 * settings or secrets. `GET /api/countries`
 */
export async function GET() {
  try {
    const countries = (await listCountrySettings()).filter((s) => s.active).map(publicCountry);
    return NextResponse.json(
      { countries, defaultCountry: countries.find((c) => c.isDefault)?.code ?? countries[0]?.code ?? null },
      { headers: { "Cache-Control": "public, max-age=60" } },
    );
  } catch (error) {
    console.error("[countries] list failed:", error);
    return NextResponse.json({ error: "تعذّر تحميل الدول" }, { status: 500 });
  }
}
