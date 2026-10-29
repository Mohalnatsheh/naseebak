import type { Metadata } from "next";
import { getVisitorCountry } from "@/lib/countries/server";
import { publicCopy } from "@/lib/public-copy";

/** Description and Open Graph locale follow the visitor's country */
export async function generateMetadata(): Promise<Metadata> {
  const country = await getVisitorCountry();
  const description = `سجّل الآن مجاناً في منصة نصيبك وابدأ رحلتك للبحث عن شريك العمر بالحلال — منصة ${country === "SA" ? "سعودية" : "أردنية"} لتيسير الزواج`;
  return {
    title: "إنشاء حساب",
    description,
    alternates: { canonical: "https://naseebak.com/register" },
    openGraph: {
      title: "إنشاء حساب | نصيبك",
      description,
      url: "https://naseebak.com/register",
      locale: publicCopy(country).ogLocale,
    },
  };
}

export default function RegisterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
