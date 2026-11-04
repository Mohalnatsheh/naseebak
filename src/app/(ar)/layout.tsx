import type { Metadata, Viewport } from "next";
import type { CountryCode } from "@/lib/countries";
import { Cairo } from "next/font/google";
import "../globals.css";
import PublicTracking from "@/components/shared/public-tracking";
import { connection } from "next/server";
import { cookies, headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getMaintenanceState } from "@/lib/settings";
import { MaintenanceScreen } from "@/components/shared/maintenance-screen";
import { getGeoCountry, getVisitorCountry, hasCountryChoice } from "@/lib/countries/server";
import { activeCountryCodes } from "@/lib/countries/settings";
import { CountrySuggestBanner } from "@/components/shared/country-suggest-banner";
import { publicCopy } from "@/lib/public-copy";
import { VisitorCountryProvider } from "@/components/shared/visitor-country";
import { AppDownloadBanner } from "@/components/shared/app-download-banner";
import { APP_BANNER_COOKIE, isAndroidUserAgent, playStoreHref } from "@/lib/app-download";
import { getMobileConfig } from "@/lib/mobile-config";

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
  // No site-wide canonical: every page sets its own (localized pages: src/lib/site-paths.ts seoAlternates)
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
    "@id": "https://naseebak.com/#organization",
    name: "نصيبك",
    alternateName: "Naseebak",
    url: "https://naseebak.com",
    // Raster logo: Google's logo rules don't list SVG
    logo: "https://naseebak.com/images/icon-512.png",
    description: copy.shortDescription,
    foundingDate: "2025",
    areaServed: copy.areaServed,
    // The social accounts that exist (same env vars as the footer icons)
    sameAs: [
      process.env.NEXT_PUBLIC_SOCIAL_FACEBOOK,
      process.env.NEXT_PUBLIC_SOCIAL_X,
      process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM,
      process.env.NEXT_PUBLIC_SOCIAL_YOUTUBE,
    ].filter(Boolean),
  };
}

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": "https://naseebak.com/#website",
  name: "نصيبك",
  alternateName: "Naseebak",
  url: "https://naseebak.com",
  inLanguage: "ar",
  publisher: { "@id": "https://naseebak.com/#organization" },
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
  const [country, geoCountry, hasChoice, countries, requestHeaders, cookieStore] = await Promise.all([
    getVisitorCountry(),
    getGeoCountry(),
    hasCountryChoice(),
    activeCountryCodes(),
    headers(),
    cookies(),
  ]);
  // Android visitors get the Play Store bar until they close it (cookie, a week)
  const ua = requestHeaders.get("user-agent") ?? "";
  const appBannerHref =
    !showMaintenance && isAndroidUserAgent(ua) && !cookieStore.has(APP_BANNER_COOKIE)
      ? playStoreHref((await getMobileConfig()).android.storeUrl, "banner", ua)
      : null;

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
        {/* GA4 on public pages + dashboard (ids hidden), GTM + Meta Pixel public pages only, nothing in admin */}
        <PublicTracking />
        <VisitorCountryProvider country={country} countries={countries}>
          {showMaintenance ? (
            <MaintenanceScreen message={maintenance.message} />
          ) : (
            <>
              {maintenance.enabled && (
                <div className="sticky top-0 z-[100] bg-amber-500 px-4 py-1.5 text-center text-xs font-bold text-white">
                  وضع الصيانة مفعّل — الزوار يرون صفحة الصيانة، وأنت ترى الموقع لأنك مسؤول
                </div>
              )}
              {appBannerHref && <AppDownloadBanner href={appBannerHref} />}
              {children}
              <CountrySuggestBanner siteCountry={country} geoCountry={geoCountry} hasChoice={hasChoice} />
            </>
          )}
        </VisitorCountryProvider>
      </body>
    </html>
  );
}
