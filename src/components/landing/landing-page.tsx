import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { landingContent, type LandingMode } from "./content";
import { LandingHero } from "./hero";
import { LandingJourney } from "./journey";
import { LandingPrinciples } from "./principles";
import { LandingFaq } from "./faq";
import { LandingFinalCta } from "./final-cta";

export function LandingPage({ mode, verseClass }: { mode: LandingMode; verseClass: string }) {
  const content = landingContent(mode);
  return (
    <>
      <Navbar />
      <main className="overflow-x-clip">
        <LandingHero content={content} verseClass={verseClass} />
        <LandingJourney content={content} />
        <LandingPrinciples content={content} chat={mode.chat} />
        <LandingFaq content={content} />
        <LandingFinalCta content={content} />
      </main>
      <Footer />
    </>
  );
}
