import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const onesignal = vi.hoisted(() => ({
  default: {
    Notifications: { requestPermission: vi.fn() },
    User: { PushSubscription: { optedIn: false, optIn: vi.fn(async () => {}) } },
  },
}));
vi.mock("react-onesignal", () => onesignal);
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));

function browserPermission(answer: NotificationPermission) {
  const requestPermission = vi.fn(async () => answer);
  vi.stubGlobal("Notification", { permission: "default", requestPermission });
  return requestPermission;
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
  onesignal.default.User.PushSubscription.optedIn = false;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("requestPushPermission before OneSignal is ready (G66)", () => {
  it("opts the device in once the SDK becomes ready after a browser-prompt grant", async () => {
    const { requestPushPermission, markOneSignalReady } = await import("@/lib/push-client");
    const prompt = browserPermission("granted");
    await requestPushPermission();
    expect(prompt).toHaveBeenCalled();
    expect(onesignal.default.User.PushSubscription.optIn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(3000);
    markOneSignalReady();
    await vi.advanceTimersByTimeAsync(0);
    await vi.dynamicImportSettled();
    expect(onesignal.default.User.PushSubscription.optIn).toHaveBeenCalledTimes(1);
  });

  it("gives up after ~10 s when the SDK never loads", async () => {
    const { requestPushPermission, markOneSignalReady, READY_WAIT_MS } = await import("@/lib/push-client");
    browserPermission("granted");
    await requestPushPermission();
    await vi.advanceTimersByTimeAsync(READY_WAIT_MS + 1);
    markOneSignalReady();
    await vi.advanceTimersByTimeAsync(0);
    await vi.dynamicImportSettled();
    expect(onesignal.default.User.PushSubscription.optIn).not.toHaveBeenCalled();
  });

  it("does nothing when the browser prompt was refused", async () => {
    const { requestPushPermission, markOneSignalReady } = await import("@/lib/push-client");
    browserPermission("denied");
    await requestPushPermission();
    markOneSignalReady();
    await vi.advanceTimersByTimeAsync(0);
    await vi.dynamicImportSettled();
    expect(onesignal.default.User.PushSubscription.optIn).not.toHaveBeenCalled();
  });

  it("uses OneSignal's own prompt when it is ready", async () => {
    const { requestPushPermission, markOneSignalReady } = await import("@/lib/push-client");
    const prompt = browserPermission("granted");
    markOneSignalReady();
    await requestPushPermission();
    expect(onesignal.default.Notifications.requestPermission).toHaveBeenCalled();
    expect(prompt).not.toHaveBeenCalled();
  });
});
