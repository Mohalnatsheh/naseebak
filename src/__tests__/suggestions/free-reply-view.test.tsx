import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/contexts/dashboard-context", () => ({
  useDashboardData: () => ({
    profile: { gender: "FEMALE" },
    counts: { flags: {}, guardian: { exists: true, consented: true } },
    refreshProfile: vi.fn(async () => {}),
    refreshUnread: vi.fn(),
  }),
}));
vi.mock("@/components/suggestions/dealbreakers-card", () => ({ DealbreakersCard: () => null }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));

import { MutualSuggestionsView } from "@/components/suggestions/mutual-suggestions-view";
import { InterestDialog } from "@/components/suggestions/interest-dialog";

const candidate = { id: "c1", firstName: "أحمد", isVerified: false, childrenCount: 0 } as const;
const liked = { kind: "mutual", id: "s1", compatibilityScore: 70, reason: "سبب", createdAt: "2026-10-01", candidate, likedYou: true };
const plain = { ...liked, id: "s2", likedYou: undefined, candidate: { ...candidate, id: "c2", firstName: "خالد" } };
const fetchMock = vi.fn();
let decideBody: unknown;

beforeEach(() => {
  decideBody = { match: true, matchId: "m1", creditsLeft: 0 };
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (url.startsWith("/api/suggestions/feed")) {
      const items = url.includes("tab=interested") ? [liked] : url.includes("tab=new") ? [plain] : [];
      return { ok: true, status: 200, json: async () => ({ items, total: items.length, totalPages: 1 }) };
    }
    if (url.includes("/decide")) return { ok: true, status: 200, json: async () => decideBody };
    return { ok: true, status: 200, json: async () => ({}) };
  });
  vi.stubGlobal("fetch", fetchMock);
  window.history.replaceState(null, "", "/dashboard/suggestions?tab=interested");
});
afterEach(() => vi.unstubAllGlobals());

describe("free «مهتم» reply on the website", () => {
  it("at 0 credits a card that liked you keeps «مهتمة» usable and says the reply is free", async () => {
    render(<MutualSuggestionsView creditOnInterest freeInterestReply credits={0} chatEnabled />);
    const btn = await screen.findByRole("button", { name: /^مهتمة$/ });
    expect(btn).toBeEnabled();
    expect(screen.getAllByText(/الرد بـ«مهتم» مجاني/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/اشحني لتردّي/)).not.toBeInTheDocument();
  });

  it("the dialog confirms a free reply at 0 credits and the balance stays as the server says", async () => {
    render(<MutualSuggestionsView creditOnInterest freeInterestReply credits={0} chatEnabled />);
    fireEvent.click(await screen.findByRole("button", { name: /^مهتمة$/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByText("انتهى رصيدك")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("radio", { name: /محادثة هنا أولاً/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: /تأكيد «مهتم»/ }));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/decide"))).toBe(true));
  });

  it("switch off: at 0 credits the same card stays locked", async () => {
    render(<MutualSuggestionsView creditOnInterest credits={0} chatEnabled />);
    expect(await screen.findByRole("button", { name: /^مهتمة$/ })).toBeDisabled();
  });
});

describe("InterestDialog free mode", () => {
  const props = {
    open: true, onOpenChange: () => {}, partnerGender: "MALE", chatEnabled: true,
    guardian: { exists: true, consented: true }, onConfirm: async () => true,
  };

  it("free at 0 credits: no recharge, a free line, the confirm button", () => {
    render(<InterestDialog {...props} credits={0} free />);
    expect(screen.queryByText("انتهى رصيدك")).not.toBeInTheDocument();
    expect(screen.queryByText(/يستخدم رصيداً واحداً/)).not.toBeInTheDocument();
    expect(screen.getByText(/الرد بـ«مهتم» مجاني/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /تأكيد «مهتم»/ })).toBeInTheDocument();
  });

  it("not free: unchanged cost line", () => {
    render(<InterestDialog {...props} credits={2} />);
    expect(screen.getByText(/مهتم يستخدم رصيداً واحداً — رصيدك 2/)).toBeInTheDocument();
  });
});
