import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";

interface Props {
  params: Promise<{ slug: string }>;
  children: React.ReactNode;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;

  const post = await db.blogPost.findUnique({
    where: { slug, status: "PUBLISHED" },
    include: { category: true },
  });

  if (!post) {
    return {
      title: "المقال غير موجود",
      description: "لم نتمكن من العثور على المقال المطلوب",
    };
  }

  const url = `https://naseebak.com/blog/${post.slug}`;

  return {
    title: post.title,
    description: post.excerpt || post.content.slice(0, 160),
    alternates: { canonical: url },
    openGraph: {
      title: `${post.title} | نصيبك`,
      description: post.excerpt || post.content.slice(0, 160),
      url,
      type: "article",
      publishedTime: post.publishedAt?.toISOString(),
      section: post.category.nameAr,
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.excerpt || post.content.slice(0, 160),
    },
  };
}

export default async function BlogSlugLayout({ params, children }: Props) {
  const { slug } = await params;

  const post = await db.blogPost.findUnique({
    where: { slug, status: "PUBLISHED" },
    include: { category: true },
  });

  // A real 404 (not a 200 "not found" page) so search engines drop dead links
  if (!post) notFound();

  const url = `https://naseebak.com/blog/${post.slug}`;

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt || post.content.slice(0, 160),
    url,
    datePublished: post.publishedAt?.toISOString(),
    dateModified: post.updatedAt.toISOString(),
    author: {
      "@type": "Organization",
      name: "نصيبك",
      url: "https://naseebak.com",
    },
    publisher: {
      "@type": "Organization",
      name: "نصيبك",
      url: "https://naseebak.com",
      logo: {
        "@type": "ImageObject",
        url: "https://naseebak.com/images/logo.svg",
      },
    },
    articleSection: post.category.nameAr,
    inLanguage: "ar",
    ...(post.readTime && { timeRequired: `PT${parseInt(post.readTime)}M` }),
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "الرئيسية",
        item: "https://naseebak.com",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "المدونة",
        item: "https://naseebak.com/blog",
      },
      {
        "@type": "ListItem",
        position: 3,
        name: post.title,
        item: url,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      {children}
    </>
  );
}
