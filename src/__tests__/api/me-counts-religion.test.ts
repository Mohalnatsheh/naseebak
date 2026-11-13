import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({ conversation: { count: vi.fn() }, user: { findUnique: vi.fn() }, introRequest: { count: vi.fn(), findFirst: vi.fn() }, message: { count: vi.fn() }, parentInfo: { findUnique: vi.fn() } }));
const sw = vi.hoisted(() => ({ introRequests: false, religion: "false" }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/activity", () => ({ touchLastActive: vi.fn() }));
vi.mock("@/lib/activity-days", () => ({ recordActivityDay: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn(async () => ({ session: { user: { id: "u1" } } })) }));
vi.mock("@/lib/settings", () => ({
  getCycleFlags: vi.fn(async () => ({ introRequests: sw.introRequests, chat: false, mutualSuggestions: false })),
  getReligionEnabled: vi.fn(async () => {
    if (sw.religion === "throw") throw new Error("settings down");
    return sw.religion === "true";
  }),
}));
vi.mock("@/lib/chat/service", () => ({ chatHousekeepingForUser: async () => {} }));
vi.mock("@/lib/matches/state", () => ({
  cancelDeadPendingFor: async () => {},
  loadMatchStates: vi.fn(async () => new Map()),
  hiddenPartnerIds: vi.fn(async () => []),
  visibleConversationsWhere: vi.fn(() => ({})),
}));
const paywall = vi.hoisted(() => ({ interestPaywallFor: vi.fn() }));
vi.mock("@/lib/payments/interest-paywall", () => paywall);
const proState = vi.hoisted(() => ({ getMyProState: vi.fn() }));
vi.mock("@/lib/pro/my-state", () => ({ getMyProState: proState.getMyProState, isAppRequest: () => false }));

import { GET } from "@/app/api/me/counts/route";

beforeEach(() => {
  vi.clearAllMocks();
  proState.getMyProState.mockResolvedValue(undefined);
  paywall.interestPaywallFor.mockResolvedValue(false);
  db.conversation.count.mockResolvedValue(0);
  db.user.findUnique.mockResolvedValue({ matchCredits: 3, country: "JO", phone: "962770000000" });
  db.introRequest.count.mockResolvedValue(0);
  db.introRequest.findFirst.mockResolvedValue(null);
  db.message.count.mockResolvedValue(0);
  db.parentInfo.findUnique.mockResolvedValue(null);
});

describe("GET /api/me/counts: religionEnabled", () => {
  it("sends religionEnabled from the switch, also with the intro switch off", async () => {
    for (const intro of [false, true]) {
      sw.introRequests = intro;
      sw.religion = "true";
      expect((await (await GET(new Request("http://x/api/me/counts"))).json()).religionEnabled).toBe(true);
      sw.religion = "false";
      expect((await (await GET(new Request("http://x/api/me/counts"))).json()).religionEnabled).toBe(false);
    }
  });

  it("answers 200 with religionEnabled false when the switch read fails", async () => {
    sw.religion = "throw";
    const res = await GET(new Request("http://x/api/me/counts"));
    expect(res.status).toBe(200);
    expect((await res.json()).religionEnabled).toBe(false);
  });
});
