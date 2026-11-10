import { notFound } from "next/navigation";
import Link from "@/components/shared/site-link";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { Badge } from "@/components/ui/badge";
import Image from "next/image";
import { blogCover } from "@/lib/blog-covers";
import { ArrowRight, Calendar, Clock } from "lucide-react";
import { PostContent } from "@/components/blog/post-content";
import { formatDate, type CountryCode } from "@/lib/countries";
import { getVisitorCountry } from "@/lib/countries/server";
import { getPublishedPost, listPublishedPostTitles } from "@/lib/blog";
import { relatedPosts } from "@/lib/blog-content";

/* ──────────────────── Helpers ──────────────────── */

const postDate = (date: Date | null, country: CountryCode) =>
  date ? formatDate(date, country, { year: "numeric", month: "long", day: "numeric" }) : "";

/* ══════════════════════════════════════════════════════ */
/*                   BLOG DETAIL PAGE                     */
/* ══════════════════════════════════════════════════════ */

/** Rendered on the server so the article text is in the HTML search engines and link previews read */
export default async function BlogDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const country = await getVisitorCountry();
  const post = await getPublishedPost(slug, country);
  if (!post) notFound();
  const allPosts = await listPublishedPostTitles(country);
  const otherPosts = allPosts.filter((other) => other.slug !== post.slug);
  const related = relatedPosts(allPosts, post.slug);
  // Worth showing once the text really changed after publishing
  const updated = post.publishedAt && post.updatedAt.getTime() - post.publishedAt.getTime() > 24 * 60 * 60 * 1000 ? post.updatedAt : null;

  return (
    <>
      <Navbar />

      <main id="main" tabIndex={-1} className="overflow-hidden">
        {/* ═══════════════ MINI HERO ═══════════════ */}
        {/* The landing look (P2-7): the navy night over the post's own cover (DS-19), the gold star tile on top */}
        <section className="landing-night relative overflow-hidden pt-20 text-white">
          <Image src={blogCover(post.slug)} alt="" fill priority sizes="100vw" className="object-cover opacity-20" aria-hidden />
          <div className="landing-khatam absolute inset-0" aria-hidden />
          <div className="container relative mx-auto max-w-3xl px-4 py-16">
            {/* Back link */}
            <Link
              href="/blog"
              className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-white/75 hover:text-white transition-colors mb-8"
            >
              <ArrowRight className="size-4" />
              العودة للمدونة
            </Link>

            {/* Category badge */}
            <Badge className="mb-4 border-accent/40 bg-white/10 text-accent backdrop-blur-sm">
              {post.category.nameAr}
            </Badge>

            {/* Title */}
            <h1 className="text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl mb-6">
              {post.title}
            </h1>

            {/* Meta info */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/75">
              <span>فريق نصيبك</span>
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="size-4" />
                {postDate(post.publishedAt, country)}
              </span>
              {updated && <span>آخر تحديث: {postDate(updated, country)}</span>}
              {post.readTime && (
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="size-4" />
                  {post.readTime}
                </span>
              )}
            </div>
          </div>
        </section>

        {/* ═══════════════ CONTENT ═══════════════ */}
        <section className="py-12">
          <div className="container mx-auto max-w-3xl px-4">
            <PostContent title={post.title} content={post.content} otherPosts={otherPosts} />
            {related.length > 0 && (
              <nav aria-label="مقالات أخرى" className="mt-12 border-t pt-8">
                <h2 className="mb-4 text-xl font-bold">اقرأ أيضاً</h2>
                <ul className="space-y-3">
                  {related.map((p) => (
                    <li key={p.slug}>
                      <Link href={`/blog/${p.slug}`} className="font-medium text-primary hover:underline">
                        {p.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
          </div>
        </section>

        {/* ═══════════════ BACK LINK ═══════════════ */}
        <section className="pb-16">
          <div className="container mx-auto max-w-3xl px-4">
            <Link
              href="/blog"
              className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary hover:underline transition-colors"
            >
              <ArrowRight className="size-4" />
              العودة للمدونة
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
