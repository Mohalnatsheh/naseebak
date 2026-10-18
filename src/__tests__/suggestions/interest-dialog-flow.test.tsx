import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/contexts/dashboard-context", () => ({
  useDashboardData: () => ({
    profile: { gender: "MALE" },
    counts: { flags: {}, guardian: { exists: true, consented: true } },
    refreshProfile: vi.fn(async () => {}),
    refreshUnread: vi.fn(),
  }),
}));
vi.mock("@/components/suggestions/dealbreakers-card", () => ({ DealbreakersCard: () => null }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));

import { MutualSuggestionsView } from "@/components/suggestions/mutual-suggestions-view";

const candidate = { id: "c1", firstName: "سارة", isVerified: false, childrenCount: 0 } as const;
const item = { kind: "mutual", id: "s1", compatibilityScore: 70, reason: "سبب", createdAt: "2026-10-01", candidate };
const fetchMock = vi.fn();
let decideResponse: { status: number; body: unknown };
let release: (() => void) | null;

beforeEach(() => {
  release = null;
  decideResponse = { status: 200, body: { match: false, creditsLeft: 2 } };
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (url.startsWith("/api/suggestions/feed")) {
      const isNew = url.includes("tab=new");
      return { ok: true, status: 200, json: async () => ({ items: isNew ? [item] : [], total: isNew ? 1 : 0, totalPages: 1 }) };
    }
    if (url.includes("/decide")) {
      await new Promise<void>((r) => (release = r));
      return { ok: decideResponse.status < 400, status: decideResponse.status, json: async () => decideResponse.body };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

async function openAndConfirmChat() {
  render(<MutualSuggestionsView creditOnInterest credits={3} chatEnabled />);
  fireEvent.click(await screen.findByRole("button", { name: /^مهتم$/ }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByRole("radio", { name: /محادثة هنا أولاً/ }));
  const btn = within(dialog).getByRole("button", { name: /تأكيد «مهتم»/ });
  fireEvent.click(btn);
  return dialog;
}

describe("«مهتم» dialog waits for the server", () => {
  it("stays open and busy until the answer, then closes on success", async () => {
    const dialog = await openAndConfirmChat();
    await waitFor(() => expect(release).not.toBeNull());
    // Still open while the request is in flight; cancel is disabled
    expect(screen.getByRole("dialog")).toBe(dialog);
    expect(within(dialog).getByRole("button", { name: "إلغاء" })).toBeDisabled();
    release!();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("shows a fixable error inside the dialog and keeps it open", async () => {
    decideResponse = { status: 412, body: { code: "CONSENT_REQUIRED", error: "يلزم موافقتك على مشاركة بيانات وليّ الأمر" } };
    const dialog = await openAndConfirmChat();
    await waitFor(() => expect(release).not.toBeNull());
    release!();
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("يلزم موافقتك على مشاركة بيانات وليّ الأمر");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("a card that is gone closes the dialog and says so on the page", async () => {
    decideResponse = { status: 404, body: { code: "NOT_FOUND", error: "الاقتراح غير موجود" } };
    await openAndConfirmChat();
    await waitFor(() => expect(release).not.toBeNull());
    release!();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByText(/الاقتراح غير موجود/)).toBeInTheDocument();
  });
});
