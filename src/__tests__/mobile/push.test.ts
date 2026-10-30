import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const db = vi.hoisted(() => ({
  pushDevice: { upsert: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn() },
  mobileSession: { findUnique: vi.fn() },
}));
const messaging = vi.hoisted(() => ({ sendEachForMulticast: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ session: { user: { id: "u1" } } }) }));
vi.mock("firebase-admin/app", () => ({ cert: (c: unknown) => c, getApps: () => [], initializeApp: () => ({ name: "naseebak-fcm" }) }));
vi.mock("firebase-admin/messaging", () => ({ getMessaging: () => messaging }));

import { POST, DELETE } from "@/app/api/mobile/push/route";
import { buildFcmMessage, sendFcmPush } from "@/lib/fcm";
import { hashMobileToken } from "@/lib/mobile-auth";

const FID = "fid_abcdefghijklmnop";
const NOW = new Date("2026-10-30T12:00:00Z");
const req = (method: string, body: unknown, bearer = "nsb_abc") =>
  new Request("http://x", { method, body: JSON.stringify(body), headers: { authorization: `Bearer ${bearer}` } });
const session = (over: Record<string, unknown> = {}) => ({
  id: "s1", userId: "u1", expiresAt: new Date("2099-01-01"), revokedAt: null, ...over,
});

const saved = { ...process.env };
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  db.mobileSession.findUnique.mockResolvedValue(session());
  db.pushDevice.deleteMany.mockResolvedValue({ count: 0 });
});
afterEach(() => {
  vi.useRealTimers();
  process.env = { ...saved };
});

describe("POST /api/mobile/push", () => {
  it("stores the FID on this app sign-in (moving it if another sign-in had it)", async () => {
    const res = await POST(req("POST", { fid: FID, platform: "android" }));
    expect(res.status).toBe(200);
    expect(db.mobileSession.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { tokenHash: hashMobileToken("nsb_abc") } }));
    const data = { userId: "u1", mobileSessionId: "s1", platform: "android" };
    expect(db.pushDevice.upsert).toHaveBeenCalledWith({ where: { fid: FID }, create: { fid: FID, ...data }, update: data });
  });

  it("refuses the website cookie, a revoked sign-in or another member's token", async () => {
    expect((await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ fid: FID, platform: "android" }) }))).status).toBe(403);
    db.mobileSession.findUnique.mockResolvedValue(session({ revokedAt: NOW }));
    expect((await POST(req("POST", { fid: FID, platform: "android" }))).status).toBe(403);
    db.mobileSession.findUnique.mockResolvedValue(session({ userId: "u2" }));
    expect((await POST(req("POST", { fid: FID, platform: "android" }))).status).toBe(403);
    expect(db.pushDevice.upsert).not.toHaveBeenCalled();
  });

  it("refuses a bad body", async () => {
    expect((await POST(req("POST", { fid: "short", platform: "android" }))).status).toBe(400);
    expect((await POST(req("POST", { fid: FID, platform: "web" }))).status).toBe(400);
  });
});

describe("DELETE /api/mobile/push", () => {
  it("removes only the member's own FID", async () => {
    expect((await DELETE(req("DELETE", { fid: FID }))).status).toBe(200);
    expect(db.pushDevice.deleteMany).toHaveBeenCalledWith({ where: { fid: FID, userId: "u1" } });
  });
});

describe("sendFcmPush", () => {
  it("skips everything without FCM_CREDENTIALS", async () => {
    delete process.env.FCM_CREDENTIALS;
    vi.resetModules();
    const { sendFcmPush: send } = await import("@/lib/fcm");
    await send({ userId: "u1", title: "t", body: "b" });
    expect(db.pushDevice.findMany).not.toHaveBeenCalled();
  });

  it("sends to the member's valid devices and deletes FIDs FCM says are gone", async () => {
    process.env.FCM_CREDENTIALS = JSON.stringify({ project_id: "p" });
    db.pushDevice.findMany.mockResolvedValue([{ fid: "t1" }, { fid: "t2" }]);
    messaging.sendEachForMulticast.mockResolvedValue({
      failureCount: 1,
      responses: [{ success: true }, { success: false, error: { code: "messaging/installation-id-not-registered" } }],
    });
    await sendFcmPush({ userId: "u1", title: "t", body: "b", url: "/dashboard/chats/c1", collapseId: "chat-c1" });
    expect(db.pushDevice.findMany).toHaveBeenCalledWith({
      where: { userId: "u1", mobileSession: { revokedAt: null, expiresAt: { gt: NOW } } },
      select: { fid: true },
    });
    expect(messaging.sendEachForMulticast).toHaveBeenCalledWith(
      buildFcmMessage(["t1", "t2"], { title: "t", body: "b", url: "/dashboard/chats/c1", collapseId: "chat-c1" }),
    );
    expect(db.pushDevice.deleteMany).toHaveBeenCalledWith({ where: { fid: { in: ["t2"] } } });
  });

  it("keeps devices on other errors (a bad payload is not a dead device)", async () => {
    process.env.FCM_CREDENTIALS = JSON.stringify({ project_id: "p" });
    db.pushDevice.findMany.mockResolvedValue([{ fid: "t1" }]);
    messaging.sendEachForMulticast.mockResolvedValue({ failureCount: 1, responses: [{ success: false, error: { code: "messaging/invalid-argument" } }] });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await sendFcmPush({ userId: "u1", title: "t", body: "b" });
    expect(db.pushDevice.deleteMany).not.toHaveBeenCalled();
  });

  it("never throws", async () => {
    process.env.FCM_CREDENTIALS = JSON.stringify({ project_id: "p" });
    db.pushDevice.findMany.mockRejectedValue(new Error("db down"));
    await expect(sendFcmPush({ userId: "u1", title: "t", body: "b" })).resolves.toBeUndefined();
  });
});

describe("buildFcmMessage", () => {
  it("carries the url as data and collapses per id on Android and iOS", () => {
    const m = buildFcmMessage(["t1"], { title: "t", body: "b", url: "/dashboard/matches", collapseId: "chat-1" });
    expect(m.fids).toEqual(["t1"]);
    expect(m.data).toEqual({ url: "/dashboard/matches" });
    expect(m.android).toMatchObject({ collapseKey: "chat-1", notification: { channelId: "naseebak_default", tag: "chat-1" } });
    expect(m.apns?.headers).toEqual({ "apns-collapse-id": "chat-1" });
  });
});
