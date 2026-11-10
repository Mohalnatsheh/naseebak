import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizeCss: true,
    // Hostinger shared hosting (CloudLinux LVE) kills large worker pools; keep build parallelism low
    cpus: 2,
  },
  // Server-only Ably SDK is loaded from node_modules, not bundled (its got/keyv deps use dynamic requires).
  // ffmpeg-static exports its binary's path from its own __dirname: bundled, that path would point into .next
  serverExternalPackages: ["ably", "heic-convert", "ffmpeg-static"],
  // Identity verification was removed; old links (e.g. notifications) go to the dashboard
  async redirects() {
    return [
      { source: "/dashboard/identity", destination: "/dashboard", permanent: false },
      // Sign-in is by phone code: these old pages only sent visitors to /login, from the browser (QA PA-M2)
      { source: "/forgot-password", destination: "/login", permanent: false },
      { source: "/reset-password", destination: "/login", permanent: false },
    ];
  },
  /**
   * Caching (QA PA-L6, 2026-11-11). Every API answer is personal unless it says otherwise: `private, no-store` by
   * default, so no browser or proxy keeps a member's data. These headers override a route's own, so the public routes
   * that set theirs (countries, registration status, tracking) are left out of the default; the public blog list and
   * stats (the country is in the URL) are cached briefly.
   * Site images in /public/images change rarely: a week, revalidated in the background.
   */
  async headers() {
    const cache = (value: string) => [{ key: "Cache-Control", value }];
    return [
      {
        source: "/api/:path((?!countries(?:/|$)|settings/registration-status$|settings/tracking$|blog(?:/|$)|stats/public$).*)",
        headers: cache("private, no-store"),
      },
      { source: "/api/blog", headers: cache("public, max-age=60, stale-while-revalidate=300") },
      { source: "/api/blog/:path*", headers: cache("public, max-age=60, stale-while-revalidate=300") },
      { source: "/api/stats/public", headers: cache("public, max-age=300, stale-while-revalidate=600") },
      { source: "/images/:path*", headers: cache("public, max-age=604800, stale-while-revalidate=86400") },
    ];
  },
  // Saudi URLs (src/lib/site-paths.ts LOCALIZED_PATHS, blog posts and poll questions): src/proxy.ts tells the page the country, this finds the page
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/sa", destination: "/" },
        ...["/faq", "/about", "/contact", "/terms", "/privacy", "/refund-policy", "/blog", "/blog/:slug", "/poll", "/poll/:slug"].map((path) => ({ source: `/sa${path}`, destination: path })),
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  images: {
    // Optimised site images (member photos are `unoptimized`): a week instead of Next's 4 hours (QA PA-L6)
    minimumCacheTTL: 604800,
    remotePatterns: [
      { protocol: "https", hostname: "cdn.naseebak.com" },
    ],
  },
};

export default nextConfig;
