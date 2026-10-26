import { getCycleFlags } from "@/lib/settings";
import { getVisitorCountry } from "@/lib/countries/server";
import { LandingPage } from "@/components/landing/landing-page";

/** The page follows the new-cycle switches (never describes a feature that is off) and the visitor's country. */
export default async function HomePage() {
  const [flags, country] = await Promise.all([getCycleFlags(), getVisitorCountry()]);
  return (
    <LandingPage
      mode={{ introRequests: flags.introRequests, chat: flags.chat, creditOnInterest: flags.creditOnInterest }}
      country={country}
    />
  );
}
