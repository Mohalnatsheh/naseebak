import type { Metadata } from "next";
import { getVisitorCountry } from "@/lib/countries/server";
import { activeCountryCodes } from "@/lib/countries/settings";
import { publicCopy } from "@/lib/public-copy";
import { absoluteUrl, seoAlternates } from "@/lib/site-paths";
import { socialMetadata } from "@/lib/seo";

/** Own canonical URL per country (/refund-policy, /sa/refund-policy) — it used to inherit the home page's */
export async function generateMetadata(): Promise<Metadata> {
  const country = await getVisitorCountry();
  const copy = publicCopy(country);
  return {
    title: "سياسة الاسترداد",
    description: `سياسة الدفع والاسترداد في منصة نصيبك لتيسير الزواج بالحلال ${copy.inCountry}: الباقات، الرصيد، ومتى يعود الرصيد`,
    alternates: seoAlternates("/refund-policy", country, await activeCountryCodes()),
    ...socialMetadata({
      title: "سياسة الاسترداد | نصيبك",
      description: `سياسة الدفع والاسترداد في منصة نصيبك ${copy.inCountry}`,
      url: absoluteUrl("/refund-policy", country),
      locale: copy.ogLocale,
    }),
  };
}

export default function RefundPolicyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
