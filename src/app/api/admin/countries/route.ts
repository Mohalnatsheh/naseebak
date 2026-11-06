import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { COUNTRIES, type CountryCode } from "@/lib/countries";
import {
  countryWarnings,
  goLiveChecklist,
  listCountrySettings,
  pricesAreApproved,
  providerConfigured,
  publicCountry,
  purchasesAvailable,
  resolveSmsProvider,
} from "@/lib/countries/settings";
import { packagesFor } from "@/lib/payments/packages";

const DAY = 24 * 60 * 60 * 1000;

/**
 * Admin → Countries: every country's settings, what is missing (warnings), member numbers and which provider
 * credentials exist on this server (yes/no only — never the values).
 */
export async function GET() {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const now = Date.now();
    const [settings, members, active7, new7] = await Promise.all([
      listCountrySettings(),
      db.user.groupBy({ by: ["country"], where: { role: "USER" }, _count: { _all: true } }),
      db.user.groupBy({ by: ["country"], where: { role: "USER", lastActiveAt: { gte: new Date(now - 7 * DAY) } }, _count: { _all: true } }),
      db.user.groupBy({ by: ["country"], where: { role: "USER", createdAt: { gte: new Date(now - 7 * DAY) } }, _count: { _all: true } }),
    ]);
    const count = (rows: { country: string; _count: { _all: number } }[], c: string) => rows.find((r) => r.country === c)?._count._all ?? 0;

    return NextResponse.json({
      countries: settings.map((s) => {
        const code = s.code as CountryCode;
        const provider = resolveSmsProvider(code, s.smsProvider);
        return {
          settings: s,
          display: publicCountry(s),
          nameEn: COUNTRIES[code].nameEn,
          warnings: countryWarnings(s),
          sms: { provider, configured: providerConfigured(provider) },
          packages: packagesFor(code, s.packagePrices).map((p) => ({ id: p.id, credits: p.credits, price: p.price, currency: p.currency })),
          pricesApproved: pricesAreApproved(s),
          goLive: goLiveChecklist(s),
          selling: purchasesAvailable(s),
          members: { total: count(members, code), active7d: count(active7, code), new7d: count(new7, code) },
        };
      }),
      server: {
        broadnet: providerConfigured("BROADNET"),
        unifonic: providerConfigured("UNIFONIC"),
        stripe: !!process.env.STRIPE_SECRET_KEY,
        smsMock: process.env.SMS_MOCK === "true",
      },
    });
  } catch (error) {
    console.error("[admin countries] list failed:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
