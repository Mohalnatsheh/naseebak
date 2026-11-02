import type { Metadata } from "next";
import { socialMetadata } from "@/lib/seo";

export const metadata: Metadata = {
  title: "المدونة: نصائح للزواج بالحلال والحياة الزوجية",
  description:
    "نصائح عملية وقصص نجاح ملهمة حول الحياة الزوجية والبحث عن شريك الحياة بالحلال — مقالات من فريق نصيبك",
  alternates: { canonical: "https://naseebak.com/blog" },
  ...socialMetadata({
    title: "المدونة | نصيبك",
    description: "نصائح عملية وقصص نجاح ملهمة حول الحياة الزوجية والبحث عن شريك الحياة بالحلال",
    url: "https://naseebak.com/blog",
  }),
};

export default function BlogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
