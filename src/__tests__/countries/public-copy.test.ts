import { describe, it, expect } from "vitest";
import { contentFor, landingContent } from "@/components/landing/content";
import { faqsFor } from "@/app/(ar)/faq/faq-data";
import { packagesSentence } from "@/lib/payments/packages";
import { publicCopy } from "@/lib/public-copy";

const MODES = [
  { introRequests: true, chat: true, creditOnInterest: true },
  { introRequests: true, chat: true, creditOnInterest: false },
  { introRequests: true, chat: false, creditOnInterest: false },
  { introRequests: false, chat: false },
];

describe("landing copy per visitor country", () => {
  it("Jordan is the default and keeps the original copy", () => {
    for (const m of MODES) expect(contentFor(m, "JO")).toEqual(landingContent(m));
    const jo = contentFor(MODES[0], "JO");
    expect(jo.country).toBe("JO");
    expect(jo.hero.eyebrow).toBe("منصة زواج أردنية");
    expect(jo.hero.title).toBe("يمكن نصيبك أقرب مما تتوقع");
  });

  it("Saudi Arabia gets the Saudi copy: Saudi phone, «جوال», never Jordan", () => {
    for (const m of MODES) {
      const sa = contentFor(m, "SA");
      const text = JSON.stringify(sa);
      expect(sa.country).toBe("SA");
      expect(sa.hero.eyebrow).toBe("منصة زواج سعودية");
      expect(sa.hero.title).toBe("لعلّ نصيبك أقرب مما تتوقع");
      expect(text).not.toMatch(/أردن|هاتف/);
      expect(text).toContain("جوال سعودي");
    }
  });
});

describe("FAQ per visitor country", () => {
  it("Jordan answers are the defaults", () => {
    expect(faqsFor(true, true, true, "JO")).toEqual(faqsFor(true, true, true));
    expect(JSON.stringify(faqsFor(false, false))).toContain("الأردن");
  });

  it("Saudi answers never mention Jordan and show the Saudi packages", () => {
    for (const [nc, chat, coi] of [
      [true, true, true],
      [true, true, false],
      [false, false, false],
    ] as const) {
      const sa = faqsFor(nc, chat, coi, "SA");
      expect(sa.map((f) => f.id)).toEqual(faqsFor(nc, chat, coi).map((f) => f.id));
      expect(JSON.stringify(sa)).not.toMatch(/أردن|د\.أ/);
    }
    const packages = faqsFor(true, true, true, "SA").find((f) => f.id === 9)!.a;
    expect(packages).toContain(packagesSentence("SA"));
    expect(packages).not.toContain(packagesSentence("JO"));
  });
});

describe("site metadata copy", () => {
  it("Open Graph locale and schema.org area follow the country", () => {
    expect(publicCopy("JO").ogLocale).toBe("ar_JO");
    expect(publicCopy("JO").areaServed.name).toBe("Jordan");
    expect(publicCopy("SA").ogLocale).toBe("ar_SA");
    expect(publicCopy("SA").areaServed).toEqual({ "@type": "Country", name: "Saudi Arabia", identifier: "SA" });
    expect(publicCopy("SA").description).not.toMatch(/أردن/);
  });
});

describe("home page screens", () => {
  const mode = { introRequests: true, chat: true, creditOnInterest: true };
  const images = (country: "JO" | "SA") => landingContent(mode, country).tour.map((t) => t.image);

  it("Saudi Arabia shows its own screens, none with Jordanian details", () => {
    expect(images("SA").length).toBe(5);
    for (const image of images("SA")) expect(image).toMatch(/^\/images\/landing\/product\/sa\//);
  });

  it("Jordan keeps its screens", () => {
    for (const image of images("JO")) expect(image).not.toContain("/sa/");
  });
});

