import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const data = vi.hoisted(() => ({
  current: {
    loading: false, profile: { gender: "MALE" }, country: "SA",
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

function json(body: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);
}

const pkg = { id: "sa_10", name: "10 أرصدة", credits: 10, price: 15, currency: "sar", currencySymbol: "ر.س", chargeLabel: "15 ر.س" };

function plans(purchasesEnabled: boolean) {
  vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = String(input);
    if (url.startsWith("/api/payments/plans")) return json({ country: "SA", purchasesEnabled, packages: [pkg] });
    if (url.startsWith("/api/payments/history")) return json({ payments: [], matchCredits: 2, totalPages: 1 });
    return json({});
  });
}

describe("payments page when the country is not selling", () => {
  it("says so up front and the buy buttons are off", async () => {
    plans(false);
    const { default: PaymentsPage } = await import("@/app/(ar)/dashboard/payments/page");
    render(<PaymentsPage />);
    await waitFor(() => expect(screen.getByText(/شراء الرصيد غير متاح في دولتك حالياً/)).toBeTruthy());
    // No promise of a notice that nothing sends (QA WEB-PAY-13)
    expect(screen.queryByText(/سنُعلمك/)).toBeNull();
    const buy = screen.getByRole("button", { name: /شراء الآن/ }) as HTMLButtonElement;
    expect(buy.disabled).toBe(true);
  });

  it("keeps buying open when the country sells", async () => {
    vi.restoreAllMocks();
    plans(true);
    const { default: PaymentsPage } = await import("@/app/(ar)/dashboard/payments/page");
    render(<PaymentsPage />);
    const buy = (await screen.findByRole("button", { name: /شراء الآن/ })) as HTMLButtonElement;
    expect(buy.disabled).toBe(false);
    expect(screen.queryByText(/شراء الرصيد غير متاح/)).toBeNull();
  });
});
