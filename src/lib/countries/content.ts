/**
 * A country's built-in public text (landing hero + SEO), the same the landing page renders. Admin overrides
 * (country_settings.heroTitle / heroSubtitle / seoTitle / seoDescription) replace these when set. Db-free.
 */
import type { CountryCode } from "@/lib/countries";
import { publicCopy } from "@/lib/public-copy";
import { contentFor, type LandingMode } from "@/components/landing/content";

export interface CountryPageText {
  heroTitle: string;
  heroSubtitle: string;
  seoTitle: string;
  seoDescription: string;
}

export function countryPageDefaults(country: CountryCode, mode: LandingMode): CountryPageText {
  const hero = contentFor(mode, country).hero;
  return {
    heroTitle: hero.title,
    heroSubtitle: hero.lead,
    seoTitle: country === "SA" ? "نصيبك - منصة زواج جاد في السعودية بالحلال" : "نصيبك - نوصّلك بشريك العمر بالحلال",
    seoDescription: publicCopy(country).description,
  };
}

/** Built-in text with the admin's overrides on top */
export function countryPageText(
  defaults: CountryPageText,
  s: { heroTitle: string | null; heroSubtitle: string | null; seoTitle: string | null; seoDescription: string | null },
): CountryPageText {
  return {
    heroTitle: s.heroTitle || defaults.heroTitle,
    heroSubtitle: s.heroSubtitle || defaults.heroSubtitle,
    seoTitle: s.seoTitle || defaults.seoTitle,
    seoDescription: s.seoDescription || defaults.seoDescription,
  };
}
