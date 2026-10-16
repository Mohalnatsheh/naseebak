import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "سياسة الخصوصية",
  description:
    "ما البيانات التي تجمعها منصة نصيبك، وكيف نستخدمها ونحميها، ومن يطّلع عليها، وكيف تحذف حسابك — بما في ذلك الصور وبيانات ولي الأمر ورسائل المحادثة",
  alternates: { canonical: "https://naseebak.com/privacy" },
  openGraph: {
    title: "سياسة الخصوصية | نصيبك",
    description:
      "كيف نحمي بياناتك الشخصية وخصوصيتك على منصة نصيبك لتيسير الزواج بالحلال",
    url: "https://naseebak.com/privacy",
  },
};

export default function PrivacyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
