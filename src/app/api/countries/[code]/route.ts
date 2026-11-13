import { NextResponse } from "next/server";
import { getCycleFlags, getReligionEnabled } from "@/lib/settings";
import { isCountryCode } from "@/lib/countries";
import { getCountrySettings, publicCountryDetail } from "@/lib/countries/settings";
import { countryPageDefaults } from "@/lib/countries/content";
import { SITE_URL } from "@/lib/site-paths";

/**
 * Public configuration of one active country: display data, page text (with admin overrides), support contacts,
 * legal links and features. 404 for an unknown or inactive country. `GET /api/countries/JO`
 */
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const code = (await params).code.toUpperCase();
    if (!isCountryCode(code)) return NextResponse.json({ error: "الدولة غير معروفة", code: "COUNTRY_UNKNOWN" }, { status: 404 });
    const settings = await getCountrySettings(code);
    if (!settings.active) return NextResponse.json({ error: "نصيبك غير متاح في هذه الدولة حالياً", code: "COUNTRY_INACTIVE" }, { status: 404 });
    const flags = await getCycleFlags();
    const religion = await getReligionEnabled();
    const defaults = countryPageDefaults(code, { introRequests: flags.introRequests, chat: flags.chat, creditOnInterest: flags.creditOnInterest });
    const siteUrl = process.env.NEXT_PUBLIC_APP_URL || SITE_URL;
    return NextResponse.json({ country: publicCountryDetail(settings, defaults, siteUrl, { religion }) }, { headers: { "Cache-Control": "public, max-age=60" } });
  } catch (error) {
    console.error("[countries] detail failed:", error);
    return NextResponse.json({ error: "تعذّر تحميل إعدادات الدولة" }, { status: 500 });
  }
}
