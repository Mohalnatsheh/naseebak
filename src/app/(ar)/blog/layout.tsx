import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "المدونة",
  description:
    "نصائح عملية وقصص نجاح ملهمة حول الحياة الزوجية والبحث عن شريك الحياة بالحلال — مقالات من فريق نصيبك",
  alternates: { canonical: "https://naseebak.com/blog" },
  openGraph: {
    title: "المدونة | نصيبك",
    description:
      "نصائح عملية وقصص نجاح ملهمة حول الحياة الزوجية والبحث عن شريك الحياة بالحلال",
    url: "https://naseebak.com/blog",
  },
};

export default function BlogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
