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
const mutualMod = vi.hoisted(() => ({ closeLegacyInFlight: vi.fn(async () => ({ closed: 0 })) }));
vi.mock("@/lib/suggestions/mutual", () => mutualMod);
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
  it("switching credit on interest on closes older-style suggestions in flight (and only then)", async () => {
    await patch({ creditOnInterest: true });
    expect(mutualMod.closeLegacyInFlight).toHaveBeenCalledTimes(1);
    await patch({ creditOnInterest: false });
    await patch({ chat: true });
    expect(mutualMod.closeLegacyInFlight).toHaveBeenCalledTimes(1);
  });

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

  it("saves and reports the «جديدة» order switch, off by default, without touching the others", async () => {
    expect((await (await patch({})).json()).activeFirstFeed).toBe(false);
    const res = await patch({ activeFirstFeed: true });
    expect(store.value.feed_active_first).toBe("true");
    expect((await res.json()).activeFirstFeed).toBe(true);
    await patch({ activeFirstFeed: false });
    expect(store.value.feed_active_first).toBe("false");
    expect(settings.setSetting.mock.calls.map((c) => c[0])).toEqual(["feed_active_first", "feed_active_first"]);
    expect(mutualMod.closeLegacyInFlight).not.toHaveBeenCalled();
  });

  it("saves and reports the Saudi relaxed matching switch, off by default", async () => {
    expect((await (await patch({})).json()).saRelaxedMatching).toBe(false);
    const res = await patch({ saRelaxedMatching: true });
    expect(store.value.sa_relaxed_matching).toBe("true");
    expect((await res.json()).saRelaxedMatching).toBe(true);
    expect(settings.setSetting.mock.calls.map((c) => c[0])).toEqual(["sa_relaxed_matching"]);
  });

  it("saves and reports the free «مهتم» reply switch, off by default", async () => {
    expect((await (await patch({})).json()).freeInterestReply).toBe(false);
    const res = await patch({ freeInterestReply: true });
    expect(store.value.free_interest_reply).toBe("true");
    expect((await res.json()).freeInterestReply).toBe(true);
    expect(settings.setSetting.mock.calls.map((c) => c[0])).toEqual(["free_interest_reply"]);
    expect(mutualMod.closeLegacyInFlight).not.toHaveBeenCalled();
  });

  it("turning credit on interest (or a parent) off also turns the free reply off, so it never comes back silently", async () => {
    for (const off of [{ creditOnInterest: false }, { mutualSuggestions: false }, { introRequests: false }]) {
      store.value = { ...store.value, intro_requests_enabled: "true", new_suggestions_flow: "true", credit_on_interest: "true", free_interest_reply: "true" };
      await patch(off);
      expect(store.value.free_interest_reply).toBe("false");
    }
  });

  it("refuses a non-boolean order switch", async () => {
    expect((await patch({ activeFirstFeed: "yes" })).status).toBe(400);
  });

  it("the Pro sales switch saves on its own and is reported back", async () => {
    const res = await patch({ proEnabled: true });
    expect(res.status).toBe(200);
    expect(store.value.pro_enabled).toBe("true");
    expect((await res.json()).proEnabled).toBe(true);
    // none of the other switches move it
    await patch({ introRequests: false });
    expect(store.value.pro_enabled).toBe("true");
    await patch({ proEnabled: false });
    expect(store.value.pro_enabled).toBe("false");
    expect((await patch({ proEnabled: "yes" })).status).toBe(400);
  });
});
