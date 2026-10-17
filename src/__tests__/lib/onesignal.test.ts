import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_ONESIGNAL_APP_ID", "app");
  vi.stubEnv("ONESIGNAL_REST_API_KEY", "key");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://naseebak.com");
});

describe("sendPushNotification", () => {
  it("turns a same-site path into a full address (OneSignal needs one to open the page)", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { sendPushNotification } = await import("@/lib/onesignal");
    await sendPushNotification({ userId: "u1", title: "t", body: "b", url: "/dashboard/suggestions" });
    const sent = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(sent.url).toBe("https://naseebak.com/dashboard/suggestions");
    vi.unstubAllGlobals();
  });
});
