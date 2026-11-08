import type { Metadata } from "next";
import { getCycleFlags } from "@/lib/settings";
import { faqsFor } from "./faq-data";
import { getVisitorCountry } from "@/lib/countries/server";
import { activeCountryCodes, getCountrySettings } from "@/lib/countries/settings";
import { publicCopy } from "@/lib/public-copy";
import { countryConfig } from "@/lib/countries";
import { absoluteUrl, seoAlternates } from "@/lib/site-paths";
import { socialMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const country = await getVisitorCountry();
  const copy = publicCopy(country);
  return {
    title: `الأسئلة الشائعة حول نصيبك ${countryConfig(country).inName}`,
    description:
      "إجابات عن أكثر الأسئلة شيوعاً حول منصة نصيبك لتيسير الزواج بالحلال — التسجيل، الخصوصية، الباقات، التوافق، والمزيد",
    alternates: seoAlternates("/faq", country, await activeCountryCodes()),
    ...socialMetadata({
      title: "الأسئلة الشائعة | نصيبك",
      description: `إجابات عن أكثر الأسئلة شيوعاً حول منصة نصيبك لتيسير الزواج بالحلال ${copy.inCountry}`,
      url: absoluteUrl("/faq", country),
      locale: copy.ogLocale,
    }),
  };
}

export default async function FaqLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Same answers as the page, so search engines never index outdated rules
  const [flags, country] = await Promise.all([getCycleFlags(), getVisitorCountry()]);
  const { packagePrices } = await getCountrySettings(country);
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqsFor(flags.introRequests, flags.chat, flags.creditOnInterest, country, packagePrices, !!flags.freeInterestReply).map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      {children}
    </>
  );
}
