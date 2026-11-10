import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  notification: { create: vi.fn(), findFirst: vi.fn() },
  notificationPreference: { findUnique: vi.fn() },
  user: { findUnique: vi.fn(), findMany: vi.fn() },
}));
const web = vi.hoisted(() => vi.fn());
const app = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/onesignal", () => ({ sendPushNotification: web }));
vi.mock("@/lib/fcm", () => ({ sendFcmPush: app }));
vi.mock("@/lib/sms-notice", () => ({ sendSmsNotice: vi.fn(), smsEventFor: () => null }));

import { AUTOMATIC_NOTIFICATIONS, automaticNotificationsFor } from "@/lib/notifications/automatic";
import { LB_DIALECT, toLebanese } from "@/lib/notifications/lebanese";
import { notify, notifyMany } from "@/lib/notify";

/** Masculine-only commands that must not reach a woman or a text written for everyone */
const MASCULINE_COMMANDS = ["اضغط", "ادخل", "تصفح", "شاهد", "راجع", "أكمل", "اشحن", "افتح", "اطّلع", "شوف", "فوت"];
const words = (text: string) => text.split(/[\s.,،:!؟«»"()]+/).map((w) => w.replace(/^[وف](?=..)/, ""));

/** Notices that go through notify() (it sends the push): the bell-only chat row is written by lib/chat/bell.ts */
const VIA_NOTIFY = AUTOMATIC_NOTIFICATIONS.filter((n) => n.channels.includes("push"));

/** Each {placeholder} filled with a value no pair can touch, so we can see it survive */
function filled(text: string): { text: string; values: string[] } {
  const values: string[] = [];
  const out = text.replace(/\{[^}]*\}/g, () => {
    const v = `V${values.length}x`;
    values.push(v);
    return v;
  });
  return { text: out, values };
}

describe("Lebanese notices", () => {
  const bodies = VIA_NOTIFY.flatMap((n) => n.texts.map((t) => ({ key: `${n.key} (${t.variant})`, variant: t.variant, body: t.body })));

  it("every automatic notice sent through notify() has a Lebanese form", () => {
    const same = bodies.filter((b) => toLebanese(filled(b.body).text) === filled(b.body).text).map((b) => b.key);
    expect(same).toEqual([]);
  });

  it("no masculine command in a text for women or for everyone", () => {
    const bad = bodies
      .filter((b) => !/^male\b/.test(b.variant))
      .flatMap((b) => words(toLebanese(filled(b.body).text)).filter((w) => MASCULINE_COMMANDS.includes(w)).map((w) => `${b.key}: ${w}`));
    expect(bad).toEqual([]);
  });

  it("keeps every placeholder value, URL and digit", () => {
    for (const b of bodies) {
      const { text, values } = filled(b.body);
      const lb = toLebanese(text);
      for (const v of values) expect(lb, b.key).toContain(v);
      for (const url of text.match(/(?:https?:\/\/|naseebak\.com)\S*/g) ?? []) expect(lb, b.key).toContain(url);
      expect(lb.replace(/\D/g, ""), b.key).toBe(text.replace(/\D/g, ""));
    }
  });

  it("is idempotent, and no Lebanese piece contains an MSA one", () => {
    for (const b of bodies) {
      const once = toLebanese(filled(b.body).text);
      expect(toLebanese(once), b.key).toBe(once);
    }
    for (const [, lb] of LB_DIALECT) for (const [msa] of LB_DIALECT) expect(lb.includes(msa), `${lb} ⊃ ${msa}`).toBe(false);
  });

  it("keeps the top-up line Admin Insights counts by text", () => {
    const zero = VIA_NOTIFY.flatMap((n) => n.texts).filter((t) => t.body.includes("صفر: اشح"));
    expect(zero.length).toBeGreaterThan(0);
    for (const t of zero) expect(toLebanese(t.body)).toContain("صفر: اشح");
  });

  it("leaves other text alone", () => {
    expect(toLebanese("")).toBe("");
    expect(toLebanese("نص كتبه المشرف")).toBe("نص كتبه المشرف");
  });

  it("the admin list shows Lebanese members the Lebanese form, other countries the same text", () => {
    const body = (country: string) => automaticNotificationsFor(country).find((n) => n.key === "match-guardian-share-last-call")!.texts[0].body;
    expect(body("LB")).toBe(toLebanese(body("JO")));
    expect(body("LB")).not.toBe(body("JO"));
    expect(body("SA")).toBe(AUTOMATIC_NOTIFICATIONS.find((n) => n.key === "match-guardian-share-last-call")!.texts[0].body);
  });
});

describe("notify() in Lebanese dialect", () => {
  const BODY = "الطرف الآخر ما زال ينتظر مشاركة بيانات وليّ أمرك. إذا لم تتم المشاركة خلال يومين سيُغلق هذا التوافق.";
  const TITLE = "آخر فرصة لهذا التوافق";

  beforeEach(() => {
    vi.clearAllMocks();
    db.notification.create.mockResolvedValue({});
    db.notification.findFirst.mockResolvedValue(null);
    db.notificationPreference.findUnique.mockResolvedValue(null);
  });

  it.each(["JO", "SA"])("a %s member gets the text unchanged", async (country) => {
    db.user.findUnique.mockResolvedValue({ country });
    await notify({ userId: "u1", type: "MATCH", title: TITLE, body: BODY });
    expect(db.notification.create.mock.calls[0][0].data).toMatchObject({ title: TITLE, body: BODY });
    expect(web.mock.calls[0][0]).toMatchObject({ title: TITLE, body: BODY });
    expect(app.mock.calls[0][0]).toMatchObject({ title: TITLE, body: BODY });
  });

  it("a Lebanese member gets the body in dialect, in the bell and both pushes; the title (a lookup key) stays", async () => {
    db.user.findUnique.mockResolvedValue({ country: "LB" });
    await notify({ userId: "u1", type: "MATCH", title: TITLE, body: BODY });
    const lb = toLebanese(BODY);
    expect(lb).not.toBe(BODY);
    expect(db.notification.create.mock.calls[0][0].data).toMatchObject({ title: TITLE, body: lb });
    expect(web.mock.calls[0][0]).toMatchObject({ title: TITLE, body: lb });
    expect(app.mock.calls[0][0]).toMatchObject({ title: TITLE, body: lb });
  });

  it("an admin's own words are never rewritten, and the member isn't looked up", async () => {
    db.user.findUnique.mockResolvedValue({ country: "LB" });
    await notify({ userId: "u1", type: "SYSTEM", title: TITLE, body: BODY, verbatim: true });
    expect(db.notification.create.mock.calls[0][0].data.body).toBe(BODY);
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it("a failed country lookup sends the text unchanged", async () => {
    db.user.findUnique.mockRejectedValue(new Error("down"));
    await notify({ userId: "u1", type: "MATCH", title: TITLE, body: BODY });
    expect(db.notification.create.mock.calls[0][0].data.body).toBe(BODY);
  });

  it("notifyMany reads every recipient's country in one query and words each notice for its reader", async () => {
    db.user.findMany.mockResolvedValue([{ id: "a", country: "LB" }, { id: "b", country: "JO" }]);
    await notifyMany(["a", "b"], { type: "MATCH", title: TITLE, body: BODY });
    expect(db.user.findMany).toHaveBeenCalledTimes(1);
    expect(db.user.findUnique).not.toHaveBeenCalled();
    const byUser = Object.fromEntries(db.notification.create.mock.calls.map((c) => [c[0].data.userId, c[0].data.body]));
    expect(byUser).toEqual({ a: toLebanese(BODY), b: BODY });
  });
});
