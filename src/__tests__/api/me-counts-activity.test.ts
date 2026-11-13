import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({ conversation: { count: vi.fn() }, user: { findUnique: vi.fn(async () => null) } }));
const activity = vi.hoisted(() => ({ touchLastActive: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/activity", () => activity);
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn(async () => ({ session: { user: { id: "u1" } } })) }));
vi.mock("@/lib/settings", () => ({
  getDashboardRedesign: vi.fn(async () => false),
  getCycleFlags: vi.fn(async () => ({ introRequests: false, chat: false, mutualSuggestions: false })),
  getReligionEnabled: vi.fn(async () => false),
}));
vi.mock("@/lib/chat/service", () => ({ chatHousekeepingForUser: vi.fn() }));
vi.mock("@/lib/matches/state", () => ({
  cancelDeadPendingFor: vi.fn(),
  loadMatchStates: vi.fn(),
  hiddenPartnerIds: vi.fn(async () => []),
  visibleConversationsWhere: vi.fn(() => ({})),
}));

import { GET } from "@/app/api/me/counts/route";

beforeEach(() => {
  vi.clearAllMocks();
  db.conversation.count.mockResolvedValue(0);
});

describe("GET /api/me/counts", () => {
  it("records last activity for the signed-in user (the helper throttles to once per hour)", async () => {
    const res = await GET(new Request("http://x/api/me/counts"));
    expect(res.status).toBe(200);
    expect(activity.touchLastActive).toHaveBeenCalledWith("u1");
  });
});
