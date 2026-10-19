import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

const listeners = vi.hoisted(() => ({ permission: [] as ((granted: boolean) => void)[] }));
const onesignal = vi.hoisted(() => ({
  default: {
    init: vi.fn(async () => {}),
    login: vi.fn(async () => {}),
    Notifications: {
      addEventListener: vi.fn((event: string, fn: (granted: boolean) => void) => {
        if (event === "permissionChange") listeners.permission.push(fn);
      }),
    },
    User: {
      PushSubscription: { optedIn: false, id: null, optIn: vi.fn(async () => {}), addEventListener: vi.fn() },
    },
  },
}));
vi.mock("react-onesignal", () => onesignal);
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { id: "u1", role: "USER" } } }) }));

import { OneSignalProvider } from "@/components/shared/onesignal-provider";

beforeEach(() => {
  vi.clearAllMocks();
  listeners.permission = [];
  process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID = "app-1";
  vi.stubGlobal("Notification", { permission: "default" });
});

describe("OneSignalProvider permissionChange (G66)", () => {
  it("opts in when the permission turns to granted after the SDK loaded", async () => {
    render(<OneSignalProvider />);
    await waitFor(() => expect(listeners.permission).toHaveLength(1));
    expect(onesignal.default.User.PushSubscription.optIn).not.toHaveBeenCalled();
    listeners.permission[0](false);
    expect(onesignal.default.User.PushSubscription.optIn).not.toHaveBeenCalled();
    listeners.permission[0](true);
    expect(onesignal.default.User.PushSubscription.optIn).toHaveBeenCalledTimes(1);
  });
});
