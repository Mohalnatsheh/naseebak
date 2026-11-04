import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  alert: { findFirst: vi.fn(), findUnique: vi.fn() },
  alertDismissal: { createMany: vi.fn() },
  alertView: { createMany: vi.fn(async () => ({ count: 1 })) },
}));
vi.mock("@/lib/db", () => ({ db }));

import { alertInputSchema, currentAlertFor, dismissAlert, isAlertLink, memberAlertsWhere, webDeviceFromUserAgent } from "@/lib/alerts";

beforeEach(() => vi.clearAllMocks());

describe("which alerts a member sees", () => {
  const now = new Date("2026-10-31T12:00:00Z");
  const woman = { id: "u1", gender: "FEMALE" as const, country: "JO" };

  it("live, not stopped, her country or every country, everyone/women/her, her platform, not closed by her", () => {
    expect(memberAlertsWhere(woman, "app", now)).toEqual({
      stoppedAt: null,
      startsAt: { lte: now },
      AND: [
        { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        { OR: [{ country: null }, { country: "JO" }] },
        { OR: [{ audience: "ALL" }, { audience: "WOMEN" }, { audience: "USER", userId: "u1" }] },
      ],
      channel: { in: ["ALL", "APP"] },
      dismissals: { none: { userId: "u1" } },
    });
  });

  it("a man on the website gets MEN and WEB", () => {
    const where = memberAlertsWhere({ id: "u2", gender: "MALE", country: "SA" }, "web", now);
    expect(where.channel).toEqual({ in: ["ALL", "WEB"] });
    expect(JSON.stringify(where.AND)).toContain('"MEN"');
  });

  it("the website on a device also gets that device's channel; the app never does", () => {
    const man = { id: "u2", gender: "MALE" as const, country: "JO" };
    expect(memberAlertsWhere(man, "web", now, "android").channel).toEqual({ in: ["ALL", "WEB", "WEB_ANDROID"] });
    expect(memberAlertsWhere(man, "web", now, "iphone").channel).toEqual({ in: ["ALL", "WEB", "WEB_IPHONE"] });
    expect(memberAlertsWhere(man, "web", now, "desktop").channel).toEqual({ in: ["ALL", "WEB", "WEB_DESKTOP"] });
    expect(memberAlertsWhere(man, "app", now, "android").channel).toEqual({ in: ["ALL", "APP"] });
  });

  it("device from the user agent", () => {
    expect(webDeviceFromUserAgent("Mozilla/5.0 (Linux; Android 14; wv) Instagram 350.0")).toBe("android");
    expect(webDeviceFromUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe("iphone");
    expect(webDeviceFromUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/130.0")).toBe("desktop");
    expect(webDeviceFromUserAgent(null)).toBe("desktop");
  });

  it("the oldest waiting alert, only the fields the popup needs", async () => {
    db.user.findUnique.mockResolvedValue(woman);
    db.alert.findFirst.mockResolvedValue({ id: "a1", title: "t" });
    expect(await currentAlertFor("u1", "app", now)).toEqual({ id: "a1", title: "t" });
    const args = db.alert.findFirst.mock.calls[0][0];
    expect(args.orderBy).toEqual({ createdAt: "asc" });
    expect(Object.keys(args.select)).toEqual(["id", "title", "body", "imageUrl", "buttonLabel", "buttonUrl"]);
  });

  it("no member, no alert", async () => {
    db.user.findUnique.mockResolvedValue(null);
    expect(await currentAlertFor("gone", "web")).toBeNull();
    expect(db.alert.findFirst).not.toHaveBeenCalled();
  });
});

describe("closing", () => {
  it("records it once (a second close changes nothing)", async () => {
    db.alert.findUnique.mockResolvedValue({ id: "a1" });
    expect(await dismissAlert("u1", "a1")).toBe(true);
    expect(db.alertDismissal.createMany).toHaveBeenCalledWith({ data: [{ alertId: "a1", userId: "u1", action: null }], skipDuplicates: true });
  });

  it("an unknown alert is refused", async () => {
    db.alert.findUnique.mockResolvedValue(null);
    expect(await dismissAlert("u1", "nope")).toBe(false);
    expect(db.alertDismissal.createMany).not.toHaveBeenCalled();
  });
});

describe("what the admin may enter", () => {
  const base = { title: "عرض", body: "نص" };

  it("links: a site path or https only", () => {
    expect(isAlertLink("/dashboard/profile/edit")).toBe(true);
    expect(isAlertLink("https://naseebak.com/blog")).toBe(true);
    expect(isAlertLink("//evil.com")).toBe(false);
    expect(isAlertLink("javascript:alert(1)")).toBe(false);
    expect(isAlertLink("http://naseebak.com")).toBe(false);
  });

  it("defaults: everyone, app and website", () => {
    const r = alertInputSchema.parse(base);
    expect(r.audience).toBe("ALL");
    expect(r.channel).toBe("ALL");
  });

  it("a button needs both its text and its link", () => {
    expect(alertInputSchema.safeParse({ ...base, buttonLabel: "افتح" }).success).toBe(false);
    expect(alertInputSchema.safeParse({ ...base, buttonLabel: "افتح", buttonUrl: "/dashboard" }).success).toBe(true);
    expect(alertInputSchema.safeParse({ ...base, buttonLabel: "", buttonUrl: "" }).success).toBe(true);
  });

  it("one member needs the member; the end must follow the start", () => {
    expect(alertInputSchema.safeParse({ ...base, audience: "USER" }).success).toBe(false);
    expect(
      alertInputSchema.safeParse({ ...base, startsAt: "2026-11-02T10:00:00Z", endsAt: "2026-11-01T10:00:00Z" }).success,
    ).toBe(false);
  });
});

describe("popup counts (seen / tapped / closed)", () => {
  it("handing a popup out counts it as seen once, on that platform; nothing to show counts nothing", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u1", gender: "FEMALE", country: "JO" });
    db.alert.findFirst.mockResolvedValueOnce({ id: "a1", title: "t" });
    await currentAlertFor("u1", "app");
    expect(db.alertView.createMany).toHaveBeenCalledWith({ data: [{ alertId: "a1", userId: "u1", platform: "app" }], skipDuplicates: true });
    db.alertView.createMany.mockClear();
    db.alert.findFirst.mockResolvedValueOnce(null);
    await currentAlertFor("u1", "web");
    expect(db.alertView.createMany).not.toHaveBeenCalled();
  });

  it("a failing view count never hides the popup", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u1", gender: "FEMALE", country: "JO" });
    db.alert.findFirst.mockResolvedValueOnce({ id: "a1", title: "t" });
    db.alertView.createMany.mockRejectedValueOnce(new Error("db"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await currentAlertFor("u1", "web")).toEqual({ id: "a1", title: "t" });
    spy.mockRestore();
  });

  it("the website says tapped or closed", async () => {
    db.alert.findUnique.mockResolvedValue({ id: "a1" });
    await dismissAlert("u1", "a1", "TAPPED");
    expect(db.alertDismissal.createMany).toHaveBeenLastCalledWith({ data: [{ alertId: "a1", userId: "u1", action: "TAPPED" }], skipDuplicates: true });
  });
});
