import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // No trailing slash: "/dashboard" itself is private too
        disallow: ["/dashboard", "/admin", "/api/", "/payments/"],
      },
    ],
    sitemap: "https://naseebak.com/sitemap.xml",
  };
}
