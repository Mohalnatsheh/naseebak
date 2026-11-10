import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { DEFAULT_COUNTRY, isCountryCode } from "@/lib/countries";
import { packagesFor } from "@/lib/payments/packages";
import { clearCountrySettingsCache, countryWarnings, getCountrySettings } from "@/lib/countries/settings";
import { countrySettingsSchema, proPlansError } from "@/lib/validations/country-settings";
import { Prisma } from "@prisma/client";

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
      // Every invalid field in one message (WP2-13); `field` stays the first
      const all = [...new Set(parsed.error.issues.map((i) => i.message))].join(" · ");
      return NextResponse.json({ error: all || "Invalid settings", field: issue?.path?.[0] ?? null }, { status: 400 });
    }
    const data = parsed.data;
    if (code === DEFAULT_COUNTRY && data.active === false) {
      return NextResponse.json({ error: "The default country can't be switched off." }, { status: 409 });
    }

    // Stripe's smallest charge in riyals (Jordan is charged in dollars: 1 dinar is above its minimum)
    if (code === "SA" && Object.values(data.packagePrices ?? {}).some((price) => price < 2)) {
      return NextResponse.json({ error: "A Saudi package price must be at least 2 SAR" }, { status: 400 });
    }
    const planError = proPlansError(data.proPlans, code);
    if (planError) return NextResponse.json({ error: planError }, { status: 400 });
    const unknownPackage = Object.keys(data.packagePrices ?? {}).find((id) => !packagesFor(code).some((p) => p.id === id));
    if (unknownPackage) return NextResponse.json({ error: `${unknownPackage} is not a package of this country` }, { status: 400 });

    const { packagePrices, proPlans, ...current } = await getCountrySettings(code);
    // Every plan cleared: stored as NULL, not {} (QA WEB-PAY-16)
    const clearsPlans = !!data.proPlans && Object.keys(data.proPlans).length === 0;
    await db.countrySetting.upsert({
      where: { code },
      // A first save starts from the code defaults (the row didn't exist yet)
      create: { ...current, ...(packagePrices && { packagePrices }), ...(proPlans && { proPlans }), ...data, ...(clearsPlans && { proPlans: Prisma.DbNull }), code, updatedById: result.session.user.id }, // Json columns take no plain null
      update: {
        ...data,
        ...(clearsPlans && { proPlans: Prisma.DbNull }),
        updatedById: result.session.user.id,
      },
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
