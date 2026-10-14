import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "شروط الاستخدام",
  description:
    "اقرأ شروط استخدام منصة نصيبك والتزاماتنا تجاه المستخدمين وحقوقك كمستخدم في منصة تيسير الزواج بالحلال",
  alternates: { canonical: "https://naseebak.com/terms" },
  openGraph: {
    title: "شروط الاستخدام | نصيبك",
    description: "شروط استخدام منصة نصيبك لتيسير الزواج بالحلال في الأردن",
    url: "https://naseebak.com/terms",
  },
};

export default function TermsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
