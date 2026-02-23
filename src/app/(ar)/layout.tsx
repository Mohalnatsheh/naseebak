import type { Metadata } from "next";
import { Cairo } from "next/font/google";
import "../globals.css";
import TrackingScripts from "@/components/shared/tracking-scripts";

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
  alternates: { canonical: "https://naseebak.com" },
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

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "نصيبك",
  alternateName: "Naseebak",
  url: "https://naseebak.com",
  logo: "https://naseebak.com/images/logo.svg",
  description:
    "منصة أردنية توصّل العائلات بالشريك الأنسب بالحلال — تقنية ذكية مع عادات أردنية أصيلة",
  foundingDate: "2025",
  areaServed: {
    "@type": "Country",
    name: "Jordan",
  },
  sameAs: [],
};

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "نصيبك",
  alternateName: "Naseebak",
  url: "https://naseebak.com",
  inLanguage: "ar",
  publisher: {
    "@type": "Organization",
    name: "نصيبك",
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationJsonLd),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
        <TrackingScripts />
        {children}
      </body>
    </html>
  );
}
