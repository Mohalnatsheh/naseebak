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
