import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  conversation: { count: vi.fn() },
  user: { findUnique: vi.fn() },
  introRequest: { count: vi.fn(), findFirst: vi.fn() },
  message: { count: vi.fn() },
  parentInfo: { findUnique: vi.fn() },
}));
const settings = vi.hoisted(() => ({
  value: {} as Record<string, string>,
  flags: { introRequests: true, chat: false, mutualSuggestions: false },
  getCycleFlags: vi.fn(),
  getDashboardRedesign: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/activity", () => ({ touchLastActive: vi.fn() }));
vi.mock("@/lib/activity-days", () => ({ recordActivityDay: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn(async () => ({ session: { user: { id: "u1" } } })) }));
vi.mock("@/lib/settings", () => ({
  getCycleFlags: settings.getCycleFlags,
  getDashboardRedesign: settings.getDashboardRedesign,
}));
vi.mock("@/lib/chat/service", () => ({ chatHousekeepingForUser: vi.fn(async () => {}) }));
vi.mock("@/lib/matches/state", () => ({
  cancelDeadPendingFor: vi.fn(async () => {}),
  loadMatchStates: vi.fn(async () => new Map()),
  hiddenPartnerIds: vi.fn(async () => []),
  visibleConversationsWhere: vi.fn(() => ({})),
}));
const paywall = vi.hoisted(() => ({ interestPaywallFor: vi.fn() }));
vi.mock("@/lib/payments/interest-paywall", () => paywall);
const proState = vi.hoisted(() => ({ getMyProState: vi.fn() }));
vi.mock("@/lib/pro/my-state", async (orig) => ({
  ...(await orig<typeof import("@/lib/pro/my-state")>()),
  getMyProState: proState.getMyProState,
}));

import { GET } from "@/app/api/me/counts/route";

const web = new Request("http://x/api/me/counts");

beforeEach(() => {
  vi.clearAllMocks();
  settings.value = {};
  settings.flags = { introRequests: true, chat: false, mutualSuggestions: false };
  settings.getCycleFlags.mockImplementation(async () => settings.flags);
  settings.getDashboardRedesign.mockImplementation(async () => settings.value.dashboard_redesign === "true");
  paywall.interestPaywallFor.mockResolvedValue(false);
  proState.getMyProState.mockResolvedValue({ enabled: false, isPro: false, cancelAtPeriodEnd: false, canBuy: false });
  db.conversation.count.mockResolvedValue(0);
  db.introRequest.count.mockResolvedValue(0);
  db.introRequest.findFirst.mockResolvedValue(null);
  db.message.count.mockResolvedValue(0);
  db.parentInfo.findUnique.mockResolvedValue(null);
  db.user.findUnique.mockResolvedValue({ matchCredits: 3, country: "JO", phone: "962770000000" });
});

describe("GET /api/me/counts: dashboardRedesign", () => {
  it("sends dashboardRedesign true when the switch is on", async () => {
    settings.value.dashboard_redesign = "true";
    expect((await (await GET(web)).json()).dashboardRedesign).toBe(true);
  });
  it("sends dashboardRedesign false by default", async () => {
    expect((await (await GET(web)).json()).dashboardRedesign).toBe(false);
  });
  it("sends it on the early return too", async () => {
    settings.flags = { introRequests: false, chat: false, mutualSuggestions: false };
    settings.value.dashboard_redesign = "true";
    const json = await (await GET(web)).json();
    expect(typeof json.dashboardRedesign).toBe("boolean");
    expect(json.dashboardRedesign).toBe(true);
  });
});
