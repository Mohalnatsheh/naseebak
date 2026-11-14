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
import { jsonLd } from "@/lib/json-ld";
import { listPublishedPosts } from "@/lib/blog";
import { getMobileConfig } from "@/lib/mobile-config";
import type { LandingArticle } from "@/components/landing/articles";
import type { CountryCode } from "@/lib/countries";

/** The country's 3 newest posts for the home page's «أدلة ونصائح» block (none if the blog can't be read) */
async function latestArticles(country: CountryCode): Promise<LandingArticle[]> {
  try {
    const { posts } = await listPublishedPosts({ country, pageSize: 3 });
    return posts.map((p) => ({ slug: p.slug, title: p.title, excerpt: p.excerpt, category: p.category.nameAr }));
  } catch {
    return [];
  }
}

/** The Android app as a schema.org entity, so searches for «تطبيق زواج» can tie the store listing to the site */
async function appJsonLd(country: CountryCode) {
  try {
    const url = (await getMobileConfig()).android.storeUrl;
    if (!url) return null;
    return {
      "@context": "https://schema.org",
      "@type": "MobileApplication",
      name: "نصيبك",
      alternateName: "Naseebak",
      operatingSystem: "ANDROID",
      applicationCategory: "LifestyleApplication",
      inLanguage: "ar",
      installUrl: url,
      url: absoluteUrl("/", country),
      publisher: { "@id": "https://naseebak.com/#organization" },
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    };
  } catch {
    return null;
  }
}

async function pageText() {
  const [flags, country] = await Promise.all([getCycleFlags(), getVisitorCountry()]);
  const settings = await getCountrySettings(country);
  const mode = { introRequests: flags.introRequests, chat: flags.chat, creditOnInterest: flags.creditOnInterest, freeInterestReply: !!flags.freeInterestReply };
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
  const [articles, app] = await Promise.all([latestArticles(country), appJsonLd(country)]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faqJsonLd(contentFor(mode, country).faqs)) }} />
      {app && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(app) }} />}
      <LandingPage mode={mode} country={country} hero={{ title: text.heroTitle, lead: text.heroSubtitle }} articles={articles} />
    </>
  );
}
