import { getSetting } from "@/lib/settings";
import { getCountrySettings, purchasesAvailable } from "@/lib/countries/settings";
import { toCountry } from "@/lib/countries";
import { appPaymentsEnabled } from "@/lib/mobile-config";
import { isTestPhone } from "@/lib/test-accounts";

/**
 * Switch `interest_paywall` (2026-11-11): at 0 credits «مهتم» stays tappable and opens a short «انتهى رصيدك» step with
 * a buy button — only for a member who can actually buy. Everyone else keeps the greyed «مهتم» (test and review
 * accounts, a country not selling, the app while «Payments in the app» is off). `/api/me/counts` sends the answer as
 * `interestPaywall`; the website and the app read only that.
 */
export async function interestPaywallFor(input: {
  creditOnInterest: boolean;
  country: string | null | undefined;
  phone: string | null | undefined;
  app: boolean;
}): Promise<boolean> {
  if (!input.creditOnInterest || isTestPhone(input.phone)) return false;
  if ((await getSetting("interest_paywall")) !== "true") return false;
  if (!purchasesAvailable(await getCountrySettings(toCountry(input.country)))) return false;
  return input.app ? await appPaymentsEnabled() : true;
}
