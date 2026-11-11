import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
const ctx = vi.hoisted(() => ({ gender: "MALE", interestPaywall: true as boolean | undefined }));
vi.mock("@/contexts/dashboard-context", () => ({
  useDashboardData: () => ({
    profile: { gender: ctx.gender },
    counts: { flags: {}, guardian: { exists: true, consented: true }, interestPaywall: ctx.interestPaywall },
    refreshProfile: vi.fn(async () => {}),
    refreshUnread: vi.fn(),
  }),
}));
vi.mock("@/components/suggestions/dealbreakers-card", () => ({ DealbreakersCard: () => null }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));

import { MutualSuggestionsView } from "@/components/suggestions/mutual-suggestions-view";

const candidate = { id: "c1", firstName: "سارة", isVerified: false, childrenCount: 0 } as const;
const plain = { kind: "mutual", id: "s1", compatibilityScore: 70, reason: "سبب", createdAt: "2026-10-01", candidate };
const liked = { ...plain, id: "s2", likedYou: true, candidate: { ...candidate, id: "c2", firstName: "ليلى" } };
const legacy = { kind: "legacy_suggestion", id: "s3", compatibilityScore: 70, reason: "سبب", createdAt: "2026-10-01", candidate: { ...candidate, id: "c3", firstName: "هدى" } };
const fetchMock = vi.fn();
let feed: unknown[];
let decide: { status: number; body: unknown };
const decideCalls = () => fetchMock.mock.calls.filter((c) => String(c[0]).includes("/decide"));

beforeEach(() => {
  Object.assign(ctx, { gender: "MALE", interestPaywall: true });
  feed = [plain];
  decide = { status: 200, body: { match: false, creditsLeft: 0 } };
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (url.startsWith("/api/suggestions/feed")) {
      return { ok: true, status: 200, json: async () => ({ items: feed, total: feed.length, totalPages: 1 }) };
    }
    if (url.includes("/decide")) return { ok: decide.status < 400, status: decide.status, json: async () => decide.body };
    return { ok: true, status: 200, json: async () => ({}) };
  });
  vi.stubGlobal("fetch", fetchMock);
  window.history.replaceState(null, "", "/dashboard/suggestions");
});
afterEach(() => vi.unstubAllGlobals());

describe("«مهتم» at 0 credits opens the paywall (switch interest_paywall)", () => {
  it("«مهتم» stays enabled and opens the «انتهى رصيدك» step: no choice, a recharge link, nothing sent", async () => {
    render(<MutualSuggestionsView creditOnInterest credits={0} chatEnabled />);
    const btn = await screen.findByRole("button", { name: /^مهتم ·/ });
    expect(btn).toBeEnabled();
    expect(screen.getByRole("button", { name: /^لا ·/ })).toBeEnabled();
    fireEvent.click(btn);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "انتهى رصيدك" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("radio")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /تأكيد «مهتم»/ })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "اشحن رصيدك للمتابعة" })).toHaveAttribute("href", "/dashboard/payments");
    expect(within(dialog).getByRole("button", { name: "إلغاء" })).toBeInTheDocument();
    expect(decideCalls()).toHaveLength(0);
  });

  it("a woman viewing reads the feminine copy", async () => {
    ctx.gender = "FEMALE";
    render(<MutualSuggestionsView creditOnInterest credits={0} chatEnabled />);
    fireEvent.click(await screen.findByRole("button", { name: /^مهتم ·/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "انتهى رصيدكِ" })).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "اشحني رصيدك للمتابعة" })).toBeInTheDocument();
  });

  it("an older card (no introduction choice) opens the same step", async () => {
    feed = [legacy];
    render(<MutualSuggestionsView creditOnInterest credits={0} chatEnabled />);
    fireEvent.click(await screen.findByRole("button", { name: /^مهتم ·/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "انتهى رصيدك" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /تأكيد «مهتم»/ })).not.toBeInTheDocument();
  });

  it("members who can't buy (interestPaywall false or not loaded) keep the greyed «مهتم»", async () => {
    for (const v of [false, undefined]) {
      ctx.interestPaywall = v;
      const { unmount } = render(<MutualSuggestionsView creditOnInterest credits={0} chatEnabled />);
      expect(await screen.findByRole("button", { name: /^مهتم ·/ })).toBeDisabled();
      unmount();
    }
  });

  it("the free reply still goes through for free, never the paywall", async () => {
    feed = [liked];
    window.history.replaceState(null, "", "/dashboard/suggestions?tab=interested");
    render(<MutualSuggestionsView creditOnInterest freeInterestReply credits={0} chatEnabled />);
    fireEvent.click(await screen.findByRole("button", { name: /^مهتم ·/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("heading", { name: "انتهى رصيدك" })).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("radio", { name: /محادثة هنا أولاً/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: /تأكيد «مهتم»/ }));
    await waitFor(() => expect(decideCalls()).toHaveLength(1));
  });

  it("NO_CREDITS while confirming (balance spent elsewhere) turns the dialog into the paywall step", async () => {
    decide = { status: 402, body: { code: "NO_CREDITS", error: "رصيدك غير كافٍ" } };
    render(<MutualSuggestionsView creditOnInterest credits={1} chatEnabled />);
    fireEvent.click(await screen.findByRole("button", { name: /^مهتم ·/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("radio", { name: /محادثة هنا أولاً/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: /تأكيد «مهتم»/ }));
    expect(await within(dialog).findByRole("heading", { name: "انتهى رصيدك" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("radio")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "اشحن رصيدك للمتابعة" })).toBeInTheDocument();
  });
});
