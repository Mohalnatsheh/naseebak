import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublishedPost, postDescription } from "@/lib/blog";
import { socialMetadata } from "@/lib/seo";

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

  const post = await getPublishedPost(slug);

  if (!post) {
    return {
      title: "المقال غير موجود",
      description: "لم نتمكن من العثور على المقال المطلوب",
    };
  }

  const url = `https://naseebak.com/blog/${post.slug}`;
  const description = postDescription(post);

  return {
    // Absolute: blog/layout's plain title stops the site template here; long titles stay without the suffix
    title: { absolute: post.title.length <= 50 ? `${post.title} | نصيبك` : post.title },
    description,
    alternates: { canonical: url },
    ...socialMetadata({
      title: post.title,
      description,
      url,
      locale: "ar_JO",
      image: { url: "https://naseebak.com/images/pages/post.webp", width: 1600, height: 900, alt: post.title },
      article: {
        publishedTime: post.publishedAt?.toISOString(),
        modifiedTime: post.updatedAt.toISOString(),
        section: post.category.nameAr,
      },
    }),
  };
}

export default async function BlogSlugLayout({ params, children }: Props) {
  const { slug } = await params;

  const post = await getPublishedPost(slug);

  // A real 404 (not a 200 "not found" page) so search engines drop dead links
  if (!post) notFound();

  const url = `https://naseebak.com/blog/${post.slug}`;

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: postDescription(post),
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    image: "https://naseebak.com/images/pages/post.webp",
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
        url: "https://naseebak.com/images/icon-512.png",
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
