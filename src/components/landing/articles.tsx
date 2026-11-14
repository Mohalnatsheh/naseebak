import Link from "@/components/shared/site-link";
import { ChevronLeft } from "lucide-react";

/** One post as the home page needs it (plain data: built on the server, passed through the client body) */
export interface LandingArticle {
  slug: string;
  title: string;
  excerpt: string;
  category: string | null;
}

/**
 * «من المدونة»: the country's newest guides, linked from the home page. The home page is the strongest page
 * on the site, and before this it linked to no article, so search engines found the guides only through
 * the sitemap. Hidden when the country has no published post.
 */
export function LandingArticles({ articles }: { articles: LandingArticle[] }) {
  if (articles.length === 0) return null;
  return (
    <section id="articles" aria-labelledby="articles-title" className="scroll-mt-20 py-20 sm:py-28">
      <div className="container mx-auto max-w-6xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <h2 id="articles-title" className="text-3xl font-extrabold text-primary sm:text-4xl">
            أدلة ونصائح للزواج
          </h2>
          <p className="mt-4 leading-relaxed text-muted-foreground">
            مقالات عملية عن الخطبة والمهر وخطوات الزواج، تساعدك أنت وعائلتك قبل كل خطوة.
          </p>
        </div>

        <ul className="mt-12 grid gap-6 md:grid-cols-3">
          {articles.map((a) => (
            <li key={a.slug}>
              <Link
                href={`/blog/${a.slug}`}
                className="group flex h-full flex-col rounded-2xl border bg-card p-6 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                {a.category && <span className="text-sm font-bold text-accent-ink">{a.category}</span>}
                <h3 className="mt-2 text-lg font-bold leading-relaxed text-foreground group-hover:text-primary">{a.title}</h3>
                <p className="mt-3 line-clamp-3 flex-1 text-sm leading-relaxed text-muted-foreground">{a.excerpt}</p>
                <span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                  اقرأ المقال <ChevronLeft className="h-4 w-4" aria-hidden />
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-10 text-center">
          <Link href="/blog" className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline">
            كل المقالات
          </Link>
        </div>
      </div>
    </section>
  );
}
