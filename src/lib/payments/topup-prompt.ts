/**
 * The right moment to buy (owner request 2026-11-05): a member at 0 credits who has someone's «مهتم» waiting. The
 * «شخص أبدى اهتمامه بك» and «شخص ينتظر ردّك» notices then add one line with the smallest package — only where buying is
 * on (credit on interest, the country sells, not a test account: store reviewers never see payments).
 */
import { getCycleFlags } from "@/lib/settings";
import { getCountrySettings, purchasesAvailable } from "@/lib/countries/settings";
import { toCountry } from "@/lib/countries";
import { isTestPhone } from "@/lib/test-accounts";
import { packagesFor, type PackagePrices } from "@/lib/payments/packages";
import { displayPrice } from "@/lib/payments/checkout-branding";

/** The smallest package of a country (the one-tap top-up) */
export function smallestPackage(country: unknown, prices?: PackagePrices | null) {
  return [...packagesFor(country, prices)].sort((a, b) => a.credits - b.credits)[0];
}

/** « رصيدك صفر: اشحن 10 أرصدة بـ 3 د.أ لتردّ.» or null */
export async function topUpLine(user: { matchCredits: number; country: string | null; gender: string | null; phone: string | null }): Promise<string | null> {
  if (user.matchCredits > 0 || isTestPhone(user.phone)) return null;
  if (!(await getCycleFlags()).creditOnInterest) return null;
  const country = toCountry(user.country);
  const settings = await getCountrySettings(country);
  if (!purchasesAvailable(settings)) return null;
  const pkg = smallestPackage(country, settings.packagePrices);
  if (!pkg) return null;
  return user.gender === "FEMALE"
    ? ` رصيدكِ صفر: اشحني ${pkg.name} بـ ${displayPrice(pkg)} لتردّي.`
    : ` رصيدك صفر: اشحن ${pkg.name} بـ ${displayPrice(pkg)} لتردّ.`;
}
