import type { Metadata } from "next";
import { getVisitorCountry } from "@/lib/countries/server";
import { activeCountryCodes } from "@/lib/countries/settings";
import { publicCopy } from "@/lib/public-copy";
import { countryConfig } from "@/lib/countries";
import { absoluteUrl, seoAlternates } from "@/lib/site-paths";
import { socialMetadata } from "@/lib/seo";

/** Description and Open Graph locale follow the visitor's country */
export async function generateMetadata(): Promise<Metadata> {
  const country = await getVisitorCountry();
  const copy = publicCopy(country);
  return {
    title: `تواصل معنا ${countryConfig(country).inName}`,
    description: `تواصل مع فريق نصيبك للإجابة عن استفساراتك حول منصة تيسير الزواج بالحلال ${copy.inCountry}. نحن هنا لمساعدتك`,
    alternates: seoAlternates("/contact", country, await activeCountryCodes()),
    ...socialMetadata({
      title: "تواصل معنا | نصيبك",
      description: "تواصل مع فريق نصيبك للإجابة عن استفساراتك حول منصة تيسير الزواج بالحلال",
      url: absoluteUrl("/contact", country),
      locale: copy.ogLocale,
    }),
  };
}

export default function ContactLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
