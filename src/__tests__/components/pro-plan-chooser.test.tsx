import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ProPlanOffer } from "@/lib/pro/plans";

const data = vi.hoisted(() => ({ current: { profile: { gender: "FEMALE" } } as Record<string, unknown> }));
vi.mock("@/contexts/dashboard-context", () => ({ useDashboardData: () => data.current }));

import { ProPlanChooser, defaultProPlan, proCreditsLine, proPitch } from "@/components/payments/pro-section";
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

afterEach(() => {
  cleanup();
  // The chosen plan is remembered for the checkout round trip (WP2-17): every test starts fresh
  sessionStorage.clear();
});

describe("ProPlanChooser (one compact Pro card)", () => {
  it("one card, monthly picked first, one subscribe button, the three features and the credits line", () => {
    render(<ProPlanChooser offers={offers} canBuy />);
    const radios = screen.getAllByRole("radio");
    // Named by plan; the price, period and discount inside each are its description
    expect(radios.map((r) => r.getAttribute("aria-label"))).toEqual(["أسبوعي", "شهري", "سنوي"]);
    expect(radios[1].getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("في الشهر")).toBeTruthy();
    expect(screen.getByText(/4 أرصدة مجاناً كل شهر/)).toBeTruthy();
    expect(screen.getByText("إرسال الصور في المحادثة")).toBeTruthy();
    expect(screen.getByText("الرسائل الصوتية في المحادثة")).toBeTruthy();
    expect(screen.getByText("شارة Pro على بطاقتك")).toBeTruthy();
    expect(screen.getByText("أولوية في الاقتراحات")).toBeTruthy();
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

describe("ProPlanChooser: minor fixes", () => {
  it("«الأكثر طلباً» shows only next to other plans", () => {
    render(<ProPlanChooser offers={offers} canBuy />);
    expect(screen.getByText("الأكثر طلباً")).toBeTruthy();
    cleanup();
    render(<ProPlanChooser offers={[offer("monthly", 5, 4)]} canBuy />);
    expect(screen.queryByText("الأكثر طلباً")).toBeNull();
  });

  it("radiogroup keys: one tab stop; in RTL the left arrow picks the next plan, the right arrow the one before; Home / End", () => {
    render(
      <div dir="rtl">
        <ProPlanChooser offers={offers} canBuy />
      </div>
    );
    const radio = (name: string) => screen.getByRole("radio", { name });
    expect(screen.getAllByRole("radio").map((r) => r.tabIndex)).toEqual([-1, 0, -1]);
    fireEvent.keyDown(radio("شهري"), { key: "ArrowLeft" });
    expect(radio("سنوي").getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(radio("سنوي"));
    fireEvent.keyDown(radio("سنوي"), { key: "ArrowLeft" }); // wraps
    expect(radio("أسبوعي").getAttribute("aria-checked")).toBe("true");
    fireEvent.keyDown(radio("أسبوعي"), { key: "ArrowRight" });
    expect(radio("سنوي").getAttribute("aria-checked")).toBe("true");
    fireEvent.keyDown(radio("سنوي"), { key: "Home" });
    expect(radio("أسبوعي").getAttribute("aria-checked")).toBe("true");
    fireEvent.keyDown(radio("أسبوعي"), { key: "End" });
    expect(radio("سنوي").getAttribute("aria-checked")).toBe("true");
    expect(screen.getAllByRole("radio").map((r) => r.tabIndex)).toEqual([-1, -1, 0]);
  });

  it("subscribe starts the checkout of the chosen plan; a man reads the masculine copy", async () => {
    data.current = { profile: { gender: "MALE" } };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: "x" }), { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      render(<ProPlanChooser offers={offers} canBuy />);
      expect(screen.getByText(/تدفع 7.05\$ بالدولار/)).toBeTruthy();
      fireEvent.click(screen.getByRole("radio", { name: "سنوي" }));
      fireEvent.click(screen.getByRole("button", { name: "اشترك الآن" }));
      await screen.findByRole("alert");
      expect(fetchMock).toHaveBeenCalledWith("/api/pro/checkout", expect.objectContaining({ method: "POST", body: JSON.stringify({ plan: "yearly" }) }));
    } finally {
      vi.unstubAllGlobals();
      data.current = { profile: { gender: "FEMALE" } };
    }
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

describe("proPitch / proCreditsLine", () => {
  it("mentions the free credits only when a plan has some", () => {
    expect(proPitch([{ credits: 0 }])).toBe("مع Pro يمكنك إرسال الصور والرسائل الصوتية في المحادثة، ولك أولوية في الاقتراحات.");
    expect(proPitch([{ credits: 0 }, { credits: 3 }])).toContain("ويصلك رصيد مجاني مع الاشتراك");
  });
  it("counts the credits in Arabic, with the plan's rhythm", () => {
    expect(proCreditsLine({ id: "weekly", credits: 1 })).toBe("رصيد واحد مجاناً كل أسبوع");
    expect(proCreditsLine({ id: "monthly", credits: 2 })).toBe("رصيدان مجاناً كل شهر");
    expect(proCreditsLine({ id: "yearly", credits: 5 })).toBe("5 أرصدة مجاناً كل شهر");
    expect(proCreditsLine({ id: "monthly", credits: 12 })).toBe("12 رصيداً مجاناً كل شهر");
  });
});

describe("ProPlanChooser: the chosen plan survives the checkout round trip (QA WP2-17)", () => {
  it("a plan picked before leaving is still picked on coming back", () => {
    sessionStorage.clear();
    const first = render(<ProPlanChooser offers={offers} canBuy />);
    fireEvent.click(screen.getByRole("radio", { name: "سنوي" }));
    first.unmount();
    render(<ProPlanChooser offers={offers} canBuy />);
    expect(screen.getByRole("radio", { name: "سنوي" }).getAttribute("aria-checked")).toBe("true");
    sessionStorage.clear();
  });

  it("«الأكثر طلباً» is an outlined primary chip; gold is only on the button (Pro design P1)", () => {
    render(<ProPlanChooser offers={offers} canBuy />);
    const chip = screen.getByText("الأكثر طلباً");
    expect(chip.className).toContain("border-primary");
    expect(chip.className).not.toContain("bg-accent");
  });

  it("compares the plans: every price side by side, a month's cost, and the discount against weekly for a year", () => {
    render(<ProPlanChooser offers={offers} canBuy />);
    // 2 a week = 104 a year; 5 a month = 60 (42% off); 40 a year (61% off)
    for (const name of ["أسبوعي", "شهري", "سنوي"]) expect(screen.getByRole("radio", { name })).toBeTruthy();
    expect(screen.getByText("في الأسبوع")).toBeTruthy();
    expect(screen.getByText("في السنة")).toBeTruthy();
    expect(screen.getByText("حوالي 8.67 د.أ شهرياً")).toBeTruthy();
    expect(screen.getByText("حوالي 3.33 د.أ شهرياً")).toBeTruthy();
    expect(screen.getByText("خصم 42%")).toBeTruthy();
    expect(screen.getByText("خصم 61%")).toBeTruthy();
    expect(screen.getByText("أفضل قيمة")).toBeTruthy();
    expect(screen.getByText(/الخصم مقارنةً بالاشتراك الأسبوعي لمدة سنة/)).toBeTruthy();
  });

  it("no discount line or chips when there is nothing cheaper to compare", () => {
    render(<ProPlanChooser offers={[offer("monthly", 5, 4)]} canBuy />);
    expect(screen.queryByText(/خصم/)).toBeNull();
    expect(screen.queryByText("أفضل قيمة")).toBeNull();
  });
});
