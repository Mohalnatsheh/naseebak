import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TermsConsentText } from "@/components/shared/terms-consent-text";

describe("TermsConsentText (sign-up)", () => {
  it("links to the terms and privacy of the country chosen in the form", () => {
    const { rerender } = render(<TermsConsentText country="JO" />);
    expect(screen.getByRole("link", { name: "الشروط والأحكام" }).getAttribute("href")).toBe("/terms");
    expect(screen.getByRole("link", { name: "سياسة الخصوصية" }).getAttribute("href")).toBe("/privacy");
    rerender(<TermsConsentText country="SA" />);
    expect(screen.getByRole("link", { name: "الشروط والأحكام" }).getAttribute("href")).toBe("/sa/terms");
    expect(screen.getByRole("link", { name: "سياسة الخصوصية" }).getAttribute("href")).toBe("/sa/privacy");
  });
});
