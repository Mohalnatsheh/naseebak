/**
 * Published blog reads, shared by the public API (/api/blog/*) and the server-rendered blog pages,
 * so the article text and post links are in the page HTML search engines receive.
 */
import { cache } from "react";
import { db } from "@/lib/db";
import type { CountryCode } from "@/lib/countries";

export const BLOG_PAGE_SIZE = 9;

/** One published post with its category; with `country`, only in that country's blog (cached per request: metadata, layout and page share it) */
export const getPublishedPost = cache((slug: string, country?: CountryCode) =>
  db.blogPost.findUnique({
    where: { slug, status: "PUBLISHED", ...(country && { country }) },
    include: { category: true },
  })
);

export async function listPublishedPosts({ country = "JO", category, page = 1, pageSize = BLOG_PAGE_SIZE }: { country?: CountryCode; category?: string | null; page?: number; pageSize?: number }) {
  const where = { status: "PUBLISHED" as const, country, ...(category ? { category: { slug: category } } : {}) };
  const [posts, total] = await Promise.all([
    db.blogPost.findMany({
      where,
      include: { category: true },
      orderBy: { publishedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.blogPost.count({ where }),
  ]);
  return { posts, page, totalPages: Math.ceil(total / pageSize), total };
}

/** Slug and title of a country's published posts, to link mentions of one post in another */
export function listPublishedPostTitles(country: CountryCode) {
  return db.blogPost.findMany({ where: { status: "PUBLISHED", country }, orderBy: { publishedAt: "desc" }, select: { slug: true, title: true } });
}

/** Every category (shown even with no published post) with its published-post count in a country */
export function listBlogCategories(country: CountryCode = "JO") {
  return db.blogCategory.findMany({
    include: { _count: { select: { posts: { where: { status: "PUBLISHED", country } } } } },
    orderBy: { createdAt: "asc" },
  });
}

/** Post text for a meta description: the excerpt, or the start of the text cut at a word (≤ 160 chars) */
export function postDescription(post: { excerpt: string | null; content: string }): string {
  const text = (post.excerpt || post.content).replace(/\s+/g, " ").trim();
  if (text.length <= 160) return text;
  const cut = text.slice(0, 157);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 100 ? cut.lastIndexOf(" ") : 157)}…`;
}
