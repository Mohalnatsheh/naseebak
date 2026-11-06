import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { COUNTRY_CODES, COUNTRIES } from "@/lib/countries";
import { getCountrySettings } from "@/lib/countries/settings";
import { getAdminCountry } from "@/lib/admin/country-filter";
import { smsNoticesEnabled } from "@/lib/sms-notice";
import { AUTOMATIC_GROUPS, automaticNotificationsFor } from "@/lib/notifications/automatic";

/** Admin → Notifications → Automatic messages: what members get on their own, per country */
export async function GET(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const picked = await getAdminCountry(request);
    const codes = picked === "ALL" ? COUNTRY_CODES : [picked];
    const countries = await Promise.all(
      codes.map(async (code) => {
        const { packagePrices } = await getCountrySettings(code);
        return { code, name: COUNTRIES[code].nameEn, messages: automaticNotificationsFor(code, packagePrices) };
      }),
    );
    return NextResponse.json({ countries, groups: AUTOMATIC_GROUPS, smsNotices: await smsNoticesEnabled() });
  } catch (error) {
    console.error("[admin automatic notifications] failed:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
