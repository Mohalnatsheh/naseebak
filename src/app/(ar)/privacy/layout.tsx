import type { Metadata } from "next";
import { getVisitorCountry } from "@/lib/countries/server";
import { publicCopy } from "@/lib/public-copy";
import { absoluteUrl, seoAlternates } from "@/lib/site-paths";

/** Per country URL (/privacy, /sa/privacy) with hreflang alternates */
export async function generateMetadata(): Promise<Metadata> {
  const country = await getVisitorCountry();
  const copy = publicCopy(country);
  return {
  title: "سياسة الخصوصية",
  description:
    "ما البيانات التي تجمعها منصة نصيبك، وكيف نستخدمها ونحميها، ومن يطّلع عليها، وكيف تحذف حسابك — بما في ذلك الصور وبيانات ولي الأمر ورسائل المحادثة",
  alternates: seoAlternates("/privacy", country),
  openGraph: {
    title: "سياسة الخصوصية | نصيبك",
    description:
      "كيف نحمي بياناتك الشخصية وخصوصيتك على منصة نصيبك لتيسير الزواج بالحلال",
    url: absoluteUrl("/privacy", country),
    locale: copy.ogLocale,
  },
  };
}

export default function PrivacyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
