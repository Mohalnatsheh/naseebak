import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/contexts/dashboard-context", () => ({
  useDashboardData: () => ({
    loading: false, profile: { gender: "MALE" }, country: "JO",
    counts: { flags: { introRequests: true, chat: true, mutualSuggestions: true, creditOnInterest: true } },
    refreshUnread: () => {}, refreshProfile: () => {},
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/dashboard/payments",
}));

const json = (body: unknown, ok = true) => Promise.resolve({ ok, status: ok ? 200 : 500, json: async () => body } as Response);
const pkg = { id: "jo_10", name: "10 أرصدة", credits: 10, price: 3, currency: "JOD", currencySymbol: "د.أ" };
const row = { id: "p1", amount: "3", currency: "JOD", status: "COMPLETED", description: "شراء 10 أرصدة", createdAt: "2026-11-01T10:00:00.000Z" };

describe("payments page: a failed history page turn", () => {
  it("shows the error in the history section only, with a retry; the balance and packages stay", async () => {
    let page2Fails = true;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.startsWith("/api/payments/plans")) return json({ country: "JO", purchasesEnabled: true, packages: [pkg] });
      if (url.startsWith("/api/payments/history?page=2")) {
        return page2Fails ? json({ error: "x" }, false) : json({ payments: [{ ...row, id: "p2", description: "شراء 25 رصيداً" }], matchCredits: 7, totalPages: 2 });
      }
      if (url.startsWith("/api/payments/history")) return json({ payments: [row], matchCredits: 7, totalPages: 2 });
      return json({});
    });
    const { default: PaymentsPage } = await import("@/app/(ar)/dashboard/payments/page");
    render(<PaymentsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /التالي/ }));

    expect(await screen.findByText(/تعذّر تحميل سجل المدفوعات/)).toBeTruthy();
    // Not the whole-page error, and never a fake empty history
    expect(screen.queryByText(/تعذّر تحميل رصيدك والباقات/)).toBeNull();
    expect(screen.queryByText("لا مدفوعات بعد")).toBeNull();
    expect(screen.getByRole("button", { name: "شراء الآن: 10 أرصدة" })).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
    // One history request for the turn, and the plans were not loaded again
    expect(fetchSpy.mock.calls.filter(([u]) => String(u).startsWith("/api/payments/plans"))).toHaveLength(1);
    expect(fetchSpy.mock.calls.filter(([u]) => String(u).includes("history?page=2"))).toHaveLength(1);

    page2Fails = false;
    fireEvent.click(screen.getByRole("button", { name: /إعادة المحاولة/ }));
    expect(await screen.findByText("شراء 25 رصيداً")).toBeTruthy();
    expect(screen.queryByText(/تعذّر تحميل سجل المدفوعات/)).toBeNull();
  });
});
