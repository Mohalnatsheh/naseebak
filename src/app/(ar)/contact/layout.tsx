import type { Metadata } from "next";
import { getVisitorCountry } from "@/lib/countries/server";
import { publicCopy } from "@/lib/public-copy";

/** Description and Open Graph locale follow the visitor's country */
export async function generateMetadata(): Promise<Metadata> {
  const copy = publicCopy(await getVisitorCountry());
  return {
    title: "تواصل معنا",
    description: `تواصل مع فريق نصيبك للإجابة على استفساراتك حول منصة تيسير الزواج بالحلال ${copy.inCountry}. نحن هنا لمساعدتك`,
    alternates: { canonical: "https://naseebak.com/contact" },
    openGraph: {
      title: "تواصل معنا | نصيبك",
      description: "تواصل مع فريق نصيبك للإجابة على استفساراتك حول منصة تيسير الزواج بالحلال",
      url: "https://naseebak.com/contact",
      locale: copy.ogLocale,
    },
  };
}

export default function ContactLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
