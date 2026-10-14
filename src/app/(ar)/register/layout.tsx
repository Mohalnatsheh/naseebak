import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "إنشاء حساب",
  description:
    "سجّل الآن مجاناً في منصة نصيبك وابدأ رحلتك للبحث عن شريك العمر بالحلال — منصة أردنية لتيسير الزواج",
  alternates: { canonical: "https://naseebak.com/register" },
  openGraph: {
    title: "إنشاء حساب | نصيبك",
    description:
      "سجّل الآن مجاناً في منصة نصيبك وابدأ رحلتك للبحث عن شريك العمر بالحلال — منصة أردنية لتيسير الزواج",
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
