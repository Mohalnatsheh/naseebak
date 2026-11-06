import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { toCountry } from "@/lib/countries";
import { activeCountryCodes } from "@/lib/countries/settings";
import { absoluteUrl, seoAlternates } from "@/lib/site-paths";
import { pollsEnabled } from "@/lib/engagement/polls";

/**
 * Pages that exist once per country: every country's URL, each listing the others (hreflang).
 * Static pages carry no lastmod: a fresh "now" on every request taught search engines to ignore it.
 */
const LOCALIZED: { path: string; changeFrequency: "weekly" | "monthly" | "yearly"; priority: number }[] = [
  { path: "/", changeFrequency: "weekly", priority: 1.0 },
  { path: "/about", changeFrequency: "monthly", priority: 0.8 },
  { path: "/faq", changeFrequency: "monthly", priority: 0.7 },
  { path: "/contact", changeFrequency: "monthly", priority: 0.6 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
  { path: "/refund-policy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/blog", changeFrequency: "weekly", priority: 0.8 },
];

// Rebuilt hourly: built only once at deploy before, so new blog posts and countries were missing until the next deploy
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://naseebak.com";

  // Only the countries switched on in Admin → Countries are listed
  const countries = await activeCountryCodes();
  const localizedPages: MetadataRoute.Sitemap = LOCALIZED.flatMap((p) =>
    countries.map((c) => ({
      url: absoluteUrl(p.path, c),
      changeFrequency: p.changeFrequency,
      priority: p.priority,
      alternates: { languages: seoAlternates(p.path, c, countries).languages },
    }))
  );
  let blogPages: MetadataRoute.Sitemap = [];
  let polls = false;
  try {
    polls = await pollsEnabled();
  } catch {
    // Settings unavailable: leave the poll page out
  }
  try {
    const posts = await db.blogPost.findMany({
      where: { status: "PUBLISHED", country: { in: countries } },
      select: { slug: true, country: true, updatedAt: true },
      orderBy: { publishedAt: "desc" },
    });

    blogPages = posts.map((post) => ({
      url: absoluteUrl(`/blog/${post.slug}`, toCountry(post.country)),
      lastModified: post.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    }));
    // Each country's blog list changes with its own posts
    for (const page of localizedPages) {
      const list = countries.find((c) => page.url === absoluteUrl("/blog", c));
      const updated = list && posts.filter((p) => p.country === list).reduce<Date | undefined>((max, p) => (!max || p.updatedAt > max ? p.updatedAt : max), undefined);
      if (updated) page.lastModified = updated;
    }
  } catch {
    // If DB is unavailable during build, return static pages only
  }

  const staticPages: MetadataRoute.Sitemap = [
    ...localizedPages,
    ...(polls ? [{ url: `${baseUrl}/poll`, changeFrequency: "daily" as const, priority: 0.5 }] : []),
    { url: `${baseUrl}/login`, changeFrequency: "yearly", priority: 0.4 },
    { url: `${baseUrl}/register`, changeFrequency: "yearly", priority: 0.6 },
  ];

  return [...staticPages, ...blogPages];
}
