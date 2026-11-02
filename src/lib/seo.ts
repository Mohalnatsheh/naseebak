import type { Metadata } from "next";

export const SITE_NAME = "نصيبك";

/**
 * Open Graph + Twitter card for one page. A page's `openGraph` / `twitter` replace the layout's
 * entirely (Next merges metadata one key deep), so without this every page lost og:site_name and
 * og:type and showed the home page's title and description on X. The share image still comes from
 * the opengraph-image / twitter-image files of the (ar) layout.
 */
export function socialMetadata({
  title,
  description,
  url,
  locale,
  article,
  image,
}: {
  title: string;
  description: string;
  url: string;
  locale?: string;
  /** A blog post: og:type article with its dates and section */
  article?: { publishedTime?: string; modifiedTime?: string; section?: string };
  /** Pages under a dynamic segment (blog posts) don't get the layout's image files: pass one */
  image?: { url: string; width: number; height: number; alt: string };
}): Pick<Metadata, "openGraph" | "twitter"> {
  const common = { siteName: SITE_NAME, title, description, url, ...(locale && { locale }), ...(image && { images: [image] }) };
  return {
    openGraph: article ? { ...common, type: "article", ...article } : { ...common, type: "website" },
    twitter: { card: "summary_large_image", title, description, ...(image && { images: [image] }) },
  };
}
