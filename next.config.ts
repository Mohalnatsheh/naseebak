import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizeCss: true,
    // Hostinger shared hosting (CloudLinux LVE) kills large worker pools; keep build parallelism low
    cpus: 2,
  },
  // Server-only Ably SDK is loaded from node_modules, not bundled (its got/keyv deps use dynamic requires)
  serverExternalPackages: ["ably"],
  // Identity verification was removed; old links (e.g. notifications) go to the dashboard
  async redirects() {
    return [{ source: "/dashboard/identity", destination: "/dashboard", permanent: false }];
  },
  // Saudi URLs (src/lib/site-paths.ts LOCALIZED_PATHS): src/proxy.ts tells the page the country, this finds the page
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/sa", destination: "/" },
        ...["/faq", "/about", "/contact", "/terms", "/privacy", "/refund-policy"].map((path) => ({ source: `/sa${path}`, destination: path })),
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
