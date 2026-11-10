import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { MyProState } from "@/lib/pro/pro-types";

vi.mock("@/contexts/dashboard-context", () => ({ useDashboardData: () => ({ profile: { gender: "FEMALE" }, country: "JO" }) }));

import { MyProCard } from "@/components/payments/my-pro-card";

const base: MyProState = {
  enabled: true, isPro: true, plan: "yearly", renewsAt: "2027-10-01T00:00:00.000Z", cancelAtPeriodEnd: false, pastDue: false,
  canBuy: false, offers: [], creditsPerGrant: 8, nextGrantAt: "2026-12-10T00:00:00.000Z",
};

describe("«اشتراكي» (QA WP2-18, Pro design P1)", () => {
  it("a status chip, the date as the anchor, and the credits with the next grant", () => {
    render(<MyProCard state={base} onChanged={vi.fn()} />);
    expect(screen.getByTestId("pro-status").textContent).toBe("فعّال");
    expect(screen.getByText(/يتجدد في/)).toBeTruthy();
    expect(screen.getByTestId("pro-credits-line").textContent).toMatch(/^8 أرصدة كل شهر · الدفعة القادمة في 10 /);
  });

  it("a failing renewal reads «تعذّر التجديد» with one headline; no next grant then", () => {
    render(<MyProCard state={{ ...base, plan: "monthly", pastDue: true, nextGrantAt: null }} onChanged={vi.fn()} />);
    expect(screen.getByTestId("pro-status").textContent).toBe("تعذّر التجديد");
    expect(screen.getByText("لم ينجح تجديد الدفع.")).toBeTruthy();
    expect(screen.getByTestId("pro-credits-line").textContent).toBe("8 أرصدة كل شهر");
  });

  it("cancelled: «ينتهي قريباً» and «ينتهي في …»", () => {
    render(<MyProCard state={{ ...base, cancelAtPeriodEnd: true }} onChanged={vi.fn()} />);
    expect(screen.getByTestId("pro-status").textContent).toBe("ينتهي قريباً");
    expect(screen.getByText(/ينتهي في/)).toBeTruthy();
  });
});
