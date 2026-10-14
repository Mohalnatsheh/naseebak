"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { useInView } from "@/hooks/use-in-view";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Calendar, Clock, ArrowLeft, Heart, BookOpen, Users, Lightbulb, Home, ChevronLeft, ChevronRight } from "lucide-react";

/* ──────────────────── Types ──────────────────── */

interface Category {
  id: string;
  slug: string;
  nameAr: string;
  nameEn: string;
  _count: { posts: number };
}

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  status: string;
  readTime: string | null;
  publishedAt: string | null;
  category: { slug: string; nameAr: string };
}

/* ──────────────────── Icon/Gradient Maps ──────────────────── */

const categoryIcons: Record<string, typeof Heart> = {
  tips: Heart,
  stories: Users,
  development: Lightbulb,
  family: Home,
};

const categoryGradients: Record<string, string> = {
  tips: "from-primary/20 to-primary/10",
  stories: "from-secondary/20 to-secondary/10",
  development: "from-accent/20 to-accent/10",
  family: "from-primary/20 to-secondary/10",
};

const defaultGradient = "from-primary/20 to-secondary/20";

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
/*                     BLOG PAGE                         */
/* ══════════════════════════════════════════════════════ */

export default function BlogPage() {
  const [activeCategory, setActiveCategory] = useState("all");
  const [categories, setCategories] = useState<Category[]>([]);
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const articlesView = useInView(0.1);
  const ctaView = useInView(0.2);

  // Fetch categories on mount
  useEffect(() => {
    fetch("/api/blog/categories")
      .then((r) => r.json())
      .then((data) => setCategories(data.categories || []))
      .catch(() => {});
  }, []);

  // Fetch posts when category or page changes
  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (activeCategory !== "all") params.set("category", activeCategory);
      const res = await fetch(`/api/blog?${params}`);
      const data = await res.json();
      setPosts(data.posts || []);
      setTotalPages(data.totalPages || 1);
    } catch {
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, [activeCategory, page]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  function handleCategoryChange(slug: string) {
    setActiveCategory(slug);
    setPage(1);
  }

  return (
    <>
      <Navbar />

      <main className="overflow-hidden">
        {/* ═══════════════ HERO BANNER ═══════════════ */}
        <section className="relative min-h-[40vh] flex items-center justify-center pt-20">
          {/* Gradient background */}
          <div className="absolute inset-0 bg-gradient-to-bl from-primary/[0.08] via-background to-secondary/[0.06]" />
          <div
            className="absolute inset-0 opacity-30"
            style={{
              background:
                "radial-gradient(ellipse 80% 50% at 50% 0%, oklch(0.39 0.07 249 / 0.08), transparent), radial-gradient(ellipse 60% 40% at 80% 100%, oklch(0.48 0.06 249 / 0.06), transparent)",
            }}
          />

          {/* Decorative blurred orbs */}
          <div
            className="absolute top-20 start-10 h-56 w-56 rounded-full bg-primary/[0.06] blur-3xl animate-pulse"
            style={{ animationDuration: "8s" }}
          />
          <div
            className="absolute bottom-10 end-10 h-72 w-72 rounded-full bg-secondary/[0.08] blur-3xl animate-pulse"
            style={{ animationDuration: "10s" }}
          />

          <div className="container relative mx-auto max-w-7xl px-4 py-16 text-center">
            {/* Badge */}
            <div
              className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/[0.06] backdrop-blur-sm px-5 py-2 text-sm font-medium text-primary mb-6 shadow-sm"
              style={{ animation: "fadeSlideDown 0.8s ease-out both" }}
            >
              <BookOpen className="size-4" />
              المدونة
            </div>

            {/* Headline */}
            <h1
              className="mx-auto max-w-4xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl"
              style={{ animation: "fadeSlideUp 0.8s ease-out 0.2s both" }}
            >
              مقالات ونصائح{" "}
              <span className="bg-gradient-to-l from-primary via-secondary to-accent bg-clip-text text-transparent">
                للحياة الزوجية
              </span>
            </h1>

            {/* Description */}
            <p
              className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground"
              style={{ animation: "fadeSlideUp 0.8s ease-out 0.4s both" }}
            >
              نصائح عملية، قصص نجاح ملهمة، ومقالات متخصصة لمساعدتك في رحلة
              البحث عن شريك الحياة المناسب.
            </p>
          </div>
        </section>

        {/* ═══════════════ CATEGORY FILTER BAR ═══════════════ */}
        <div className="sticky top-16 z-40 bg-background/80 backdrop-blur-md border-b border-border/50 py-4">
          <div className="container mx-auto max-w-7xl px-4">
            <div className="flex flex-wrap items-center justify-center gap-2">
              {/* "All" button */}
              <button
                onClick={() => handleCategoryChange("all")}
                className={`inline-flex shrink-0 items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-all duration-300 ${
                  activeCategory === "all"
                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                    : "bg-muted/60 hover:bg-muted text-muted-foreground"
                }`}
              >
                <Sparkles className="size-4" />
                الكل
              </button>

              {/* Dynamic categories */}
              {categories.map((cat) => {
                const Icon = categoryIcons[cat.slug] || BookOpen;
                return (
                  <button
                    key={cat.id}
                    onClick={() => handleCategoryChange(cat.slug)}
                    className={`inline-flex shrink-0 items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-all duration-300 ${
                      activeCategory === cat.slug
                        ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                        : "bg-muted/60 hover:bg-muted text-muted-foreground"
                    }`}
                  >
                    <Icon className="size-4" />
                    {cat.nameAr}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ═══════════════ ARTICLES GRID ═══════════════ */}
        <section className="py-16">
          <div className="container mx-auto max-w-7xl px-4" ref={articlesView.ref}>
            {loading ? (
              /* Shimmer loading cards */
              <div className="mx-auto grid max-w-6xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Card key={i} className="overflow-hidden border-border/50 bg-card/80">
                    <div className="h-48 bg-muted animate-pulse" />
                    <CardContent className="pt-5 pb-6 space-y-3">
                      <div className="h-3 w-32 bg-muted animate-pulse rounded" />
                      <div className="h-5 w-full bg-muted animate-pulse rounded" />
                      <div className="h-4 w-3/4 bg-muted animate-pulse rounded" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : posts.length === 0 ? (
              <div className="py-20 text-center">
                <p className="text-lg text-muted-foreground">
                  لا توجد مقالات في هذا التصنيف حالياً.
                </p>
              </div>
            ) : (
              <div className="mx-auto grid max-w-6xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {posts.map((post, i) => {
                  const catSlug = post.category.slug;
                  const Icon = categoryIcons[catSlug] || BookOpen;
                  const gradient = categoryGradients[catSlug] || defaultGradient;

                  return (
                    <Card
                      key={post.id}
                      className={`group relative overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm transition-all duration-500 hover:translate-y-[-4px] hover:shadow-xl ${
                        articlesView.inView
                          ? "opacity-100 translate-y-0"
                          : "opacity-0 translate-y-8"
                      }`}
                      style={{
                        transitionDelay: articlesView.inView ? `${i * 100}ms` : "0ms",
                        transitionProperty: "all",
                      }}
                    >
                      {/* Image placeholder */}
                      <div className={`relative h-48 bg-gradient-to-bl ${gradient} flex items-center justify-center`}>
                        <Icon className="size-12 opacity-20 text-foreground" />
                        <Badge className="absolute top-3 start-3 bg-background/90 backdrop-blur-sm text-foreground border-border/50 text-xs">
                          {post.category.nameAr}
                        </Badge>
                      </div>

                      {/* Content */}
                      <CardContent className="pt-5 pb-6">
                        {/* Date + Read time */}
                        <div className="mb-3 flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5">
                            <Calendar className="size-3.5" />
                            {formatDate(post.publishedAt)}
                          </span>
                          {post.readTime && (
                            <span className="inline-flex items-center gap-1.5">
                              <Clock className="size-3.5" />
                              {post.readTime}
                            </span>
                          )}
                        </div>

                        {/* Title */}
                        <h3 className="mb-2 text-lg font-bold leading-snug line-clamp-2">
                          {post.title}
                        </h3>

                        {/* Excerpt */}
                        <p className="mb-4 text-sm leading-relaxed text-muted-foreground line-clamp-2">
                          {post.excerpt}
                        </p>

                        {/* Read more link */}
                        <Link
                          href={`/blog/${post.slug}`}
                          className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline transition-colors duration-200"
                        >
                          اقرأ المزيد
                          <ArrowLeft className="size-4 transition-transform duration-300 group-hover:-translate-x-1" />
                        </Link>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* Pagination */}
            {!loading && totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 mt-10">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronRight className="h-4 w-4 ml-1" />
                  السابق
                </Button>
                <span className="text-sm text-muted-foreground">
                  صفحة {page} من {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  التالي
                  <ChevronLeft className="h-4 w-4 mr-1" />
                </Button>
              </div>
            )}
          </div>
        </section>

        {/* ═══════════════ CTA STRIP ═══════════════ */}
        <section className="py-16">
          <div className="container mx-auto max-w-7xl px-4" ref={ctaView.ref}>
            <div
              className={`relative mx-auto max-w-4xl overflow-hidden rounded-3xl bg-gradient-to-bl from-primary via-primary/95 to-primary/85 px-8 py-16 text-center text-primary-foreground shadow-2xl shadow-primary/25 sm:px-16 transition-all duration-700 ${
                ctaView.inView
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-8"
              }`}
            >
              {/* Decorative elements */}
              <div className="absolute top-0 end-0 h-40 w-40 rounded-full bg-white/[0.04] blur-2xl" />
              <div className="absolute bottom-0 start-0 h-56 w-56 rounded-full bg-white/[0.04] blur-3xl" />

              <div className="relative">
                <h2 className="text-3xl font-bold sm:text-4xl">
                  هل لديك قصة نجاح؟
                </h2>
                <p className="mx-auto mt-4 max-w-lg text-lg leading-relaxed opacity-85">
                  شاركنا تجربتك الملهمة وساعد الآخرين في اتخاذ خطوة نحو
                  مستقبل سعيد. قصتك قد تكون مصدر إلهام لعائلة تبحث عن نصيبها.
                </p>
                <Button
                  size="lg"
                  variant="secondary"
                  asChild
                  className="mt-8 h-14 px-10 text-base font-semibold shadow-xl hover:shadow-2xl transition-all duration-500 hover:scale-[1.02]"
                >
                  <Link href="/contact">
                    <span className="flex items-center gap-2">
                      شاركنا قصتك
                      <ArrowLeft className="size-4 transition-transform duration-300 group-hover:-translate-x-1" />
                    </span>
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />

      {/* Global keyframe animations */}
      <style jsx global>{`
        @keyframes fadeSlideUp {
          from {
            opacity: 0;
            transform: translateY(24px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes fadeSlideDown {
          from {
            opacity: 0;
            transform: translateY(-16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </>
  );
}
