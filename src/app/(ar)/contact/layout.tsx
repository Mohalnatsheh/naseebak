import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "تواصل معنا",
  description:
    "تواصل مع فريق نصيبك للإجابة على استفساراتك حول منصة تيسير الزواج بالحلال في الأردن. نحن هنا لمساعدتك",
  alternates: { canonical: "https://naseebak.com/contact" },
  openGraph: {
    title: "تواصل معنا | نصيبك",
    description:
      "تواصل مع فريق نصيبك للإجابة على استفساراتك حول منصة تيسير الزواج بالحلال",
    url: "https://naseebak.com/contact",
  },
};

export default function ContactLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
