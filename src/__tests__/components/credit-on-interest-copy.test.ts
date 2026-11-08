import { describe, it, expect } from "vitest";
import { faqsFor } from "@/app/(ar)/faq/faq-data";
import { landingContent } from "@/components/landing/content";
import { CREDIT_ON_INTEREST_LINE } from "@/lib/suggestions/copy";

describe("credit-on-interest copy", () => {
  it("FAQ and landing state the rule only when the flag is on", () => {
    const on = JSON.stringify(faqsFor(true, true, true));
    const off = JSON.stringify(faqsFor(true, true));
    expect(on).toContain(CREDIT_ON_INTEREST_LINE);
    expect(off).not.toContain(CREDIT_ON_INTEREST_LINE);
    expect(on).not.toContain("كل طلب تعارف");

    const landingOn = JSON.stringify(landingContent({ introRequests: true, chat: true, creditOnInterest: true }));
    const landingOff = JSON.stringify(landingContent({ introRequests: true, chat: true }));
    expect(landingOn).toContain(CREDIT_ON_INTEREST_LINE);
    expect(landingOn).not.toContain("أسبوعية");
    expect(landingOff).toBe(JSON.stringify(landingContent({ introRequests: true, chat: true, creditOnInterest: false })));
    expect(landingOff).not.toContain(CREDIT_ON_INTEREST_LINE);
  });

  it("the flag needs the new cycle (legacy copy unchanged)", () => {
    expect(JSON.stringify(faqsFor(false, false, true))).toBe(JSON.stringify(faqsFor(false, false)));
    expect(JSON.stringify(landingContent({ introRequests: false, chat: false, creditOnInterest: true }))).toBe(
      JSON.stringify(landingContent({ introRequests: false, chat: false }))
    );
  });
});

describe("free «مهتم» reply copy (free_interest_reply)", () => {
  it("FAQ (both countries) and landing add the free-reply line only when the switch is on", async () => {
    const { FREE_REPLY_LINE } = await import("@/lib/suggestions/copy");
    for (const country of ["JO", "SA"] as const) {
      const on = JSON.stringify(faqsFor(true, true, true, country, null, true));
      const off = JSON.stringify(faqsFor(true, true, true, country, null, false));
      expect(on).toContain(FREE_REPLY_LINE);
      expect(off).not.toContain(FREE_REPLY_LINE);
    }
    // needs credit on interest
    expect(JSON.stringify(faqsFor(true, true, false, "JO", null, true))).not.toContain(FREE_REPLY_LINE);
    const landingOn = JSON.stringify(landingContent({ introRequests: true, chat: true, creditOnInterest: true, freeInterestReply: true }));
    expect(landingOn).toContain(FREE_REPLY_LINE);
    expect(JSON.stringify(landingContent({ introRequests: true, chat: true, creditOnInterest: true }))).not.toContain(FREE_REPLY_LINE);
  });
});
