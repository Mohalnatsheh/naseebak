import type { Metadata } from "next";
import { getVisitorCountry } from "@/lib/countries/server";
import { publicCopy } from "@/lib/public-copy";
import { socialMetadata } from "@/lib/seo";
import type { CountryCode } from "@/lib/countries";

/** «منصة أردنية لتيسير الزواج» … Lebanon names no nationality */
const PLATFORM: Record<CountryCode, string> = {
  JO: "منصة أردنية لتيسير الزواج",
  SA: "منصة سعودية لتيسير الزواج",
  LB: "منصة لتيسير الزواج في لبنان",
};

/** Description and Open Graph locale follow the visitor's country */
export async function generateMetadata(): Promise<Metadata> {
  const country = await getVisitorCountry();
  const description = `سجّل الآن مجاناً في منصة نصيبك وابدأ رحلتك للبحث عن شريك العمر بالحلال — ${PLATFORM[country]}`;
  return {
    title: "إنشاء حساب",
    description,
    alternates: { canonical: "https://naseebak.com/register" },
    ...socialMetadata({
      title: "إنشاء حساب | نصيبك",
      description,
      url: "https://naseebak.com/register",
      locale: publicCopy(country).ogLocale,
    }),
  };
}

export default function RegisterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
