import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import { postDescription } from "@/lib/blog";
import { socialMetadata } from "@/lib/seo";

describe("postDescription", () => {
  it("uses the excerpt, with spaces and line breaks collapsed", () => {
    expect(postDescription({ excerpt: "  سطر\n\nثانٍ  ", content: "النص" })).toBe("سطر ثانٍ");
  });

  it("falls back to the text, cut at a word to at most 160 characters", () => {
    const content = "كلمة ".repeat(60);
    const d = postDescription({ excerpt: "", content });
    expect(d.length).toBeLessThanOrEqual(160);
    expect(d.endsWith("كلمة…")).toBe(true);
  });
});

describe("socialMetadata", () => {
  it("gives every page its own site name, type and X card text", () => {
    const m = socialMetadata({ title: "من نحن | نصيبك", description: "وصف", url: "https://naseebak.com/about", locale: "ar_JO" });
    expect(m.openGraph).toMatchObject({ type: "website", siteName: "نصيبك", title: "من نحن | نصيبك", locale: "ar_JO" });
    expect(m.twitter).toMatchObject({ card: "summary_large_image", title: "من نحن | نصيبك", description: "وصف" });
  });

  it("marks a blog post as an article with its dates", () => {
    const m = socialMetadata({ title: "t", description: "d", url: "u", article: { publishedTime: "2026-10-17T00:00:00.000Z" } });
    expect(m.openGraph).toMatchObject({ type: "article", publishedTime: "2026-10-17T00:00:00.000Z" });
  });
});
