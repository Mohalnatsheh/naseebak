import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "من نحن",
  description:
    "تعرّف على قصة نصيبك ورسالتنا في تيسير الزواج بالحلال في الأردن — تقنية حديثة مع عادات أردنية أصيلة، بسترة واحترام",
  alternates: { canonical: "https://naseebak.com/about" },
  openGraph: {
    title: "من نحن | نصيبك",
    description:
      "تعرّف على قصة نصيبك ورسالتنا في تيسير الزواج بالحلال في الأردن",
    url: "https://naseebak.com/about",
  },
};

export default function AboutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
