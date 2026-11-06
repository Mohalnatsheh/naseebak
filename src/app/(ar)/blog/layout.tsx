import type { Metadata } from "next";
import { socialMetadata } from "@/lib/seo";
import { getVisitorCountry } from "@/lib/countries/server";
import { activeCountryCodes } from "@/lib/countries/settings";
import { publicCopy } from "@/lib/public-copy";
import { countryConfig } from "@/lib/countries";
import { absoluteUrl, seoAlternates } from "@/lib/site-paths";

/** One blog per country: /blog and /sa/blog */
export async function generateMetadata(): Promise<Metadata> {
  const country = await getVisitorCountry();
  return {
  title: `المدونة: نصائح للزواج بالحلال ${countryConfig(country).inName}`,
  description:
    "نصائح عملية وقصص نجاح ملهمة حول الحياة الزوجية والبحث عن شريك الحياة بالحلال — مقالات من فريق نصيبك",
  alternates: seoAlternates("/blog", country, await activeCountryCodes()),
  ...socialMetadata({
    title: "المدونة | نصيبك",
    description: "نصائح عملية وقصص نجاح ملهمة حول الحياة الزوجية والبحث عن شريك الحياة بالحلال",
    url: absoluteUrl("/blog", country),
    locale: publicCopy(country).ogLocale,
  }),
  };
}

export default function BlogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
