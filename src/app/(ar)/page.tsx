import { Amiri, Reem_Kufi } from "next/font/google";
import { getCycleFlags } from "@/lib/settings";
import { LandingPage } from "@/components/landing/landing-page";

// Classic Arabic book face, used only for the Quran verse
const amiri = Amiri({ subsets: ["arabic"], weight: ["400"], display: "swap" });
// Geometric Kufi for the landing headlines (pairs with the khatam pattern); body text stays Cairo
const reemKufi = Reem_Kufi({ subsets: ["arabic"], weight: ["600", "700"], display: "swap" });

/** The page follows the new-cycle switches, so it never describes a feature that is off. */
export default async function HomePage() {
  const flags = await getCycleFlags();
  return (
    <LandingPage
      mode={{ introRequests: flags.introRequests, chat: flags.chat, creditOnInterest: flags.creditOnInterest }}
      verseClass={amiri.className}
      displayClass={reemKufi.className}
    />
  );
}
