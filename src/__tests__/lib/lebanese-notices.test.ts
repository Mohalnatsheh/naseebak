import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  notification: { create: vi.fn(), findFirst: vi.fn() },
  notificationPreference: { findUnique: vi.fn() },
  user: { findUnique: vi.fn(), findMany: vi.fn() },
  countrySetting: { findMany: vi.fn() },
}));
const web = vi.hoisted(() => vi.fn());
const app = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/onesignal", () => ({ sendPushNotification: web }));
vi.mock("@/lib/fcm", () => ({ sendFcmPush: app }));
vi.mock("@/lib/sms-notice", () => ({ sendSmsNotice: vi.fn(), smsEventFor: () => null }));

import { AUTOMATIC_NOTIFICATIONS, automaticNotificationsFor } from "@/lib/notifications/automatic";
import { LB_DIALECT, toLebanese } from "@/lib/notifications/lebanese";
import { arabicCount } from "@/lib/utils";
import { notify, notifyMany } from "@/lib/notify";
import { clearCountrySettingsCache } from "@/lib/countries/settings";

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

  it("keeps a real interpolated value word for word, even one made of MSA words («رصيدان», «20 رصيداً», «لديك»)", () => {
    const CREDITS = { one: "رصيد واحد", two: "رصيدان", few: "أرصدة", many: "رصيداً" };
    const values = [arabicCount(2, CREDITS), arabicCount(20, CREDITS), arabicCount(5, CREDITS), "لديك سؤال"];
    expect(values.slice(0, 2)).toEqual(["رصيدان", "20 رصيداً"]);
    for (const value of values) {
      for (const b of bodies.filter((x) => /\{[^}]*\}/.test(x.body))) {
        const text = b.body.replace(/\{[^}]*\}/g, value);
        const expected = (text.match(new RegExp(value, "g")) ?? []).length;
        expect((toLebanese(text).match(new RegExp(value, "g")) ?? []).length, `${b.key} with «${value}»`).toBe(expected);
      }
    }
    // The call sites themselves (pro/grants.ts, pro/notices.ts, a support ticket's title)
    expect(toLebanese(`أُضيف ${arabicCount(20, CREDITS)} إلى رصيدك من اشتراك Pro.`)).toBe("انضاف 20 رصيداً لرصيدك من اشتراك Pro.");
    expect(toLebanese(`أُضيف ${arabicCount(2, CREDITS)} إلى رصيدك من هذه الدفعة، ويُزال عند استردادها.`)).toBe(
      "انضاف رصيدان لرصيدك من هالدفعة، وبينشال لما تنردّ.",
    );
    expect(toLebanese('تم تحديث حالة تذكرتك "لديك رصيدان" إلى: مغلقة')).toBe('صارت حالة تذكرتك "لديك رصيدان": مغلقة');
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
    // Lebanon active: readers' countries are looked up
    clearCountrySettingsCache();
    db.countrySetting.findMany.mockResolvedValue([{ code: "LB", active: true }]);
  });

  it("while Lebanon is off, nobody's country is read: Jordanian and Saudi notices cost no extra query", async () => {
    clearCountrySettingsCache();
    db.countrySetting.findMany.mockResolvedValue([]);
    db.user.findUnique.mockResolvedValue({ country: "LB" });
    await notify({ userId: "u1", type: "MATCH", title: TITLE, body: BODY });
    await notifyMany(["a", "b"], { type: "MATCH", title: TITLE, body: BODY });
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(db.user.findMany).not.toHaveBeenCalled();
    expect(db.notification.create.mock.calls.map((c) => c[0].data.body)).toEqual([BODY, BODY, BODY]);
  });

  it("a caller that knows the reader's country saves the lookup", async () => {
    await notify({ userId: "u1", type: "MATCH", title: TITLE, body: BODY, country: "LB" });
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(db.notification.create.mock.calls[0][0].data.body).toBe(toLebanese(BODY));
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
