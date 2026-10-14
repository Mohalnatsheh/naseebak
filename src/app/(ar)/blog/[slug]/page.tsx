"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Calendar, Clock, BookOpen } from "lucide-react";

/* ──────────────────── Types ──────────────────── */

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  readTime: string | null;
  publishedAt: string | null;
  category: { slug: string; nameAr: string };
}

/* ──────────────────── Gradient Map ──────────────────── */

const categoryGradients: Record<string, string> = {
  tips: "from-primary/20 via-blue-500/10 to-primary/5",
  stories: "from-secondary/20 via-blue-400/10 to-secondary/5",
  development: "from-accent/20 via-amber-500/10 to-accent/5",
  family: "from-primary/20 via-indigo-500/10 to-primary/5",
};

const defaultGradient = "from-primary/20 via-secondary/10 to-primary/5";

/* ──────────────────── Helpers ──────────────────── */

function formatDate(dateStr: string | null) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("ar-JO", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/* ══════════════════════════════════════════════════════ */
/*                   BLOG DETAIL PAGE                     */
/* ══════════════════════════════════════════════════════ */

export default function BlogDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function fetchPost() {
      try {
        const res = await fetch(`/api/blog/${slug}`);
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        const data = await res.json();
        setPost(data.post);
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }
    fetchPost();
  }, [slug]);

  return (
    <>
      <Navbar />

      <main className="overflow-hidden">
        {loading ? (
          /* ── Loading state ── */
          <div className="pt-20">
            <div className="h-64 bg-gradient-to-bl from-primary/10 to-secondary/5 animate-pulse" />
            <div className="container mx-auto max-w-3xl px-4 py-12 space-y-4">
              <div className="h-8 w-3/4 bg-muted animate-pulse rounded" />
              <div className="h-4 w-1/2 bg-muted animate-pulse rounded" />
              <div className="space-y-3 mt-8">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-4 bg-muted animate-pulse rounded" style={{ width: `${85 + Math.random() * 15}%` }} />
                ))}
              </div>
            </div>
          </div>
        ) : notFound ? (
          /* ── 404 state ── */
          <div className="flex flex-col items-center justify-center min-h-[60vh] pt-20 text-center">
            <BookOpen className="size-16 text-muted-foreground/50 mb-4" />
            <h1 className="text-2xl font-bold mb-2">المقال غير موجود</h1>
            <p className="text-muted-foreground mb-6">لم نتمكن من العثور على المقال المطلوب.</p>
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 text-primary font-semibold hover:underline"
            >
              <ArrowRight className="size-4" />
              العودة للمدونة
            </Link>
          </div>
        ) : post && (
          <>
            {/* ═══════════════ MINI HERO ═══════════════ */}
            <section className={`relative pt-20 bg-gradient-to-bl ${categoryGradients[post.category.slug] || defaultGradient}`}>
              <div className="container mx-auto max-w-3xl px-4 py-16">
                {/* Back link */}
                <Link
                  href="/blog"
                  className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-8"
                >
                  <ArrowRight className="size-4" />
                  العودة للمدونة
                </Link>

                {/* Category badge */}
                <Badge className="mb-4 bg-background/90 backdrop-blur-sm text-foreground border-border/50">
                  {post.category.nameAr}
                </Badge>

                {/* Title */}
                <h1 className="text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl mb-6">
                  {post.title}
                </h1>

                {/* Meta info */}
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="size-4" />
                    {formatDate(post.publishedAt)}
                  </span>
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
                <div className="prose prose-lg max-w-none text-foreground leading-relaxed whitespace-pre-wrap">
                  {post.content}
                </div>
              </div>
            </section>

            {/* ═══════════════ BACK LINK ═══════════════ */}
            <section className="pb-16">
              <div className="container mx-auto max-w-3xl px-4">
                <Link
                  href="/blog"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline transition-colors"
                >
                  <ArrowRight className="size-4" />
                  العودة للمدونة
                </Link>
              </div>
            </section>
          </>
        )}
      </main>

      <Footer />
    </>
  );
}
