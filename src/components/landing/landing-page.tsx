import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import type { CountryCode } from "@/lib/countries";
import { contentFor, type LandingMode } from "./content";
import { LandingBody } from "./landing-body";
import type { LandingArticle } from "./articles";

export function LandingPage({
  mode,
  country,
  hero,
  articles,
}: {
  mode: LandingMode;
  country: CountryCode;
  hero?: { title: string; lead: string };
  articles?: LandingArticle[];
}) {
  const base = contentFor(mode, country);
  // The country's admin overrides (country_settings) replace the built-in hero text
  const content = hero ? { ...base, hero: { ...base.hero, title: hero.title, lead: hero.lead } } : base;
  return (
    <>
      <Navbar />
      <LandingBody content={content} articles={articles} />
      <Footer />
    </>
  );
}
