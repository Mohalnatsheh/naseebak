import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({ conversation: { count: vi.fn() }, user: { findUnique: vi.fn() } }));
const proState = vi.hoisted(() => ({ getMyProState: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/activity", () => ({ touchLastActive: vi.fn() }));
vi.mock("@/lib/activity-days", () => ({ recordActivityDay: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn(async () => ({ session: { user: { id: "u1" } } })) }));
vi.mock("@/lib/settings", () => ({
  getCycleFlags: vi.fn(async () => ({ introRequests: false, chat: false, mutualSuggestions: false })),
}));
vi.mock("@/lib/chat/service", () => ({ chatHousekeepingForUser: vi.fn() }));
vi.mock("@/lib/matches/state", () => ({
  cancelDeadPendingFor: vi.fn(),
  loadMatchStates: vi.fn(),
  hiddenPartnerIds: vi.fn(async () => []),
  visibleConversationsWhere: vi.fn(() => ({})),
}));
vi.mock("@/lib/pro/my-state", async (orig) => ({ ...(await orig<typeof import("@/lib/pro/my-state")>()), getMyProState: proState.getMyProState }));

import { GET } from "@/app/api/me/counts/route";

const web = new Request("http://x/api/me/counts");
const app = new Request("http://x/api/me/counts", { headers: { authorization: "Bearer t" } });
const me = { matchCredits: 3, country: "JO", phone: "962770000000" };
const state = (over: Record<string, unknown>) => ({ enabled: true, isPro: false, cancelAtPeriodEnd: false, canBuy: false, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  db.conversation.count.mockResolvedValue(0);
  db.user.findUnique.mockResolvedValue(me);
});

describe("GET /api/me/counts: the Pro page link rule", () => {
  it("showPage when plans can be bought", async () => {
    proState.getMyProState.mockResolvedValue(state({ canBuy: true }));
    const data = await (await GET(web)).json();
    expect(data.pro).toEqual({ isPro: false, cancelAtPeriodEnd: false, showPage: true });
    expect(proState.getMyProState).toHaveBeenCalledWith("u1", { app: false, me });
  });
  it("showPage for a subscriber, even with sales off", async () => {
    proState.getMyProState.mockResolvedValue(state({ enabled: false, isPro: true, cancelAtPeriodEnd: true }));
    expect((await (await GET(web)).json()).pro).toEqual({ isPro: true, cancelAtPeriodEnd: true, showPage: true });
  });
  it("no showPage when nothing can be bought (switch off, not selling, test account in the app)", async () => {
    proState.getMyProState.mockResolvedValue(state({ enabled: false }));
    expect((await (await GET(app)).json()).pro.showPage).toBe(false);
    expect(proState.getMyProState).toHaveBeenCalledWith("u1", { app: true, me });
  });
  it("a failed Pro lookup is logged and left out of the answer (the page keeps its badge), never fails the poll", async () => {
    proState.getMyProState.mockRejectedValue(new Error("db"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await GET(web);
    expect(res.status).toBe(200);
    expect((await res.json()).pro).toBeUndefined();
    expect(err).toHaveBeenCalledWith("Counts Pro state:", expect.any(Error));
    err.mockRestore();
  });
  it("one member read serves the balance and the Pro lookup", async () => {
    proState.getMyProState.mockResolvedValue(state({}));
    await GET(web);
    expect(db.user.findUnique).toHaveBeenCalledTimes(1);
  });
});
