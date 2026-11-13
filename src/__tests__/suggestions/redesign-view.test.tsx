import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { toast } from "sonner";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
const ctx = vi.hoisted(() => ({ redesign: true as boolean | undefined, interestPaywall: false as boolean | undefined }));
vi.mock("@/contexts/dashboard-context", () => ({
  useDashboardData: () => ({
    profile: { gender: "MALE" },
    country: "JO",
    counts: {
      flags: {},
      guardian: { exists: true, consented: true },
      interestPaywall: ctx.interestPaywall,
      dashboardRedesign: ctx.redesign,
    },
    refreshProfile: vi.fn(async () => {}),
    refreshUnread: vi.fn(),
  }),
}));
vi.mock("@/components/suggestions/dealbreakers-card", () => ({ DealbreakersCard: () => null }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));

import { MutualSuggestionsView } from "@/components/suggestions/mutual-suggestions-view";

const candidate = {
  id: "c1", firstName: "نسرين", isVerified: false, age: 27, city: "عمّان", childrenCount: 0,
  job: "معلمة", education: "بكالوريوس", aboutMe: "أحب القراءة",
};
const plain = { kind: "mutual", id: "s1", compatibilityScore: 82, reason: "تتفقان على الاستقرار", createdAt: "2026-11-01", candidate };
const liked = { ...plain, likedYou: true };
const waitingItem = { ...plain, expiresAt: "2026-11-20T10:00:00Z" };
const declinedItem = { ...plain, declined: true };
const fetchMock = vi.fn();
let feed: Record<string, unknown[]>;
const decideCalls = () => fetchMock.mock.calls.filter((c) => String(c[0]).includes("/decide"));
const sheet = () => screen.queryByRole("dialog", { name: "نسرين، 27" });

async function openSheet() {
  fireEvent.click(await screen.findByRole("button", { name: "الملف كاملاً: نسرين" }));
  const d = sheet();
  expect(d).toBeInTheDocument();
  return d!;
}

beforeEach(() => {
  Object.assign(ctx, { redesign: true, interestPaywall: false });
  feed = { new: [plain], interested: [], waiting: [] };
  fetchMock.mockReset();
  vi.mocked(toast).mockClear();
  fetchMock.mockImplementation(async (url: string) => {
    if (url.startsWith("/api/suggestions/feed")) {
      const t = new URL(url, "http://x").searchParams.get("tab") ?? "new";
      const items = feed[t] ?? [];
      return { ok: true, status: 200, json: async () => ({ items, total: items.length, totalPages: 1 }) };
    }
    if (url.includes("/decide")) return { ok: true, status: 200, json: async () => ({ match: false, creditsLeft: 2 }) };
    return { ok: true, status: 200, json: async () => ({}) };
  });
  vi.stubGlobal("fetch", fetchMock);
  window.history.replaceState(null, "", "/dashboard/suggestions");
});
afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  // ProfileSheet removes its history entry a tick after closing
  await new Promise((r) => setTimeout(r, 20));
});

describe("suggestions page with dashboard_redesign", () => {
  it("switch off: today's card, with «عرض جميع التفاصيل» and no short card", async () => {
    ctx.redesign = false;
    render(<MutualSuggestionsView creditOnInterest credits={3} chatEnabled />);
    expect(await screen.findByRole("button", { name: /عرض جميع التفاصيل/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "الملف كاملاً: نسرين" })).not.toBeInTheDocument();
  });

  it("switch on: the short card replaces it, and a tap opens the profile sheet", async () => {
    render(<MutualSuggestionsView creditOnInterest credits={3} chatEnabled />);
    await openSheet();
    expect(screen.queryByRole("button", { name: /عرض جميع التفاصيل/ })).not.toBeInTheDocument();
    // The why line lives in the sheet, not on the card
    expect(within(sheet()!).getByText("تتفقان على الاستقرار")).toBeInTheDocument();
    // ⋮ sits in the sheet's header, once
    expect(within(sheet()!).getAllByRole("button", { name: "خيارات إضافية: نسرين" })).toHaveLength(1);
  });

  it("«مهتم» in the sheet closes it and goes through the same interest dialog to /decide", async () => {
    render(<MutualSuggestionsView creditOnInterest credits={3} chatEnabled />);
    const d = await openSheet();
    expect(within(d).getByText("«مهتم» يستخدم رصيداً واحداً")).toBeInTheDocument();
    fireEvent.click(within(d).getByRole("button", { name: "مهتم · نسرين" }));
    await waitFor(() => expect(sheet()).not.toBeInTheDocument());
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("radio", { name: /محادثة هنا أولاً/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: /تأكيد «مهتم»/ }));
    await waitFor(() => expect(decideCalls()).toHaveLength(1));
    expect(decideCalls()[0][0]).toBe("/api/suggestions/s1/decide");
    expect(JSON.parse(decideCalls()[0][1].body)).toMatchObject({ interested: true, introPreference: "CHAT" });
  });

  it("«مهتم» without credit on interest is sent at once and the sheet closes", async () => {
    render(<MutualSuggestionsView chatEnabled />);
    const d = await openSheet();
    fireEvent.click(within(d).getByRole("button", { name: "مهتم · نسرين" }));
    await waitFor(() => expect(sheet()).not.toBeInTheDocument());
    await waitFor(() => expect(decideCalls()).toHaveLength(1));
  });

  it("«لا» in the sheet closes it, offers «تراجع» and the card leaves the list", async () => {
    render(<MutualSuggestionsView creditOnInterest credits={3} chatEnabled />);
    const d = await openSheet();
    fireEvent.click(within(d).getByRole("button", { name: "لا · نسرين" }));
    await waitFor(() => expect(sheet()).not.toBeInTheDocument());
    expect(toast).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ action: expect.objectContaining({ label: "تراجع" }) }));
    expect(screen.queryByRole("button", { name: "الملف كاملاً: نسرين" })).not.toBeInTheDocument();
    expect(decideCalls()).toHaveLength(0); // sent only after the undo window
  });

  it("«تراجع» brings the card back without reopening the sheet", async () => {
    render(<MutualSuggestionsView creditOnInterest credits={3} chatEnabled />);
    const d = await openSheet();
    fireEvent.click(within(d).getByRole("button", { name: "لا · نسرين" }));
    await waitFor(() => expect(sheet()).not.toBeInTheDocument());
    const opts = vi.mocked(toast).mock.calls[0][1] as unknown as { action: { onClick: () => void } };
    opts.action.onClick();
    expect(await screen.findByRole("button", { name: "الملف كاملاً: نسرين" })).toBeInTheDocument();
    expect(sheet()).not.toBeInTheDocument();
    expect(decideCalls()).toHaveLength(0);
  });

  it("cancelling the «مهتم» dialog opened from the sheet puts the focus back on the card's «مهتم»", async () => {
    render(<MutualSuggestionsView creditOnInterest credits={3} chatEnabled />);
    const d = await openSheet();
    fireEvent.click(within(d).getByRole("button", { name: "مهتم · نسرين" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "إلغاء" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "مهتم · نسرين" })));
    expect(decideCalls()).toHaveLength(0);
  });

  it("0 credits, no paywall: the sheet's «مهتم» is greyed and the recharge link shows", async () => {
    render(<MutualSuggestionsView creditOnInterest credits={0} chatEnabled />);
    const d = await openSheet();
    expect(within(d).getByRole("button", { name: "مهتم · نسرين" })).toBeDisabled();
    expect(within(d).getByRole("button", { name: "لا · نسرين" })).toBeEnabled();
    expect(within(d).getByRole("link", { name: "اشحن رصيدك للمتابعة" })).toHaveAttribute("href", "/dashboard/payments");
  });

  it("0 credits with the paywall: the sheet's «مهتم» opens the «انتهى رصيدك» step", async () => {
    ctx.interestPaywall = true;
    render(<MutualSuggestionsView creditOnInterest credits={0} chatEnabled />);
    const d = await openSheet();
    const btn = within(d).getByRole("button", { name: "مهتم · نسرين" });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    await waitFor(() => expect(sheet()).not.toBeInTheDocument());
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "انتهى رصيدك" })).toBeInTheDocument();
    expect(decideCalls()).toHaveLength(0);
  });

  it("0 credits, a free reply: the sheet's «مهتم» stays usable with the free line", async () => {
    feed = { new: [], interested: [liked], waiting: [] };
    window.history.replaceState(null, "", "/dashboard/suggestions?tab=interested");
    render(<MutualSuggestionsView creditOnInterest freeInterestReply credits={0} chatEnabled />);
    const d = await openSheet();
    expect(within(d).getByRole("button", { name: "مهتم · نسرين" })).toBeEnabled();
    expect(within(d).getByText("الرد بـ«مهتم» مجاني")).toBeInTheDocument();
  });

  it("«بانتظار ردّهم»: card and sheet show the waiting note, no «مهتم» or «لا»", async () => {
    feed = { new: [], interested: [], waiting: [waitingItem] };
    window.history.replaceState(null, "", "/dashboard/suggestions?tab=waiting");
    render(<MutualSuggestionsView creditOnInterest credits={3} chatEnabled />);
    await screen.findByRole("button", { name: "الملف كاملاً: نسرين" });
    expect(screen.getByText(/إذا أبدت اهتمامها أيضاً/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^(مهتم|لا) ·/ })).not.toBeInTheDocument();
    const d = await openSheet();
    expect(within(d).getByText(/إذا أبدت اهتمامها أيضاً/)).toBeInTheDocument();
    expect(within(d).queryByRole("button", { name: /^(مهتم|لا) ·/ })).not.toBeInTheDocument();
    expect(within(d).getAllByRole("button", { name: "خيارات إضافية: نسرين" })).toHaveLength(1);
  });

  it("«بانتظار ردّهم», declined: «لم يحصل توافق» on the card and the note in the sheet", async () => {
    feed = { new: [], interested: [], waiting: [declinedItem] };
    window.history.replaceState(null, "", "/dashboard/suggestions?tab=waiting");
    render(<MutualSuggestionsView creditOnInterest credits={3} chatEnabled />);
    expect(await screen.findByText("لم يحصل توافق")).toBeInTheDocument();
    const d = await openSheet();
    expect(within(d).getByText(/اختارت «لا» هذه المرة/)).toBeInTheDocument();
    expect(within(d).queryByRole("button", { name: /^(مهتم|لا) ·/ })).not.toBeInTheDocument();
  });
});
