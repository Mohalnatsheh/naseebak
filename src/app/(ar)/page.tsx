import { Amiri } from "next/font/google";
import { getCycleFlags } from "@/lib/settings";
import { LandingPage } from "@/components/landing/landing-page";

// Classic Arabic book face, used only for the Quran verse
const amiri = Amiri({ subsets: ["arabic"], weight: ["400"], display: "swap" });

/** The page follows the new-cycle switches, so it never describes a feature that is off. */
export default async function HomePage() {
  const flags = await getCycleFlags();
  return <LandingPage mode={{ introRequests: flags.introRequests, chat: flags.chat }} verseClass={amiri.className} />;
}
