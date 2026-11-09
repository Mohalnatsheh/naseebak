import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ProPlanOffer } from "@/lib/pro/plans";

const data = vi.hoisted(() => ({ current: { profile: { gender: "FEMALE" } } as Record<string, unknown> }));
vi.mock("@/contexts/dashboard-context", () => ({ useDashboardData: () => data.current }));

import { ProPlanChooser, defaultProPlan } from "@/components/payments/pro-section";
import { ProBadge } from "@/components/shared/pro-badge";

const offer = (id: ProPlanOffer["id"], price: number, credits: number): ProPlanOffer => ({
  id,
  price,
  currency: "JOD",
  chargeCurrency: "usd",
  chargeAmount: Math.round(price * 141),
  credits,
  interval: id === "weekly" ? "week" : id === "monthly" ? "month" : "year",
});

// Out of order on purpose: the selector still reads weekly, monthly, yearly
const offers = [offer("yearly", 40, 8), offer("weekly", 2, 1), offer("monthly", 5, 4)];

afterEach(cleanup);

describe("ProPlanChooser (one compact Pro card)", () => {
  it("one card, monthly picked first, one subscribe button, the three features and the credits line", () => {
    render(<ProPlanChooser offers={offers} canBuy />);
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.textContent)).toEqual(["أسبوعي", "شهري", "سنوي"]);
    expect(radios[1].getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("في الشهر")).toBeTruthy();
    expect(screen.getByText(/4 أرصدة مجاناً كل شهر/)).toBeTruthy();
    expect(screen.getByText("إرسال الصور في المحادثة")).toBeTruthy();
    expect(screen.getByText("الرسائل الصوتية في المحادثة")).toBeTruthy();
    expect(screen.getByText("شارة Pro على بطاقتك")).toBeTruthy();
    // Gendered copy for a woman
    expect(screen.getAllByRole("button", { name: "اشتركي الآن" })).toHaveLength(1);
    expect(screen.getByText(/تدفعين 7.05\$ بالدولار/)).toBeTruthy();
  });

  it("choosing a plan shows its price, period and credits", () => {
    render(<ProPlanChooser offers={offers} canBuy />);
    fireEvent.click(screen.getByRole("radio", { name: "سنوي" }));
    expect(screen.getByRole("radio", { name: "سنوي" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("في السنة")).toBeTruthy();
    expect(screen.getByText(/8 أرصدة مجاناً كل شهر/)).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "أسبوعي" }));
    expect(screen.getByText("في الأسبوع")).toBeTruthy();
    expect(screen.getByText(/رصيد واحد مجاناً كل أسبوع/)).toBeTruthy();
  });

  it("the button is off when buying isn't possible", () => {
    render(<ProPlanChooser offers={offers} canBuy={false} />);
    expect((screen.getByRole("button", { name: "اشتركي الآن" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("without a monthly plan the first one is picked; a single plan has no selector", () => {
    expect(defaultProPlan([{ id: "yearly" }, { id: "weekly" }])).toBe("yearly");
    expect(defaultProPlan([])).toBeNull();
    render(<ProPlanChooser offers={[offer("weekly", 2, 0)]} canBuy />);
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(screen.getByText("في الأسبوع")).toBeTruthy();
  });
});

describe("ProBadge", () => {
  it("is solid gold with dark text on dark backgrounds, a light tint elsewhere", () => {
    render(
      <>
        <ProBadge onDark />
        <ProBadge />
      </>
    );
    const [dark, light] = screen.getAllByText("Pro");
    expect(dark.className).toMatch(/\bbg-accent\b/);
    expect(dark.className).toMatch(/text-accent-foreground/);
    expect(light.className).toMatch(/bg-accent\/15/);
  });
});
