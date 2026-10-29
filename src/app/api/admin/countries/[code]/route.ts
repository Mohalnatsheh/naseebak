import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { DEFAULT_COUNTRY, isCountryCode } from "@/lib/countries";
import { clearCountrySettingsCache, countryWarnings, getCountrySettings } from "@/lib/countries/settings";
import { countrySettingsSchema } from "@/lib/validations/country-settings";

/**
 * Admin → Countries → save one country's settings. Validated server-side; the default country can't be switched off
 * (new visitors would have nowhere to register). Takes effect within 30 s on every server (settings cache).
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const code = (await params).code.toUpperCase();
    if (!isCountryCode(code)) return NextResponse.json({ error: "Unknown country" }, { status: 404 });

    const parsed = countrySettingsSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return NextResponse.json({ error: issue?.message ?? "Invalid settings", field: issue?.path?.[0] ?? null }, { status: 400 });
    }
    const data = parsed.data;
    if (code === DEFAULT_COUNTRY && data.active === false) {
      return NextResponse.json({ error: "The default country can't be switched off." }, { status: 409 });
    }

    const current = await getCountrySettings(code);
    await db.countrySetting.upsert({
      where: { code },
      // A first save starts from the code defaults (the row didn't exist yet)
      create: { ...current, ...data, code, updatedById: result.session.user.id },
      update: { ...data, updatedById: result.session.user.id },
    });
    clearCountrySettingsCache();
    console.log(`[admin countries] ${code} updated by ${result.session.user.id}: ${Object.keys(data).join(", ")}`);
    const saved = await getCountrySettings(code);
    return NextResponse.json({ settings: saved, warnings: countryWarnings(saved) });
  } catch (error) {
    console.error("[admin countries] update failed:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
