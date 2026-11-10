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
    remotePatterns: [
      { protocol: "https", hostname: "cdn.naseebak.com" },
    ],
  },
};

export default nextConfig;
