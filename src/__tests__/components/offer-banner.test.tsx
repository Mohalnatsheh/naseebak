import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OfferBanner } from "@/components/payments/offer-banner";

const offer = { percent: 50, title: "عروض الجمعة البيضاء", endsAt: "2026-11-30T21:59:00.000Z" };

describe("OfferBanner", () => {
  it("credits page: title, the percent, purchases and Pro, and the end date in Amman", () => {
    render(<OfferBanner offer={offer} />);
    const banner = screen.getByRole("region", { name: "عروض الجمعة البيضاء" });
    expect(banner.textContent).toContain("50%");
    expect(banner.textContent).toContain("عند شراء أي باقة أو الاشتراك في Pro");
    // 21:59 UTC on the 30th is 00:59 on 1 December in Amman
    expect(banner.textContent).toContain("ينتهي العرض 1 كانون الأول");
    expect(banner.textContent).not.toMatch(/[٠-٩]/);
  });

  it("Pro page: says the first payment", () => {
    render(<OfferBanner offer={offer} variant="pro" />);
    expect(screen.getByRole("region").textContent).toContain("عند أول دفعة اشتراك في Pro");
  });

  it("renders nothing without an offer", () => {
    const { container } = render(<OfferBanner offer={null} />);
    expect(container.innerHTML).toBe("");
  });
});
