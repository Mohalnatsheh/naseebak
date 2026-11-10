/**
 * Blog covers (design review DS-19): every post used the same photo. Each post now gets one of the site's own brand
 * photos — hands, homes, objects and Amman scenery, never a face — picked from its slug, so a post keeps its cover
 * on every visit and neighbouring posts differ. No new photos. Db-free.
 */
export const BLOG_COVERS = [
  "/images/pages/post.webp",
  "/images/landing/family.webp",
  "/images/pages/about.webp",
  "/images/landing/privacy.webp",
  "/images/pages/faq.webp",
  "/images/landing/hero.webp",
  "/images/pages/contact.webp",
  "/images/landing/cta.webp",
  "/images/pages/blog.webp",
  "/images/landing/profile.webp",
] as const;

export function blogCover(slug: string): string {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return BLOG_COVERS[h % BLOG_COVERS.length];
}
