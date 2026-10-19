import { describe, it, expect } from "vitest";
import { checkMessage, completesSplitNumber, numberShape } from "@/lib/chat/filter";

const blocked = (body: string) => {
  const r = checkMessage(body);
  return r.ok ? null : r.reason;
};

describe("checkMessage", () => {
  it.each([
    "0791234567",
    "رقمي 07 9123 4567",
    "٠٧٩١٢٣٤٥٦٧",
    "+962-79-123-4567",
    "(079) 123.4567",
    "صفر سبعة تسعة واحد اثنين ثلاثة اربعة",
    "my insta @yazan_99",
    "زورني على instagram",
    "كلمني واتس",
    "تيليجرام",
  ])("blocks contact details: %s", (body) => {
    expect(blocked(body)).toBe("CONTACT");
  });

  it.each(["wa.me/96279", "www.site.com", "https://example.com/x", "t.me/user", "mysite.jo", "mypage.xyz", "shop.sa", "profile.ae"])(
    "blocks links: %s",
    (body) => {
      expect(blocked(body)).toBe("LINK");
    }
  );

  it.each([
    "عمري 29 وأسكن في عمّان منذ 2015",
    "عندي 3 إخوة",
    "السلام عليكم، كيف حالك؟",
    "تخرجت سنة 2018 وأعمل منذ 5 سنوات",
    "أحب القراءة والسفر",
  ])("allows normal messages: %s", (body) => {
    expect(checkMessage(body)).toEqual({ ok: true, text: body });
  });

  it("trims and rejects empty messages", () => {
    expect(blocked("   ")).toBe("EMPTY");
    expect(checkMessage("  مرحبا  ")).toEqual({ ok: true, text: "مرحبا" });
  });

  it("rejects messages over 1000 characters", () => {
    expect(blocked("أ".repeat(1001))).toBe("TOO_LONG");
    expect(checkMessage("أ".repeat(1000)).ok).toBe(true);
  });

  it("gives an Arabic explanation", () => {
    const r = checkMessage("0791234567");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("التعارف العائلي");
  });
});

describe("phone numbers split across messages", () => {
  it("reads number-only messages together", () => {
    expect(completesSplitNumber("واحد اثنان", ["صفر سبعة تسعة صفر صفر"])).toBe(true);
    expect(completesSplitNumber("4567", ["079 123"])).toBe(true);
    expect(completesSplitNumber("٤٥", ["٠٧٩", "١٢٣"])).toBe(true);
  });

  it("ignores ordinary sentences with a few numbers", () => {
    expect(completesSplitNumber("ولدت سنة 1997", ["عمري 29 وعندي 3 إخوة"])).toBe(false);
    expect(completesSplitNumber("2 أو 3 أطفال", [])).toBe(false);
    expect(completesSplitNumber("صفر سبعة", ["كيف حالك؟"])).toBe(false);
  });

  it("stops at the first message that is not a number", () => {
    expect(completesSplitNumber("واحد اثنان", ["أهلاً", "صفر سبعة تسعة صفر صفر"])).toBe(false);
  });

  it("numberShape counts digits and spelled digits", () => {
    expect(numberShape("صفر سبعة تسعة")).toMatchObject({ digits: 3, numberish: true });
    expect(numberShape("رقمي 079")).toMatchObject({ digits: 3, numberish: false, longestGroup: 3 });
    expect(numberShape("079")).toMatchObject({ digits: 3, numberish: true });
    expect(numberShape("أنا من عمان")).toMatchObject({ digits: 0, numberish: false });
  });
});

describe("filter gaps closed (Oct 2026 audit)", () => {
  const blocked = (t: string) => expect(checkMessage(t).ok, t).toBe(false);
  const allowed = (t: string) => expect(checkMessage(t).ok, t).toBe(true);

  it("numbers with any symbols between the digits", () => {
    for (const t of ["079/555/1234", "079_555_1234", "0*7*9*5*5*5*1*2*3*4", "0|79|555|1234", "رقمي 079 / 555 / 1234"]) blocked(t);
  });

  it("fullwidth, keycap emoji, circled and mathematical digits", () => {
    blocked("０７９５５５１２３４");
    blocked("0️⃣7️⃣9️⃣5️⃣5️⃣5️⃣1️⃣2️⃣3️⃣4️⃣");
    blocked("⓪⑦⑨⑤⑤⑤①②③④");
    blocked("𝟎𝟕𝟗𝟓𝟓𝟓𝟏𝟐𝟑𝟒");
  });

  it("digits spelled in dialect or English, or mixed with written digits", () => {
    blocked("صفر سبعه تسعه خمسه خمسه تنين تلاته");
    blocked("zero seven nine five five five one two three four");
    blocked("079 خمسه خمسه خمسه 1234");
    blocked("صفر 7 تسعة 5 5 5 1");
  });

  it("social apps written the way people type them", () => {
    for (const t of ["ضيفني انستجرام", "ابعتلي وتساب", "عندي اينستا", "كلمني تيليغرام", "ماسنجر احسن", "ضيفني ig", "عندي ايمو", "فايبر"]) blocked(t);
  });

  it("normal messages still go through", () => {
    for (const t of [
      "عمري 28 وطولي 175",
      "تخرجت سنة 2019 من الجامعة الاردنية",
      "موعدنا 12/10/2026 ان شاء الله",
      "عندي 3 اخوان و 2 خوات",
      "وتسلم ايدك على الكلام الحلو",
      "big family يعني عيلة كبيرة",
      "من 9 الى 5 بالدوام",
    ]) allowed(t);
  });
});

describe("split numbers wrapped in text", () => {
  it("pieces with words around them add up (9+ digits)", () => {
    expect(completesSplitNumber("والباقي 551234", ["رقمي هو 0795"])).toBe(true);
  });

  it("an age and a height in separate messages don't", () => {
    expect(completesSplitNumber("وطولي 175", ["عمري 28"])).toBe(false);
    expect(completesSplitNumber("مواليد 1995", ["طولي 175"])).toBe(false);
  });
});

describe("G59: numbers hidden among words, look-alike letters, more app names", () => {
  const blocked = (t: string) => expect(checkMessage(t).ok, t).toBe(false);
  const allowed = (t: string) => expect(checkMessage(t).ok, t).toBe(true);

  it("spelled digits with filler words between them (6+ digit words anywhere)", () => {
    blocked("صفر سبعة تسعة واحد اثنين ثلاثة");
    blocked("صفر ثم سبعة ثم تسعة ثم خمسة ثم خمسة ثم خمسة");
    blocked("اول اشي صفر وبعدين سبعه وبعدها تسعه، وبعدين واحد واحد واحد");
  });

  it("digit groups separated by words (9+ digits in total)", () => {
    blocked("07 ثم 95 ثم 55 ثم 12 ثم 34");
    blocked("رقمي 079 والباقي 555 وبعدها 1234");
    blocked("صفر 79 بعدين 555 واخر اشي 12 34");
  });

  it("look-alike letters inside a number", () => {
    blocked("O79 555 I234");
    blocked("o79-555-l234");
    blocked("079x555x1234");
    blocked("079a555b1234");
  });

  it("more ways to write WhatsApp", () => {
    for (const t of ["ضيفني وتس", "كلمني واتس اب", "عندي وات ساب", "whats app me", "what's app?"]) blocked(t);
  });

  it("ordinary messages with numbers still pass", () => {
    for (const t of [
      "عمري 28 وطولي 175",
      "عندي 3 أطفال",
      "عندي 3 أطفال، أعمارهم 5 و 8 و 12 سنة",
      "مواليد 1995 وتخرجت 2017 واشتغلت 2019",
      "المهر 5000 دينار والمؤخر 10000",
      "راتبي 750 والدوام من 8 لـ 4",
      "واحد من اخواني متزوج وعنده ثلاث بنات",
      "خمسة وتسعين بالمية من الناس بحبوا السفر",
      "وتسلم ايدك",
      "big family يعني عيلة كبيرة",
      "رح نحكي الساعة 10:30 مساءً",
      "iPhone 15 Pro",
    ]) allowed(t);
  });
});
