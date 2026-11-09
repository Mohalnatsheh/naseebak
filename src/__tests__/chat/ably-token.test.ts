import { describe, it, expect, vi } from "vitest";

const auth = vi.hoisted(() => ({ requireUser: vi.fn() }));
const ably = vi.hoisted(() => ({ isAblyConfigured: vi.fn(), createChatTokenRequest: vi.fn() }));
vi.mock("@/lib/auth", () => auth);
vi.mock("@/lib/ably", () => ably);
vi.mock("@/lib/db", () => ({ db: { conversation: { findMany: vi.fn().mockResolvedValue([]) } } }));
vi.mock("@/lib/matches/state", () => ({ hiddenPartnerIds: vi.fn().mockResolvedValue([]), visibleConversationsWhere: vi.fn(() => ({})) }));

import { GET } from "@/app/api/chats/ably-token/route";

describe("GET /api/chats/ably-token (QA chat WC-20)", () => {
  it("without Ably answers 200 { enabled: false } (no console 404; the app reads the missing keyName as 'not available')", async () => {
    auth.requireUser.mockResolvedValue({ session: { user: { id: "u1" } } });
    ably.isAblyConfigured.mockReturnValue(false);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ enabled: false });
    expect(body.keyName).toBeUndefined();
  });
});
