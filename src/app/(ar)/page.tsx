import { getCycleFlags } from "@/lib/settings";
import { getVisitorCountry } from "@/lib/countries/server";
import { LandingPage } from "@/components/landing/landing-page";
import type { Metadata } from "next";
import { publicCopy } from "@/lib/public-copy";
import { absoluteUrl, seoAlternates } from "@/lib/site-paths";

/** naseebak.com (Jordan) and naseebak.com/sa (Saudi Arabia): own title, canonical and hreflang */
export async function generateMetadata(): Promise<Metadata> {
  const country = await getVisitorCountry();
  const copy = publicCopy(country);
  return {
    title: { absolute: country === "SA" ? "نصيبك - منصة زواج جاد في السعودية بالحلال" : "نصيبك - نوصّلك بشريك العمر بالحلال" },
    alternates: seoAlternates("/", country),
    openGraph: { url: absoluteUrl("/", country), locale: copy.ogLocale, description: copy.description },
  };
}

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
