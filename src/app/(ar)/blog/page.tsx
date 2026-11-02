import { listBlogCategories, listPublishedPosts } from "@/lib/blog";
import BlogView, { type BlogInitial } from "./blog-view";

/**
 * Server-rendered first page (all categories) so the post links are in the HTML search engines read;
 * the filters and pages after it load in the browser.
 */
export default async function BlogPage() {
  let initial: BlogInitial = { categories: [], posts: [], totalPages: 1 };
  try {
    const [categories, list] = await Promise.all([listBlogCategories(), listPublishedPosts({ page: 1 })]);
    // Dates become strings, exactly as the API sends them
    initial = JSON.parse(JSON.stringify({ categories, posts: list.posts, totalPages: Math.max(1, list.totalPages) }));
  } catch (error) {
    console.error("Blog page error:", error);
  }
  return <BlogView initial={initial} />;
}
