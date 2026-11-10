import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { contentFor } from "@/components/landing/content";
import { faqsFor } from "@/app/(ar)/faq/faq-data";
import { packagesSentence } from "@/lib/payments/packages";
import { publicCopy } from "@/lib/public-copy";
import { countryPageDefaults } from "@/lib/countries/content";
import { pollInputSchema } from "@/lib/validations/poll";
import { createBlogPostSchema } from "@/lib/validations/blog";

const MODES = [
  { introRequests: true, chat: true, creditOnInterest: true },
  { introRequests: true, chat: true, creditOnInterest: true, freeInterestReply: true },
  { introRequests: true, chat: true, creditOnInterest: false },
  { introRequests: true, chat: false, creditOnInterest: false },
  { introRequests: false, chat: false },
];

/** Jordanian or Saudi wording that must never reach a Lebanese page */
const FOREIGN = /أردن|سعودي|السعودية|المملكة|جوال|د\.أ|ر\.س|عمّان|الرياض/;

describe("Lebanese public copy", () => {
  it("site metadata names Lebanon, never Jordan or Saudi Arabia", () => {
    const lb = publicCopy("LB");
    expect(lb.description).toContain("لبنان");
    expect(lb.description).not.toMatch(/الأردن|السعودية/);
    expect(JSON.stringify(lb)).not.toMatch(FOREIGN);
    expect(lb.ogLocale).toBe("ar_LB");
    expect(lb.areaServed).toEqual({ "@type": "Country", name: "Lebanon", identifier: "LB" });
    expect(lb.keywords).toContain("لبنان");
  });

  it("SEO title for Lebanon", () => {
    for (const mode of MODES) {
      expect(countryPageDefaults("LB", mode).seoTitle).toBe("نصيبك - منصة زواج بالحلال في لبنان | نوصّلك بشريك العمر");
    }
  });

  it("Jordan and Saudi SEO titles are unchanged", () => {
    expect(countryPageDefaults("JO", MODES[0]).seoTitle).toBe("نصيبك - منصة زواج بالحلال في الأردن | نوصّلك بشريك العمر");
    expect(countryPageDefaults("SA", MODES[0]).seoTitle).toBe("نصيبك - منصة زواج جاد في السعودية بالحلال");
  });

  it("landing copy names Lebanon and a Lebanese phone in every mode", () => {
    for (const mode of MODES) {
      const lb = contentFor(mode, "LB");
      const text = JSON.stringify(lb);
      expect(lb.country).toBe("LB");
      expect(text).not.toMatch(FOREIGN);
      expect(text).toContain("هاتفك اللبناني");
      expect(lb.hero.eyebrow).toContain("لبنان");
    }
  });

  it("Lebanon uses Jordan's (non-Saudi) screens", () => {
    for (const t of contentFor(MODES[0], "LB").tour) expect(t.image).not.toContain("/sa/");
  });

  it("FAQ shows dollar packages and never Jordanian or Saudi wording", () => {
    const faq = faqsFor(true, true, true, "LB");
    const text = JSON.stringify(faq);
    expect(text).toContain("$");
    expect(text).toContain(packagesSentence("LB"));
    expect(text).not.toMatch(/د\.أ|ر\.س/);
    for (const [nc, chat, coi] of [
      [true, true, true],
      [true, true, false],
      [true, false, false],
      [false, false, false],
    ] as const) {
      const lb = faqsFor(nc, chat, coi, "LB");
      expect(lb.map((f) => f.id)).toEqual(faqsFor(nc, chat, coi).map((f) => f.id));
      expect(JSON.stringify(lb)).not.toMatch(FOREIGN);
      expect(JSON.stringify(lb)).toContain("لبنان");
    }
  });

  it("the free-reply line replaces the credit line in Lebanon too", () => {
    const a = faqsFor(true, true, true, "LB", null, true).find((f) => f.id === 4)!.a;
    expect(a).toContain("مجاني");
    expect(a).toContain("الرد بـ«مهتم»");
  });
});

describe("polls and blog posts accept Lebanon", () => {
  it("poll schema", () => {
    const base = { question: "سؤال تجريبي للاستطلاع؟", options: ["نعم", "لا"] };
    const r = pollInputSchema.safeParse({ ...base, country: "LB" });
    expect(r.success).toBe(true);
    expect(pollInputSchema.safeParse({ ...base, country: "XX" }).success).toBe(false);
  });

  it("blog schema", () => {
    const shape = createBlogPostSchema.shape.country;
    expect(shape.safeParse("LB").success).toBe(true);
    expect(shape.safeParse("SA").success).toBe(true);
    expect(shape.safeParse("XX").success).toBe(false);
  });
});

/**
 * A `country === "SA" ? Saudi : Jordanian` choice silently gives Lebanon the Jordanian text.
 * Copy is chosen per country (a Record or the country config) instead; only genuinely Saudi-only
 * logic may compare against "SA" with a ternary.
 */
const ALLOW: { file: string; line: string; reason: string }[] = [
  {
    file: "lib/birth-date.ts",
    line: "SAUDI_MONTHS : BIRTH_MONTHS",
    reason: "Saudi month names are a Saudi-only variant; Jordan and Lebanon share the Levantine names",
  },
];
const allowed = (rel: string, line: string) => ALLOW.some((a) => a.file === rel && line.includes(a.line));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "__tests__" ? [] : sourceFiles(p);
    return /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

describe("no Saudi-versus-Jordan ternaries", () => {
  it("no file under src/ chooses between two countries' strings with === \"SA\" ?", () => {
    const root = join(process.cwd(), "src");
    const hits: string[] = [];
    for (const file of sourceFiles(root)) {
      const rel = relative(root, file);
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (/[!=]==\s*"SA"\s*\?/.test(line) && !allowed(rel, line)) hits.push(`${rel}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(hits).toEqual([]);
  });
});
