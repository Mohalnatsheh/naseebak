import { getCycleFlags } from "@/lib/settings";
import { getVisitorCountry } from "@/lib/countries/server";
import { getCountrySettings } from "@/lib/countries/settings";
import { FaqContent } from "./faq-content";

/** Answers follow the new-cycle switches and the visitor's country, like the landing page. */
export default async function FaqPage() {
  const [flags, country] = await Promise.all([getCycleFlags(), getVisitorCountry()]);
  const { packagePrices } = await getCountrySettings(country);
  return <FaqContent newCycle={flags.introRequests} chat={flags.chat} creditOnInterest={flags.creditOnInterest} country={country} prices={packagePrices} />;
}
