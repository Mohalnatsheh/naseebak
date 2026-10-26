import type { Metadata, Viewport } from "next";
import type { CountryCode } from "@/lib/countries";
import { Cairo } from "next/font/google";
import "../globals.css";
import PublicTracking from "@/components/shared/public-tracking";
import { connection } from "next/server";
import { auth } from "@/lib/auth";
import { getMaintenanceState } from "@/lib/settings";
import { MaintenanceScreen } from "@/components/shared/maintenance-screen";
import { getVisitorCountry } from "@/lib/countries/server";
import { publicCopy } from "@/lib/public-copy";
import { VisitorCountryProvider } from "@/components/shared/visitor-country";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

/** Description, keywords and Open Graph locale follow the visitor's country (Jordan by default) */
export async function generateMetadata(): Promise<Metadata> {
  const copy = publicCopy(await getVisitorCountry());
  return {
    ...baseMetadata,
    description: copy.description,
    keywords: copy.keywords,
    openGraph: { ...baseMetadata.openGraph, locale: copy.ogLocale, description: copy.description },
    twitter: { ...baseMetadata.twitter, description: copy.shortDescription },
  };
}

const baseMetadata = {
  metadataBase: new URL("https://naseebak.com"),
  title: {
    default: "نصيبك - نوصّلك بشريك العمر بالحلال",
    template: "%s | نصيبك",
  },
  alternates: { canonical: "https://naseebak.com" },
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
  // iPhone home-screen app: full screen with the brand name under the icon
  appleWebApp: { capable: true, title: "نصيبك", statusBarStyle: "default" },
  openGraph: {
    type: "website",
    url: "https://naseebak.com",
    siteName: "نصيبك",
    title: "نصيبك - نوصّلك بشريك العمر بالحلال",
  },
  twitter: {
    card: "summary_large_image",
    title: "نصيبك - نوصّلك بشريك العمر بالحلال",
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
} satisfies Metadata;

// iPhone: without viewport-fit=cover every env(safe-area-inset-*) is 0, so the bottom bars
// (dashboard tabs, chat box, landing start bar) sat under the home indicator in the installed app
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

function organizationJsonLd(country: CountryCode) {
  const copy = publicCopy(country);
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "نصيبك",
    alternateName: "Naseebak",
    url: "https://naseebak.com",
    logo: "https://naseebak.com/images/logo.svg",
    description: copy.shortDescription,
    foundingDate: "2025",
    areaServed: copy.areaServed,
    sameAs: [],
  };
}

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

export default async function ArabicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Read the maintenance switch on every request (never frozen at build time)
  await connection();
  const maintenance = await getMaintenanceState();
  const isAdmin = maintenance.enabled ? (await auth())?.user?.role === "ADMIN" : false;
  const showMaintenance = maintenance.enabled && !isAdmin;
  const country = await getVisitorCountry();

  return (
    <html lang="ar" dir="rtl">
      <body className={`${cairo.className} antialiased`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationJsonLd(country)),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
        {/* GA4, GTM, Meta Pixel — public pages only (never the dashboard, chats or admin) */}
        <PublicTracking />
        <VisitorCountryProvider country={country}>
          {showMaintenance ? (
            <MaintenanceScreen message={maintenance.message} />
          ) : (
            <>
              {maintenance.enabled && (
                <div className="sticky top-0 z-[100] bg-amber-500 px-4 py-1.5 text-center text-xs font-bold text-white">
                  وضع الصيانة مفعّل — الزوار يرون صفحة الصيانة، وأنت ترى الموقع لأنك مسؤول
                </div>
              )}
              {children}
            </>
          )}
        </VisitorCountryProvider>
      </body>
    </html>
  );
}
