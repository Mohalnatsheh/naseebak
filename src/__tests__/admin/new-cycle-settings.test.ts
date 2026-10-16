import { describe, it, expect, vi, beforeEach } from "vitest";

const store = vi.hoisted(() => ({ value: {} as Record<string, string> }));
const settings = vi.hoisted(() => ({
  getSetting: vi.fn(async (key: string) => store.value[key] ?? "false"),
  setSetting: vi.fn(async (key: string, value: string) => {
    store.value[key] = value;
  }),
  getCycleFlags: vi.fn(async () => ({
    introRequests: store.value.intro_requests_enabled === "true",
    chat: false,
    mutualSuggestions: false,
    creditOnInterest: false,
  })),
}));
vi.mock("@/lib/settings", () => settings);
vi.mock("@/lib/db", () => ({ db: { systemSetting: { findUnique: vi.fn(async () => null) } } }));
vi.mock("@/lib/auth", () => ({
  requireAdmin: vi.fn(async () => ({ session: { user: { id: "admin1", role: "ADMIN" } } })),
}));

import { PATCH } from "@/app/api/admin/settings/new-cycle/route";

const patch = async (body: object) =>
  (await PATCH(
    new Request("http://localhost/api/admin/settings/new-cycle", { method: "PATCH", body: JSON.stringify(body) })
  )) as Response;

beforeEach(() => {
  vi.clearAllMocks();
  store.value = { intro_requests_enabled: "true", new_suggestions_flow: "true", credit_on_interest: "true" };
});

describe("new-cycle settings PATCH", () => {
  it("turning shared suggestions off also turns credit on interest off", async () => {
    const res = await patch({ mutualSuggestions: false });
    expect(res.status).toBe(200);
    expect(store.value.credit_on_interest).toBe("false");
    // turning shared suggestions back on does not bring it back
    await patch({ mutualSuggestions: true });
    expect(store.value.new_suggestions_flow).toBe("true");
    expect(store.value.credit_on_interest).toBe("false");
    expect((await (await patch({})).json()).creditOnInterest).toBe(false);
  });

  it("turning intro requests off also turns credit on interest off", async () => {
    await patch({ introRequests: false });
    expect(store.value.credit_on_interest).toBe("false");
  });

  it("other changes leave credit on interest alone", async () => {
    await patch({ chat: false });
    await patch({ mutualSuggestions: true, introRequests: true });
    expect(store.value.credit_on_interest).toBe("true");
    expect(settings.setSetting).not.toHaveBeenCalledWith("credit_on_interest", expect.anything());
  });
});
