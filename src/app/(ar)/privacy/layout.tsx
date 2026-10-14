import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "سياسة الخصوصية",
  description:
    "كيف نحمي بياناتك الشخصية وخصوصيتك على منصة نصيبك — التزامنا بحماية معلوماتك وتشفير بياناتك بأعلى المعايير",
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
