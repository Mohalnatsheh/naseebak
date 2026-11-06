import { redirect } from "next/navigation";
import { getCycleFlags } from "@/lib/settings";
import { getVisitorCountry } from "@/lib/countries/server";
import { activeCountryCodes, getCountrySettings } from "@/lib/countries/settings";
import { countryPageDefaults, countryPageText } from "@/lib/countries/content";
import { DEFAULT_COUNTRY } from "@/lib/countries";
import { LandingPage } from "@/components/landing/landing-page";
import type { Metadata } from "next";
import { publicCopy } from "@/lib/public-copy";
import { absoluteUrl, seoAlternates } from "@/lib/site-paths";
import { faqJsonLd, socialMetadata } from "@/lib/seo";
import { contentFor } from "@/components/landing/content";

async function pageText() {
  const [flags, country] = await Promise.all([getCycleFlags(), getVisitorCountry()]);
  const settings = await getCountrySettings(country);
  const mode = { introRequests: flags.introRequests, chat: flags.chat, creditOnInterest: flags.creditOnInterest };
  return { mode, country, settings, text: countryPageText(countryPageDefaults(country, mode), settings) };
}

/** naseebak.com (Jordan) and naseebak.com/sa (Saudi Arabia): own title, canonical and hreflang (admin can override) */
export async function generateMetadata(): Promise<Metadata> {
  const { country, text } = await pageText();
  const copy = publicCopy(country);
  return {
    title: { absolute: text.seoTitle },
    description: text.seoDescription,
    alternates: seoAlternates("/", country, await activeCountryCodes()),
    // Same title and text on link previews (admin's SEO override included)
    ...socialMetadata({ title: text.seoTitle, description: text.seoDescription, url: absoluteUrl("/", country), locale: copy.ogLocale }),
  };
}

/**
 * The page follows the new-cycle switches (never describes a feature that is off), the visitor's country and the
 * country's admin settings. A country that isn't active sends its visitors to the default country's home.
 */
export default async function HomePage() {
  const { mode, country, settings, text } = await pageText();
  if (!settings.active && country !== DEFAULT_COUNTRY) redirect("/?country=jo");
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd(contentFor(mode, country).faqs)) }} />
      <LandingPage mode={mode} country={country} hero={{ title: text.heroTitle, lead: text.heroSubtitle }} />
    </>
  );
}
