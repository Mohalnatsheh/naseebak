import type { Metadata } from "next";
import { getCycleFlags } from "@/lib/settings";
import { faqsFor } from "./faq-data";
import { getVisitorCountry } from "@/lib/countries/server";
import { activeCountryCodes } from "@/lib/countries/settings";
import { publicCopy } from "@/lib/public-copy";
import { absoluteUrl, seoAlternates } from "@/lib/site-paths";

export async function generateMetadata(): Promise<Metadata> {
  const country = await getVisitorCountry();
  const copy = publicCopy(country);
  return {
    title: "الأسئلة الشائعة",
    description:
      "إجابات على أكثر الأسئلة شيوعاً حول منصة نصيبك لتيسير الزواج بالحلال — التسجيل، الخصوصية، الباقات، التوافق، والمزيد",
    alternates: seoAlternates("/faq", country, await activeCountryCodes()),
    openGraph: {
      title: "الأسئلة الشائعة | نصيبك",
      description: `إجابات على أكثر الأسئلة شيوعاً حول منصة نصيبك لتيسير الزواج بالحلال ${copy.inCountry}`,
      url: absoluteUrl("/faq", country),
      locale: copy.ogLocale,
    },
  };
}

export default async function FaqLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Same answers as the page, so search engines never index outdated rules
  const [flags, country] = await Promise.all([getCycleFlags(), getVisitorCountry()]);
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqsFor(flags.introRequests, flags.chat, flags.creditOnInterest, country).map((f) => ({
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
