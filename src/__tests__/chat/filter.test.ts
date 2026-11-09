import { describe, it, expect } from "vitest";
import { checkMessage, completesSplitNumber, numberShape, ownRecentPieces } from "@/lib/chat/filter";

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

  it("skips the sender's own filler messages between pieces (QA WC-02)", () => {
    expect(completesSplitNumber("واحد اثنان", ["أهلاً", "صفر سبعة تسعة صفر صفر"])).toBe(true);
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

describe("checkMessage — Saudi numbers (multi-country)", () => {
  it.each([
    "0512345678",
    "جوالي 05 1234 5678",
    "٠٥١٢٣٤٥٦٧٨",
    "+966512345678",
    "+966-51-234-5678",
    "00966512345678",
    "966 51 234 5678",
    "(051) 234.5678",
    "051/234/5678",
    "O5I2345678",
    "صفر خمسه واحد اثنين ثلاثه اربعه خمسه",
    "زيرو خمسه خمسه ثنتين ثلاث اربع",
    "05 ثم 12 ثم 34 ثم 56 ثم 78",
    "كلمني سناب",
  ])("blocks %s", (body) => {
    expect(blocked(body)).toBe("CONTACT");
  });

  it("reads a Saudi number sent in pieces", () => {
    expect(completesSplitNumber("5678", ["051 234"])).toBe(true);
    expect(completesSplitNumber("234 5678", ["+966 51"])).toBe(true);
  });

  it("Jordanian numbers are still blocked next to Saudi ones", () => {
    expect(blocked("0791234567")).toBe("CONTACT");
    expect(blocked("+962791234567")).toBe("CONTACT");
  });

  it.each(["أسكن في الرياض منذ 2015", "راتبي 9000 ريال", "عمري 31 وطولي 170", "عندي 5 إخوة"])(
    "allows ordinary Saudi messages: %s",
    (body) => {
      expect(checkMessage(body)).toEqual({ ok: true, text: body });
    },
  );
});

describe("QA 2026-11-10 (chat WC-01): tatweel, marks and letters of any script between digits", () => {
  const blocked = (t: string) => expect(checkMessage(t).ok, t).toBe(false);
  const allowed = (t: string) => expect(checkMessage(t).ok, t).toBe(true);

  it("blocks numbers stretched with tatweel or harakat", () => {
    blocked("079ـ123ـ4567");
    blocked("٠٧٩ـ١٢٣ـ٤٥٦٧");
    blocked("0ـ7ـ9ـ1ـ2ـ3ـ4ـ5ـ6ـ7");
    blocked("0َ7ُ9ِ1ّ2ْ3ً4ٌ5ٍ6َ7");
  });

  it("blocks numbers with invisible characters between the digits", () => {
    blocked("079\u200b123\u200b4567");
    blocked("0\u200d7\u200d9\u200d1\u200d2\u200d3\u200d4\u200d5\u200d6\u200d7");
    blocked("079\u200f123\u200e4567");
  });

  it("blocks numbers with Arabic (or any) letters between the digits", () => {
    blocked("0ب7ب9ب1ب2ب3ب4ب5ب6ب7");
    blocked("079ثم123ثم4567");
    blocked("05ж12ж34ж56ж78");
  });

  it("ordinary messages with tatweel and harakat still pass", () => {
    allowed("أهـــلاً وسهـــلاً");
    allowed("عُمري 29 وطولي 175");
    allowed("مواليد 1995 و 2017 تخرجت");
    allowed("2و3 أطفال إن شاء الله");
  });
});

describe("QA 2026-11-10 (chat WC-02, WC-03, WC-16): split numbers", () => {
  it("the same sender's filler messages don't reset the run", () => {
    expect(completesSplitNumber("234567", ["تمام", "0791"])).toBe(true);
    expect(completesSplitNumber("4567", ["و", "079123"])).toBe(true);
    expect(completesSplitNumber("4567", ["طيب", "123", "اه", "079"])).toBe(true);
  });

  it("a message on its own is never a split number (needs an earlier piece)", () => {
    expect(completesSplitNumber("مواليد 1995 وتخرجت 2017 والمهر 5000", [])).toBe(false);
    expect(completesSplitNumber("0791234", [])).toBe(false);
  });

  it("years and round amounts with words around them aren't pieces", () => {
    expect(completesSplitNumber("والمهر 5000", ["تخرجت 2017", "مواليد 1995"])).toBe(false);
    expect(completesSplitNumber("راتبي 1500", ["عمري 29"])).toBe(false);
    expect(checkMessage("مواليد 1995 وتخرجت 2017 والمهر 5000").ok).toBe(true);
  });

  it("ownRecentPieces: my run since the partner wrote; number-only pieces over a longer window", () => {
    const now = Date.parse("2026-11-10T12:00:00Z");
    const ago = (min: number) => new Date(now - min * 60_000);
    const recent = [
      { senderId: "me", body: "تمام", createdAt: ago(1) },
      { senderId: "me", body: "079", createdAt: ago(25) },
      { senderId: "me", body: "رقمي 0791", createdAt: ago(30) },
      { senderId: "me", body: "123", createdAt: ago(70) },
      { senderId: "her", body: "123", createdAt: ago(80) },
    ];
    expect(ownRecentPieces(recent, "me", now)).toEqual(["تمام", "079"]);
    // The partner's message ends the run (two people alternating is accepted)
    expect(ownRecentPieces([{ senderId: "her", body: "1", createdAt: ago(1) }, ...recent], "me", now)).toEqual([]);
    // Pieces 25 minutes apart still add up
    expect(completesSplitNumber("1234567", ownRecentPieces(recent, "me", now))).toBe(true);
  });
});

describe("QA 2026-11-10 (chat WC-04, WC-15): handles, spaced domains, more apps, spelled tens", () => {
  const reason = (t: string) => {
    const r = checkMessage(t);
    return r.ok ? null : r.reason;
  };
  const allowed = (t: string) => expect(checkMessage(t).ok, t).toBe(true);

  it.each(["يوزري ahmad_99_jo", "ابحثي عني باسم ahmad.khaled99", "my handle is ahmad_k99", "يوزري ahmad", "handle: ahmad", "دور علي ahmadk"])(
    "blocks a handle without @: %s",
    (t) => expect(reason(t)).toBe("CONTACT"),
  );

  it.each(["example . com", "example dot com", "example(dot)com", "example نقطة com", "mysite .net"])("blocks a spaced domain: %s", (t) =>
    expect(reason(t)).toBe("LINK"),
  );

  it.each(["ahmad at protonmail", "ahmad (at) proton", "ahmad [at] mailbox"])("blocks a spelled-out email: %s", (t) =>
    expect(reason(t)).toBe("CONTACT"),
  );

  it.each(["skype: ahmad", "line: ahmad99", "WeChat ahmad", "lnstagram ahmad", "1nstagram", "ضيفني سكايب", "عندي لاين", "insta?", "تواصل معي بوتيم", "kik: ahmad99", "add me on kik", "كيك: ahmad"])(
    "blocks other apps and look-alike spellings: %s",
    (t) => expect(reason(t)).toBe("CONTACT"),
  );

  it.each([
    "رقمي سبعمية وتسعة وسبعين، مية وثلاثة وعشرين، اربعمية وستة وخمسين",
    "صفر سبعة تسعة وتسعين مية وثلاثة وعشرين خمسة واربعين",
    "zero seven ninety nine one hundred twenty three forty five",
  ])("blocks a number spelled with tens and hundreds: %s", (t) => expect(reason(t)).toBe("CONTACT"));

  it("ordinary messages still pass (whole-word short names, years, amounts, ages in words)", () => {
    for (const t of [
      "instant coffee please",
      "snapshot of the day",
      "I love the online courses",
      "اشتغل اونلاين من البيت",
      "we stood in line for hours",
      "I can handle it",
      "ok. me too",
      "Thanks. Come early",
      "مواليد 1995 وتخرجت 2017 والمهر 5000",
      "عمري تسعة وعشرين وطولي مية وخمسة وسبعين",
      "خمسة وتسعين بالمية من الناس بحبوا السفر",
      "عشر سنين وانا بشتغل بالتدريس",
      "اخواني اثنين واخواتي ثلاثة",
      "I look at things differently",
      "version v1.2 of the app",
      "iPhone 15 Pro",
      "big family",
      "LG phone",
    ]) allowed(t);
  });
});

describe("W2 review round 1: false positives closed, Highs still closed", () => {
  const reason = (t: string) => {
    const r = checkMessage(t);
    return r.ok ? null : r.reason;
  };
  const allowed = (t: string) => expect(checkMessage(t).ok, t).toBe(true);

  it.each(["I like it. App is great", "Got it. Info later", "sure. io", "ok. com on", "Thanks. Org chart is ready"])(
    "an English full stop is not a link: %s",
    (t) => allowed(t),
  );

  it.each(["example . com", "mysite .net", "example dot com", "example(dot)com", "example نقطة com", "example [.] org"])(
    "a spaced or spelled domain is still a link: %s",
    (t) => expect(reason(t)).toBe("LINK"),
  );

  it.each([
    "covid_19 خلص الحمدلله",
    "web3.0 is the future",
    "1990و1995",
    "تخرجت 2017و2019",
    "عمري خمسة وعشرين وطولي مية وسبعين ووزني سبعين وراتبي خمسمية",
    "عندي ثلاث اولاد واعمارهم خمسة وسبعة وعشرة",
    "بحب الكيك بالشوكولاتة",
    "kik is a word in this sentence",
  ])("ordinary messages pass: %s", (t) => allowed(t));

  it("two bare years from the same sender within an hour aren't a split number", () => {
    expect(completesSplitNumber("2020", ["كيف", "1995"])).toBe(false);
    expect(completesSplitNumber("2020", ["1995"])).toBe(false);
  });

  it("handles that look like usernames are still blocked", () => {
    for (const t of ["يوزري ahmad_99_jo", "ahmad.khaled99", "ahmad_k99", "ahmad_999"]) expect(reason(t), t).toBe("CONTACT");
  });

  it("both Highs stay closed", () => {
    for (const t of ["079ـ123ـ4567", "٠٧٩ـ١٢٣ـ٤٥٦٧", "0ب7ب9ب1ب2ب3ب4ب5ب6ب7", "0791و2345و67", "05ب12ب34ب56ب78"]) expect(reason(t), t).toBe("CONTACT");
    expect(completesSplitNumber("234567", ["تمام", "0791"])).toBe(true);
    expect(completesSplitNumber("4567", ["و", "079123"])).toBe(true);
  });

  it("a number read the long way in one go is still blocked", () => {
    expect(reason("رقمي سبعمية وتسعة وسبعين، مية وثلاثة وعشرين، اربعمية وستة وخمسين")).toBe("CONTACT");
  });
});

describe("W2 review round 2: composite numbers across short connectors", () => {
  it.each([
    "رقمي سبعمية وتسعة وسبعين ثم مية وثلاثة وعشرين ثم اربعمية وستة وخمسين",
    "رقمي سبعمية وتسعة وسبعين و مية وثلاثة وعشرين و اربعمية وستة وخمسين",
    "079 ثم مية وثلاثة وعشرين ثم 4567",
    "صفر سبعة تسعة ثم مية وثلاثة وعشرين ثم اربعمية وستة وخمسين وسبعة",
    "seven hundred ninety then one hundred twenty three then four hundred fifty six",
    "صفر سبعة تسعة بعدين مية وثلاثة وعشرين بعدين خمسة واربعين",
  ])("blocks %s", (t) => expect(checkMessage(t).ok, t).toBe(false));

  it.each([
    "عمري خمسة وعشرين وطولي مية وسبعين ووزني سبعين وراتبي خمسمية",
    "عمري خمسة وعشرين سنة وطولي مية وسبعين سم ووزني سبعين كيلو",
    "مواليد 1995 وتخرجت 2017 والمهر 5000",
    "خمسة وتسعين بالمية من الناس بحبوا السفر",
    "عندي ثلاث اولاد واعمارهم خمسة وسبعة وعشرة",
    "1995 و 2017 و 5000",
  ])("still passes %s", (t) => expect(checkMessage(t).ok, t).toBe(true));
});
