import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BLOG_COVERS, blogCover } from "@/lib/blog-covers";

/* P2-7 / DS-19 / DS-20: the public pages share the landing's navy band; blog covers vary, from the brand photos only */

const ROOT = join(__dirname, "..", "..", "..");
const PAGES = [
  "src/app/(ar)/about/page.tsx",
  "src/app/(ar)/faq/faq-content.tsx",
  "src/app/(ar)/contact/page.tsx",
  "src/app/(ar)/privacy/page.tsx",
  "src/app/(ar)/terms/terms-view.tsx",
  "src/app/(ar)/refund-policy/refund-policy-view.tsx",
  "src/app/(ar)/blog/blog-view.tsx",
  "src/app/(ar)/blog/[slug]/page.tsx",
];

describe("public pages share the landing look", () => {
  it("each hero is the navy night with the gold star tile, no foggy photo under a white veil", () => {
    for (const p of PAGES) {
      const src = readFileSync(join(ROOT, p), "utf8");
      expect(src, p).toContain("landing-night");
      expect(src, p).toContain("landing-khatam");
      expect(src, p).not.toContain("PageHeroPhoto");
    }
  });

  it("one FAQ toggle: the landing's + that turns into ✕", () => {
    const faq = readFileSync(join(ROOT, "src/app/(ar)/faq/faq-content.tsx"), "utf8");
    expect(faq).toContain("<Plus");
    expect(faq).toContain("rotate-45");
    expect(faq).not.toContain("ChevronDown");
  });
});

describe("blog covers (DS-19)", () => {
  it("only the site's existing brand photos, all on disk", () => {
    for (const c of BLOG_COVERS) {
      expect(c).toMatch(/^\/images\/(pages|landing)\/[a-z]+\.webp$/);
      expect(existsSync(join(ROOT, "public", c)), c).toBe(true);
    }
  });

  it("a post keeps its cover; posts differ", () => {
    expect(blogCover("how-to-talk-to-family")).toBe(blogCover("how-to-talk-to-family"));
    const slugs = ["a", "b", "c", "d", "e", "first-meeting", "family-visit", "questions-before-marriage", "trust", "guardian"];
    expect(new Set(slugs.map(blogCover)).size).toBeGreaterThanOrEqual(5);
  });
});
