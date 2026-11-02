import type { Metadata } from "next";
import { socialMetadata } from "@/lib/seo";

export const metadata: Metadata = {
  title: "تسجيل الدخول",
  description:
    "سجّل دخولك لحسابك على منصة نصيبك لتيسير الزواج بالحلال وتابع اقتراحاتك وتوافقاتك",
  alternates: { canonical: "https://naseebak.com/login" },
  ...socialMetadata({
    title: "تسجيل الدخول | نصيبك",
    description: "سجّل دخولك لحسابك على منصة نصيبك لتيسير الزواج بالحلال",
    url: "https://naseebak.com/login",
  }),
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
