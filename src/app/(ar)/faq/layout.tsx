import type { Metadata } from "next";
import { getCycleFlags } from "@/lib/settings";
import { faqsFor } from "./faq-data";
import { getVisitorCountry } from "@/lib/countries/server";
import { publicCopy } from "@/lib/public-copy";

export async function generateMetadata(): Promise<Metadata> {
  const copy = publicCopy(await getVisitorCountry());
  return {
    title: "الأسئلة الشائعة",
    description:
      "إجابات على أكثر الأسئلة شيوعاً حول منصة نصيبك لتيسير الزواج بالحلال — التسجيل، الخصوصية، الباقات، التوافق، والمزيد",
    alternates: { canonical: "https://naseebak.com/faq" },
    openGraph: {
      title: "الأسئلة الشائعة | نصيبك",
      description: `إجابات على أكثر الأسئلة شيوعاً حول منصة نصيبك لتيسير الزواج بالحلال ${copy.inCountry}`,
      url: "https://naseebak.com/faq",
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
