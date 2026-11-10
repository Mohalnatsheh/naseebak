import type { Metadata } from "next";
import { getVisitorCountry } from "@/lib/countries/server";
import { activeCountryCodes } from "@/lib/countries/settings";
import { publicCopy } from "@/lib/public-copy";
import { countryConfig, type CountryCode } from "@/lib/countries";
import { absoluteUrl, seoAlternates } from "@/lib/site-paths";
import { socialMetadata } from "@/lib/seo";

const DESCRIPTION: Record<CountryCode, string> = {
  JO: "تعرّف على قصة نصيبك ورسالتنا في تيسير الزواج بالحلال في الأردن — تقنية حديثة مع عادات أردنية أصيلة، بستر واحترام",
  SA: "تعرّف على قصة نصيبك ورسالتنا في تيسير الزواج بالحلال في المملكة العربية السعودية — تقنية حديثة تحترم عاداتنا وقيمنا، بستر واحترام",
  LB: "تعرّف على قصة نصيبك ورسالتنا في تيسير الزواج بالحلال في لبنان — تقنية حديثة تحترم عاداتنا وقيمنا، بستر واحترام",
};

/** Description and Open Graph locale follow the visitor's country */
export async function generateMetadata(): Promise<Metadata> {
  const country = await getVisitorCountry();
  const copy = publicCopy(country);
  return {
    title: `من نحن: قصة نصيبك ورسالتنا ${countryConfig(country).inName}`,
    description: DESCRIPTION[country],
    alternates: seoAlternates("/about", country, await activeCountryCodes()),
    ...socialMetadata({
      title: "من نحن | نصيبك",
      description: `تعرّف على قصة نصيبك ورسالتنا في تيسير الزواج بالحلال ${copy.inCountry}`,
      url: absoluteUrl("/about", country),
      locale: copy.ogLocale,
    }),
  };
}

export default function AboutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
