import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "تسجيل الدخول",
  description:
    "سجّل دخولك لحسابك على منصة نصيبك واستقبل اقتراحات التوافق المبنية على الذكاء الاصطناعي",
  alternates: { canonical: "https://naseebak.com/login" },
  openGraph: {
    title: "تسجيل الدخول | نصيبك",
    description: "سجّل دخولك لحسابك على منصة نصيبك لتيسير الزواج بالحلال",
    url: "https://naseebak.com/login",
  },
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
