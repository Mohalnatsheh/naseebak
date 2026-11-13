import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor, fireEvent, within } from "@testing-library/react";

const data = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock("@/contexts/dashboard-context", () => ({ useDashboardData: () => data.current }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/dashboard/suggestions",
}));
vi.mock("@/lib/notifications-client", () => ({ markPageNotificationsRead: () => {} }));
// The intro panel owns its own data: a stub proves it stays on the card
vi.mock("@/components/intro/match-intro-panel", () => ({
  MatchIntroPanel: ({ matchId }: { matchId: string }) => <div data-testid={`intro-${matchId}`}>خطوات التعارف</div>,
  MatchClosedNote: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

const flags = { introRequests: true, chat: true, mutualSuggestions: true, creditOnInterest: true };

function partner(firstName: string) {
  return {
    id: `u-${firstName}`, firstName, isVerified: false, isPro: false, age: 27, city: "عمّان", area: null,
    nationality: null, education: null, fieldOfStudy: null, job: null, incomeRange: null, height: null, weight: null,
    skinColor: null, maritalStatus: null, childrenCount: 0, religiosity: null, religion: null, sect: null,
    smokingStatus: null, aboutMe: null, hobbies: null, interests: null, lifestyle: null, beard: null, hijab: null,
    niqab: null, tribe: null, familyOriginArea: null, numberOfSiblings: null, housingType: null, cookingAbility: null,
    drivingLicense: null, willingToRelocate: null, familyValues: null,
  };
}
function match(id: string, name: string, over: Record<string, unknown> = {}) {
  return {
    id, closed: null, blockId: null, photosRevealed: true, revealed: true, createdAt: "2026-11-10T09:00:00Z",
    visitRequestId: null, visitStatus: null, scheduledDate: null, compatibilityScore: 80, partner: partner(name), ...over,
  };
}
const matches = [
  match("m1", "سارة"),
  match("m2", "ليلى", { photosRevealed: false }),
  match("m3", "هند", { closed: "blocked", blockId: "b3" }),
];

let photoCalls: string[] = [];
let photosOk = true;
function mockFetch() {
  photoCalls = [];
  vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = String(input);
    const m = url.match(/\/api\/matches\/([^/]+)\/photos/);
    if (m) {
      photoCalls.push(m[1]);
      return Promise.resolve({
        ok: photosOk, status: photosOk ? 200 : 500,
        json: async () => ({ photos: [{ id: "p1", url: `https://cdn.test/${m[1]}.webp` }] }),
      } as Response);
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ matches, totalPages: 1 }) } as Response);
  });
}

function setSwitch(on: boolean) {
  data.current = {
    loading: false, profile: { gender: "MALE" }, country: "JO",
    counts: { flags, pendingIntros: 0, dashboardRedesign: on },
  };
}

async function renderView() {
  const { MatchesView } = await import("@/components/matches/matches-view");
  render(<MatchesView embedded />);
  await waitFor(() => expect(screen.getByTestId("intro-m1")).toBeTruthy());
}

beforeEach(() => {
  vi.restoreAllMocks();
  photosOk = true;
  mockFetch();
});
afterEach(async () => {
  cleanup();
  await new Promise((r) => setTimeout(r, 20));
});

describe("«التوافقات» card with dashboard_redesign off (today's card)", () => {
  it("keeps «عرض جميع التفاصيل» and «عرض الصور», and no «الملف كاملاً»", async () => {
    setSwitch(false);
    await renderView();
    expect(screen.getByRole("button", { name: "عرض جميع التفاصيل: سارة" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "عرض الصور" })).toBeTruthy();
    expect(screen.getByText("الصور غير متاحة بعد")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /الملف كاملاً/ })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("«التوافقات» card with dashboard_redesign on", () => {
  it("shows one «الملف كاملاً» per open card and neither old button", async () => {
    setSwitch(true);
    await renderView();
    expect(screen.getByRole("button", { name: "الملف كاملاً: سارة" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "الملف كاملاً: ليلى" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /الملف كاملاً/ })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /عرض جميع التفاصيل/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "عرض الصور" })).toBeNull();
    expect(screen.queryByText("الصور غير متاحة بعد")).toBeNull();
  });

  it("gives a locked card no button", async () => {
    setSwitch(true);
    await renderView();
    expect(screen.queryByRole("button", { name: "الملف كاملاً: هند" })).toBeNull();
    expect(screen.getByRole("button", { name: "إلغاء الحظر" })).toBeTruthy();
  });

  it("keeps the intro panel on every open card", async () => {
    setSwitch(true);
    await renderView();
    expect(screen.getByTestId("intro-m1")).toBeTruthy();
    expect(screen.getByTestId("intro-m2")).toBeTruthy();
    expect(screen.queryByTestId("intro-m3")).toBeNull();
  });

  it("opens the panel for that match with its photos from the existing loader", async () => {
    setSwitch(true);
    await renderView();
    fireEvent.click(screen.getByRole("button", { name: "الملف كاملاً: سارة" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("سارة، 27")).toBeTruthy();
    await waitFor(() => expect(within(dialog).getAllByRole("button", { name: /عرض الصورة/ })).toHaveLength(1));
    expect(photoCalls).toEqual(["m1"]);
    expect(dialog.querySelector('img[src="https://cdn.test/m1.webp"]')).toBeTruthy();
  });

  it("never asks for photos of an unrevealed match", async () => {
    setSwitch(true);
    await renderView();
    fireEvent.click(screen.getByRole("button", { name: "الملف كاملاً: ليلى" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("ليلى، 27")).toBeTruthy();
    await new Promise((r) => setTimeout(r, 20));
    expect(photoCalls).toEqual([]);
    expect(within(dialog).queryByRole("button", { name: /عرض الصورة/ })).toBeNull();
  });

  it("shows the failure line with a retry that loads again", async () => {
    setSwitch(true);
    photosOk = false;
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    await renderView();
    fireEvent.click(screen.getByRole("button", { name: "الملف كاملاً: سارة" }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(within(dialog).getByText("تعذّر تحميل الصور.")).toBeTruthy());
    photosOk = true;
    fireEvent.click(within(dialog).getByRole("button", { name: "إعادة المحاولة" }));
    await waitFor(() => expect(within(dialog).getAllByRole("button", { name: /عرض الصورة/ })).toHaveLength(1));
    expect(photoCalls).toEqual(["m1", "m1"]);
    expect(logged).toHaveBeenCalledTimes(1);
  });
});
