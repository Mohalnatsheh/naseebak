import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { activeCountryCodes } from "@/lib/countries/settings";
import { absoluteUrl, seoAlternates } from "@/lib/site-paths";

/** Pages that exist once per country: every country's URL, each listing the others (hreflang) */
const LOCALIZED: { path: string; changeFrequency: "weekly" | "monthly" | "yearly"; priority: number }[] = [
  { path: "/", changeFrequency: "weekly", priority: 1.0 },
  { path: "/about", changeFrequency: "monthly", priority: 0.8 },
  { path: "/faq", changeFrequency: "monthly", priority: 0.7 },
  { path: "/contact", changeFrequency: "monthly", priority: 0.6 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
  { path: "/refund-policy", changeFrequency: "yearly", priority: 0.3 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://naseebak.com";

  // Only the countries switched on in Admin → Countries are listed
  const countries = await activeCountryCodes();
  const localizedPages: MetadataRoute.Sitemap = LOCALIZED.flatMap((p) =>
    countries.map((c) => ({
      url: absoluteUrl(p.path, c),
      lastModified: new Date(),
      changeFrequency: p.changeFrequency,
      priority: p.priority,
      alternates: { languages: seoAlternates(p.path, c, countries).languages },
    }))
  );
  const staticPages: MetadataRoute.Sitemap = [
    ...localizedPages,
    { url: `${baseUrl}/blog`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
    { url: `${baseUrl}/login`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.5 },
    { url: `${baseUrl}/register`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.6 },
  ];

  let blogPages: MetadataRoute.Sitemap = [];
  try {
    const posts = await db.blogPost.findMany({
      where: { status: "PUBLISHED" },
      select: { slug: true, updatedAt: true },
      orderBy: { publishedAt: "desc" },
    });

    blogPages = posts.map((post) => ({
      url: `${baseUrl}/blog/${post.slug}`,
      lastModified: post.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    }));
  } catch {
    // If DB is unavailable during build, return static pages only
  }

  return [...staticPages, ...blogPages];
}
