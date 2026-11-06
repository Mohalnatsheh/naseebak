import { describe, it, expect } from "vitest";
import { parsePostContent, relatedPosts } from "@/lib/blog-content";
import { buildLlmsText, faqJsonLd } from "@/lib/seo";

describe("source links in posts", () => {
  it("turns a web address into a link showing the site's name", () => {
    expect(parsePostContent("• وزارة الصحة: https://www.moh.gov.sa/HealthAwareness/x.aspx\n• بند.")).toEqual([
      { type: "ul", items: [["وزارة الصحة: ", { text: "moh.gov.sa", url: "https://www.moh.gov.sa/HealthAwareness/x.aspx" }], ["بند."]] },
    ]);
  });

  it("leaves a full stop after the address out of the link", () => {
    const [block] = parsePostContent("راجع https://laws.boe.gov.sa.");
    expect(block).toEqual({ type: "p", parts: ["راجع ", { text: "laws.boe.gov.sa", url: "https://laws.boe.gov.sa" }, "."] });
  });
});

describe("related posts", () => {
  const posts = ["a", "b", "c", "d", "e"].map((slug) => ({ slug, title: slug }));

  it("shows up to three others, newest first as given", () => {
    expect(relatedPosts(posts, "b").map((p) => p.slug)).toEqual(["a", "c", "d"]);
  });

  it("is empty for a country's only post", () => {
    expect(relatedPosts([posts[0]], "a")).toEqual([]);
  });
});

describe("structured data", () => {
  it("makes an FAQ page from questions and answers", () => {
    expect(faqJsonLd([{ q: "س؟", a: "ج." }])).toEqual({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [{ "@type": "Question", name: "س؟", acceptedAnswer: { "@type": "Answer", text: "ج." } }],
    });
  });
});

describe("llms.txt", () => {
  const text = buildLlmsText({
    countries: ["JO", "SA"],
    posts: [
      { slug: "a", title: "مقال أردني", excerpt: "وصف", country: "JO" },
      { slug: "b", title: "مقال سعودي", excerpt: "وصف", country: "SA" },
    ],
  });

  it("says what Naseebak is and links each country's main pages", () => {
    expect(text).toMatch(/^# Naseebak/);
    expect(text).toContain("https://naseebak.com/faq");
    expect(text).toContain("https://naseebak.com/sa/faq");
  });

  it("lists each post under its country's address", () => {
    expect(text).toContain("[مقال أردني](https://naseebak.com/blog/a)");
    expect(text).toContain("[مقال سعودي](https://naseebak.com/sa/blog/b)");
  });

  it("leaves out a country that is closed", () => {
    const jordan = buildLlmsText({ countries: ["JO"], posts: [] });
    expect(jordan).not.toContain("/sa");
  });
});
