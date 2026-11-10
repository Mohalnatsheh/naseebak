import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/* Money typography (web-pay P2), the compact pack list on phones, the empty history art, «اشتراكي» in the app's order */

const data = vi.hoisted(() => ({
  current: {
    loading: false, profile: { gender: "FEMALE" }, country: "JO",
    counts: { flags: { introRequests: true, chat: true, mutualSuggestions: true, creditOnInterest: true } },
    refreshUnread: () => {}, refreshProfile: () => {},
  } as Record<string, unknown>,
}));
vi.mock("@/contexts/dashboard-context", () => ({ useDashboardData: () => data.current }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/dashboard/payments",
}));

import { MoneyAmount, UsdLine } from "@/components/payments/money";
import { MyProCard } from "@/components/payments/my-pro-card";

function json(body: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);
}
const packs = [
  { id: "jo_10", name: "10 أرصدة", credits: 10, price: 3, currency: "jod", currencySymbol: "د.أ", chargeUsd: 4.23 },
  { id: "jo_25", name: "25 رصيداً", credits: 25, price: 6, currency: "jod", currencySymbol: "د.أ", chargeUsd: 8.46, popular: true },
];
function plans(history: unknown[]) {
  vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = String(input);
    if (url.startsWith("/api/payments/plans")) return json({ country: "JO", purchasesEnabled: true, packages: packs });
    if (url.startsWith("/api/payments/history")) return json({ payments: history, matchCredits: 2, totalPages: 1 });
    return json({});
  });
}
afterEach(() => vi.restoreAllMocks());

describe("money typography", () => {
  it("large digits in fixed width, the currency smaller and muted, the dollars as a muted line", () => {
    const { container } = render(
      <>
        <MoneyAmount amount={6} symbol="د.أ" />
        <UsdLine usd={8.46} />
      </>
    );
    const money = container.querySelector("[data-slot=money]")!;
    expect(money.className).toContain("tabular-nums");
    expect(container.querySelector("[data-slot=money-amount]")!.className).toContain("text-display");
    expect(container.querySelector("[data-slot=money-currency]")!.className).toContain("text-muted-ink");
    const usd = container.querySelector("[data-slot=usd-line]")!;
    expect(usd.textContent).toBe("يُخصم 8.46$ بالدولار");
    expect(usd.className).toContain("text-muted-ink");
  });

  it("the packs: navy buttons only, «الأكثر طلباً» outlined, compact on phones (icon and features from md up)", async () => {
    plans([]);
    const { default: PaymentsPage } = await import("@/app/(ar)/dashboard/payments/page");
    const { container } = render(<PaymentsPage />);
    const buy = await screen.findByRole("button", { name: "شراء الآن: 25 رصيداً" });
    expect(buy.className).toContain("bg-primary");
    expect(buy.className).not.toContain("bg-accent");
    expect(buy.className).toContain("h-12");
    expect(screen.getByText("الأكثر طلباً").className).toContain("border-primary/40");
    expect(container.querySelectorAll("[data-slot=money]").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("يُخصم 8.46$ بالدولار")).toBeTruthy();
    const features = screen.getAllByText("دفع آمن ومشفر")[0].closest("div.space-y-2\\.5")!;
    expect(features.className).toMatch(/\bhidden\b/);
    expect(features.className).toContain("md:block");
  });

  it("no payments yet: the wallet drawing and «لا مدفوعات بعد»", async () => {
    plans([]);
    const { default: PaymentsPage } = await import("@/app/(ar)/dashboard/payments/page");
    const { container } = render(<PaymentsPage />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "لا مدفوعات بعد" })).toBeTruthy());
    expect(container.querySelector("[data-line-art=wallet]")).not.toBeNull();
  });

  it("a history row shows its amount in the same typography", async () => {
    plans([{ id: "p1", status: "COMPLETED", amount: 6, currency: "JOD", description: "25 رصيداً", createdAt: "2026-11-01" }]);
    const { default: PaymentsPage } = await import("@/app/(ar)/dashboard/payments/page");
    render(<PaymentsPage />);
    await screen.findByText("25 رصيداً", { selector: "p" });
    expect(screen.queryByRole("heading", { name: "لا مدفوعات بعد" })).toBeNull();
  });
});

describe("«اشتراكي» in the app's order", () => {
  it("seal and title, renewal state, date, credits line before the features, one full-width button", () => {
    render(
      <MyProCard
        state={{ isPro: true, plan: "monthly", renewsAt: "2026-12-10", cancelAtPeriodEnd: false, pastDue: false, creditsPerGrant: 4, nextGrantAt: "2026-12-10" } as never}
        onChanged={() => {}}
      />
    );
    const card = screen.getByTestId("my-pro");
    const text = card.textContent ?? "";
    const order = ["اشتراكي", "فعّال", "يتجدد في", "4 أرصدة كل شهر", "إرسال الصور في المحادثة", "إلغاء التجديد"].map((t) => text.indexOf(t));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(screen.getByRole("img", { name: "عضوية Pro" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "إلغاء التجديد" }).className).toContain("w-full");
  });
});
