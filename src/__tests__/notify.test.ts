import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  notification: { create: vi.fn() },
  notificationPreference: { findUnique: vi.fn() },
}));
const push = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/onesignal", () => ({ sendPushNotification: push }));

import { notify, notifyMany } from "@/lib/notify";

beforeEach(() => {
  vi.clearAllMocks();
  db.notification.create.mockResolvedValue({});
  db.notificationPreference.findUnique.mockResolvedValue(null);
  push.mockResolvedValue(undefined);
});

describe("notify", () => {
  it("stores the notification with its url and sends a push", async () => {
    await notify({ userId: "u1", type: "INTRO_REQUEST", title: "t", body: "b", url: "/dashboard/matches?match=m1" });
    expect(db.notification.create).toHaveBeenCalledTimes(1);
    const { data } = db.notification.create.mock.calls[0][0];
    expect(data).toMatchObject({ userId: "u1", type: "INTRO_REQUEST", title: "t", body: "b" });
    expect(data.metadata).toMatchObject({ url: "/dashboard/matches?match=m1" });
    expect(push).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", url: "/dashboard/matches?match=m1" }));
  });

  it("keeps the in-app row but skips push when the preference is off", async () => {
    db.notificationPreference.findUnique.mockResolvedValue({ introRequests: false });
    await notify({ userId: "u1", type: "INTRO_REQUEST", title: "t", body: "b" });
    expect(db.notification.create).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it("pushOnly sends no in-app row and respects chat preference", async () => {
    await notify({ userId: "u1", type: "CHAT", title: "t", body: "b", pushOnly: true, collapseId: "chat-c1" });
    expect(db.notification.create).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith(expect.objectContaining({ collapseId: "chat-c1" }));

    vi.clearAllMocks();
    db.notificationPreference.findUnique.mockResolvedValue({ chatMessages: false });
    await notify({ userId: "u1", type: "CHAT", title: "t", body: "b", pushOnly: true });
    expect(push).not.toHaveBeenCalled();
  });

  it("always pushes SYSTEM notifications", async () => {
    db.notificationPreference.findUnique.mockResolvedValue({
      suggestions: false, interests: false, matches: false, visitUpdates: false,
      payments: false, identity: false, support: false, introRequests: false, chatMessages: false,
    });
    await notify({ userId: "u1", type: "SYSTEM", title: "t", body: "b" });
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("never throws when the database fails", async () => {
    db.notification.create.mockRejectedValue(new Error("down"));
    await expect(notify({ userId: "u1", type: "MATCH", title: "t", body: "b" })).resolves.toBeUndefined();
  });

  it("notifyMany notifies every user", async () => {
    await notifyMany(["a", "b"], { type: "MATCH", title: "t", body: "b" });
    expect(db.notification.create).toHaveBeenCalledTimes(2);
  });
});
