import { getCycleFlags } from "@/lib/settings";
import { LandingPage } from "@/components/landing/landing-page";

/** The page follows the new-cycle switches, so it never describes a feature that is off. */
export default async function HomePage() {
  const flags = await getCycleFlags();
  return <LandingPage mode={{ introRequests: flags.introRequests, chat: flags.chat, creditOnInterest: flags.creditOnInterest }} />;
}
