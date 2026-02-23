import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizeCss: true,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cdn.naseebak.com" },
    ],
  },
};

export default nextConfig;
