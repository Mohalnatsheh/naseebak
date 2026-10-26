import type { Metadata } from "next";
import { getVisitorCountry } from "@/lib/countries/server";
import { publicCopy } from "@/lib/public-copy";

/** Description and Open Graph locale follow the visitor's country */
export async function generateMetadata(): Promise<Metadata> {
  const country = await getVisitorCountry();
  const copy = publicCopy(country);
  return {
    title: "من نحن",
    description:
      country === "SA"
        ? "تعرّف على قصة نصيبك ورسالتنا في تيسير الزواج بالحلال في المملكة العربية السعودية — تقنية حديثة تحترم عاداتنا وقيمنا، بستر واحترام"
        : "تعرّف على قصة نصيبك ورسالتنا في تيسير الزواج بالحلال في الأردن — تقنية حديثة مع عادات أردنية أصيلة، بسترة واحترام",
    alternates: { canonical: "https://naseebak.com/about" },
    openGraph: {
      title: "من نحن | نصيبك",
      description: `تعرّف على قصة نصيبك ورسالتنا في تيسير الزواج بالحلال ${copy.inCountry}`,
      url: "https://naseebak.com/about",
      locale: copy.ogLocale,
    },
  };
}

export default function AboutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
