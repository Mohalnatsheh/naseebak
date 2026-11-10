import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PLATFORM_KIND } from "@/lib/countries/platform-kind";

const privacy = readFileSync("src/app/(ar)/privacy/page.tsx", "utf8");
const terms = readFileSync("src/app/(ar)/terms/terms-view.tsx", "utf8");

/** What JSX renders for «منصة{PLATFORM_KIND[country]} <next word>» */
const privacyIntro = (c: keyof typeof PLATFORM_KIND) => `منصة${PLATFORM_KIND[c]} متخصصة`;
const termsIntro = (c: keyof typeof PLATFORM_KIND) => `نصيبك منصة${PLATFORM_KIND[c]} تقترح`;

describe("privacy and terms intros: the space before the country word", () => {
  it("renders «منصة أردنية» / «منصة سعودية» with one space", () => {
    for (const intro of [privacyIntro, termsIntro]) {
      expect(intro("JO")).toContain("منصة أردنية ");
      expect(intro("SA")).toContain("منصة سعودية ");
    }
  });

  it("never glues the word or doubles/trails a space, for every country", () => {
    for (const c of ["JO", "SA", "LB"] as const) {
      for (const intro of [privacyIntro(c), termsIntro(c)]) {
        expect(intro).not.toMatch(/منصةأ|منصةس/);
        expect(intro).not.toMatch(/ {2}/);
      }
    }
    expect(privacyIntro("LB")).toBe("منصة متخصصة");
    expect(termsIntro("LB")).toBe("نصيبك منصة تقترح");
  });

  it("keeps «منصة» and the value on one line in both pages (JSX drops a line break)", () => {
    for (const src of [privacy, terms]) {
      expect(src).toMatch(/منصة\{PLATFORM_KIND\[country\]\} /);
      expect(src).not.toMatch(/منصة\s*\n\s*\{PLATFORM_KIND/);
    }
  });
});
