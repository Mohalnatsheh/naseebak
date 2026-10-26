import type { Metadata } from "next";
import { getVisitorCountry } from "@/lib/countries/server";
import { publicCopy } from "@/lib/public-copy";

/** Open Graph text and locale follow the visitor's country */
export async function generateMetadata(): Promise<Metadata> {
  const copy = publicCopy(await getVisitorCountry());
  return {
    title: "شروط الاستخدام",
    description:
      "اقرأ شروط استخدام منصة نصيبك والتزاماتنا تجاه المستخدمين وحقوقك كمستخدم في منصة تيسير الزواج بالحلال",
    alternates: { canonical: "https://naseebak.com/terms" },
    openGraph: {
      title: "شروط الاستخدام | نصيبك",
      description: `شروط استخدام منصة نصيبك لتيسير الزواج بالحلال ${copy.inCountry}`,
      url: "https://naseebak.com/terms",
      locale: copy.ogLocale,
    },
  };
}

export default function TermsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
