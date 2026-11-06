import type { Metadata } from "next";
import { COUNTRIES, type CountryCode } from "@/lib/countries";
import { absoluteUrl } from "@/lib/site-paths";

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

/** FAQPage structured data: what search engines and AI answers read from a page's questions */
export function faqJsonLd(faqs: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
}

/** /llms.txt: a short, plain summary of the site for AI assistants, with the pages worth reading */
export function buildLlmsText({ countries, posts }: { countries: CountryCode[]; posts: { slug: string; title: string; excerpt: string; country: string }[] }): string {
  const page = (label: string, path: string, country: CountryCode) => `- [${label}](${absoluteUrl(path, country)})`;
  const sections = countries.flatMap((country) => {
    const list = posts.filter((p) => p.country === country);
    return [
      `## ${COUNTRIES[country].nameEn}`,
      "",
      page("Home", "/", country),
      page("About Naseebak", "/about", country),
      page("Questions and answers", "/faq", country),
      page("Contact", "/contact", country),
      page("Blog", "/blog", country),
      ...list.map((p) => `${page(p.title, `/blog/${p.slug}`, country)}: ${p.excerpt}`),
      "",
    ];
  });
  return [
    "# Naseebak (نصيبك)",
    "",
    `> A halal, marriage-only platform for ${countries.map((c) => COUNTRIES[c].nameEn).join(" and ")}, in Arabic. It is not a dating app: members are suggested to each other, and families are part of the path to marriage.`,
    "",
    "- Sign-up is free with a verified phone number, and includes 3 free credits.",
    "- Members get suggestions with a compatibility score. Photos stay hidden until both people say they are interested.",
    "- Saying «مهتم» (interested) uses one credit. Saying «لا» (no) is free. The credit comes back if the other person never answers.",
    "- After a mutual match they choose a family introduction, or a short protected chat inside the platform first.",
    "- Members are only matched within their own country.",
    "",
    ...sections,
  ].join("\n");
}

