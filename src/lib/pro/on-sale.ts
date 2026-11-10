import type { CountryCode } from "@/lib/countries";
import { getCountrySettings, purchasesAvailable } from "@/lib/countries/settings";
import { getProEnabled } from "@/lib/settings";
import { proOffersFor } from "@/lib/pro/plans";

/** Pro is on sale in a country: `pro_enabled`, purchases open there, and a plan with a price (public pages, WP2-01) */
export async function proSoldIn(country: CountryCode): Promise<boolean> {
  try {
    if (!(await getProEnabled())) return false;
    const settings = await getCountrySettings(country);
    return purchasesAvailable(settings) && proOffersFor(country, settings.proPlans).length > 0;
  } catch (error) {
    console.error("[pro] on-sale check failed:", error);
    return false;
  }
}
