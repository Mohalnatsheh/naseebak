import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "إنشاء حساب",
  description:
    "سجّل الآن مجاناً في منصة نصيبك واحصل على 5 اقتراحات مجانية لشريك العمر — منصة أردنية لتيسير الزواج بالحلال",
  alternates: { canonical: "https://naseebak.com/register" },
  openGraph: {
    title: "إنشاء حساب | نصيبك",
    description:
      "سجّل الآن مجاناً في منصة نصيبك واحصل على 5 اقتراحات مجانية لشريك العمر",
    url: "https://naseebak.com/register",
  },
};

export default function RegisterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
