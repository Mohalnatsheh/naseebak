import type { Metadata } from "next";
import { Cairo } from "next/font/google";
import "../globals.css";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://naseebak.com"),
  title: {
    default: "نصيبك - نوصّلك بشريك العمر بالحلال",
    template: "%s | نصيبك",
  },
  description:
    "منصة أردنية توصّل العائلات بالشريك الأنسب بالحلال — تقنية ذكية مع عادات أردنية أصيلة، بسترة واحترام",
  keywords: [
    "زواج",
    "زواج بالحلال",
    "نصيبك",
    "زواج أردني",
    "تعارف للزواج",
    "شريك الحياة",
    "زواج إسلامي",
    "خطبة",
    "الأردن",
  ],
  authors: [{ name: "نصيبك", url: "https://naseebak.com" }],
  creator: "نصيبك",
  publisher: "نصيبك",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/images/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/images/icon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  manifest: "/site.webmanifest",
  openGraph: {
    type: "website",
    locale: "ar_JO",
    url: "https://naseebak.com",
    siteName: "نصيبك",
    title: "نصيبك - نوصّلك بشريك العمر بالحلال",
    description:
      "منصة أردنية توصّل العائلات بالشريك الأنسب بالحلال — تقنية ذكية مع عادات أردنية أصيلة، بسترة واحترام",
  },
  twitter: {
    card: "summary_large_image",
    title: "نصيبك - نوصّلك بشريك العمر بالحلال",
    description:
      "منصة أردنية توصّل العائلات بالشريك الأنسب بالحلال — تقنية ذكية مع عادات أردنية أصيلة",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function ArabicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body className={`${cairo.className} antialiased`}>
        {children}
      </body>
    </html>
  );
}
