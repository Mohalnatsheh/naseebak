/**
 * Server-side check for every chat message before it is saved.
 * Contact details (phone numbers, social handles, emails) and links are blocked:
 * families exchange contact details only through an accepted family introduction.
 */
export const MAX_MESSAGE_LENGTH = 1000;

export type FilterReason = "EMPTY" | "TOO_LONG" | "CONTACT" | "LINK" | "OFFENSIVE";

export type FilterResult =
  | { ok: true; text: string }
  | { ok: false; reason: FilterReason; message: string };

const MESSAGES: Record<FilterReason, string> = {
  EMPTY: "اكتب رسالة أولاً",
  TOO_LONG: "الرسالة طويلة جداً (الحد 1000 حرف).",
  CONTACT:
    "لا يمكن مشاركة الأرقام أو الروابط أو حسابات التواصل. مشاركة التواصل تتم عبر التعارف العائلي.",
  LINK:
    "لا يمكن مشاركة الأرقام أو الروابط أو حسابات التواصل. مشاركة التواصل تتم عبر التعارف العائلي.",
  OFFENSIVE: "الرجاء الالتزام بأسلوب محترم.",
};

// Common generic TLDs + the region's country codes (Gulf, Levant, Egypt, Turkey) and the usual
// short-link/cheap ones (.xyz, .site, .gg …)
const LINK_RE =
  /(https?:\/\/|www\.|wa\.me|t\.me|\b[a-z0-9-]+\.(com|net|org|me|jo|io|co|info|app|link|ly|xyz|site|online|store|shop|live|page|dev|biz|top|club|pro|tv|cc|gg|ws|to|sa|ae|qa|kw|bh|om|eg|ps|iq|lb|sy|tr|uk|us|ca|de|fr)\b)/i;

/**
 * A domain with the dot spaced out or spelled: a space before the dot ("example . com", "mysite .net"),
 * a bracketed or spelled dot ("example(dot)com", "example dot com", «example نقطة com»). Never just a space
 * after the dot: that is an English full stop ("I like it. App is great", "ok. com on"). Read on the
 * lower-cased, normalised text (ة → ه).
 */
const SPACED_LINK_RE =
  /\b[a-z0-9-]{2,}(?:\s+\.\s*|\s*[([]\s*(?:dot|\.)\s*[)\]]\s*|\s+(?:dot|دوت|نقطه)\s+)(?:com|net|org|io|app|xyz|info|jo|sa)(?![a-z])/;

const EMAIL_RE = /\S+@\S+\.\S+/;
const HANDLE_RE = /(^|[\s(،,])@[a-z0-9_.]{2,}/i;
/** An address with the @ spelled out: "ahmad (at) gmail", "ahmad at protonmail" */
const EMAIL_AT_RE =
  /[a-z0-9._-]{2,}\s*(?:[([]\s*at\s*[)\]]\s*[a-z]{2,}|\s+at\s+(?:gmail|hotmail|yahoo|outlook|icloud|protonmail|proton|aol|yandex|zoho)\b)/;
/** A Latin username right after «يوزري» / «ابحثي عني (باسم)» / «دوّر علي» / «حسابي على»: any Latin word */
const HANDLE_AFTER_AR =
  /(?:يوزر\S*|ابحث\S*\s+عني|دور\S*\s+علي|حسابي\s+(?:على|ع|في))(?:\s+باسم)?\s*[:：=]?\s*@?[a-z][a-z0-9_.]{2,}/;
/** "username" / "handle": a word that looks like a username (has a digit, _ or .) or comes after a colon */
const HANDLE_AFTER_EN =
  /\b(?:username|user\s*name|handle)\b\s*(?:is\b|هو)?\s*(?:[:：=]\s*@?[a-z][a-z0-9_.]{2,}|@?[a-z][a-z0-9_.]*[0-9_.][a-z0-9_.]*)/;

/**
 * A Latin word shaped like a username on its own: letters, then `_` or `.` pieces, with a digit somewhere
 * ("ahmad_99_jo", "ahmad.khaled99", "ahmad_k99"). Ordinary words, versions ("v1.2") and years don't look like it.
 */
function hasUsernameShape(lower: string): boolean {
  return lower
    .split(/[\s،,!?؟:;"'()[\]]+/)
    .map((t) => t.replace(/[.]+$/, ""))
    .some(
      (t) =>
        t.length >= 5 &&
        /^[a-z][a-z0-9]*(?:[._][a-z0-9]+)+$/.test(t) &&
        /\d/.test(t) &&
        // A letter after the first `_` / `.` ("ahmad_k99", "ahmad.khaled99") or 3+ digits ("ahmad_999"):
        // "covid_19", "web3.0" and "ali.99" are ordinary words
        (/[._].*[a-z]/.test(t) || (t.match(/\d/g) ?? []).length >= 3),
    );
}

// Arabic spellings: matched anywhere in the message (after normalising), so keep them long enough not to hit normal words
const SOCIAL_KEYWORDS_AR = [
  "واتس", "واتس اب", "وات ساب", "وات س اب", "وتس اب", "وتساب", "وتسب",
  "انستا", "انستغرام", "انستقرام", "انستجرام", "انستكرام", "اينستا", "انستغرم",
  "تلغرام", "تيليجرام", "تلجرام", "تيلجرام", "تيليغرام", "تليغرام", "تلقرام", "تيليقرام",
  "فيسبوك", "فيس بوك", "ماسنجر", "مسنجر",
  "تيك توك", "تيكتوك",
  "فايبر", "تويتر", "سيجنال", "ديسكورد",
  "سكايب", "ويتشات", "وي شات", "ويشات", "بوتيم", "لينكدان", "لينكد ان", "فيس تايم", "فيستايم",
  "ايميل",
];
// «سناب» anywhere except "snapshot" («سناب شوت», final review minor 1)
const SNAP_AR_RE = /سناب(?!\s?شوت)/u;
// «اميل» (email without the ي) is also the verb «أميل» ("I lean": «أميل إلى الهدوء») and sits inside «فاميلي»
// (family), so it counts only as its own word (final review minor 1): with «ال» or a suffix («الاميل»,
// «اميلي», «عالاميل»), or bare unless the next word makes it the verb («إلى», «لل…»)
const EMAIL_AR_WORD = /^(?:[وب]?ال|عال|عل)?اميل(?:ي|ك|كم|ه|ها|نا|ات|اتي|اتك)?$/u;
function hasEmailWordAr(lower: string): boolean {
  const list = lower.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return list.some((w, i) => {
    if (!EMAIL_AR_WORD.test(w)) return false;
    if (w !== "اميل" && w !== "واميل") return true;
    const next = list[i + 1] ?? "";
    return !(next === "الى" || next === "الي" || next.startsWith("ل"));
  });
}
// Latin names: long ones anywhere, short ones (≤ 5 letters) only as a whole word, so "instant coffee",
// "snapshot" and "big" pass. Read after the look-alike swap (l / 1 / | / ! → i, 0 → o): "lnstagram" is Instagram
const SOCIAL_KEYWORDS_LATIN = [
  "whatsapp", "watsapp", "whats app", "what's app", "wats app",
  "instagram", "insta",
  "snapchat", "snap",
  "telegram",
  "facebook", "messenger",
  "tiktok",
  "viber", "twitter", "discord",
  "skype", "wechat", "we chat", "botim", "linkedin", "imessage", "facetime",
  "gmail", "hotmail", "yahoo", "outlook", "icloud", "protonmail", "proton mail", "yandex",
];
const WHOLE_WORD_MAX = 5;
/** "line: ahmad99", "line id ahmad" (the app): never the word "line" in a sentence */
const LINE_APP_RE = /\bline\s*(?:[:：=]|\s(?:id|اي دي)\b)/;
/**
 * Signal only with context (QA WC2-09): "signal: ahmad99", "signal id", "on signal", "signal ahmad99", "my signal is
 * ahmad99" — never
 * "signal was weak in the mountains". Read after the look-alike swap (l → i)
 */
const SIGNAL_APP_RE =
  /\bsignai\s*(?:[:：=]|\s(?:id|me)\b|\s+(?:(?:is|هو|name|username|handie)\s+){0,2}@?[a-z][a-z0-9_.]*\d)|\bon\s+signai\b/;
/** Kik only with context ("kik: ahmad", "on kik", "kik me", «كيك:»): «كيك» alone is cake */
const KIK_RE = /\bkik\s*[:：=]|\bon\s+kik\b|\bkik\s+me\b|كيك\s*[:：=]/;
// Short names only blocked as a whole word ("ig", not "big"; "وتس", not "وتسلم" / "وتسعين"; «لاين», not «اونلاين»)
const SOCIAL_WORDS = new Set(["ig", "fb", "imo", "ايمو", "وتس", "لاين"]);

/** Latin letters and digits people swap into app names ("lnstagram", "1nsta", "teleqram" aside) */
function lookAlikeLatin(s: string): string {
  return s.replace(/[l1|!]/g, "i").replace(/0/g, "o");
}

/**
 * Letters spaced or dotted apart, joined back (QA WC2-02): "w h a t s a p p", "w.h.a.t.s.a.p.p", «ا ن س ت ا»,
 * "s n a p". Only runs of 3+ single letters (Latin or Arabic) with 1–3 spaces, dots, dashes, underscores or
 * asterisks between them; ordinary words are never touched.
 */
function joinSpacedLetters(s: string): string {
  return s.replace(/(?<![\p{L}\p{N}])\p{L}(?:[\s.\-_*·]{1,3}\p{L}(?![\p{L}\p{N}])){2,}/gu, (run) => run.replace(/[^\p{L}]/gu, ""));
}

function hasSocialKeyword(text: string): boolean {
  return hasSocialKeywordIn(text) || hasSocialKeywordIn(joinSpacedLetters(text));
}

function hasSocialKeywordIn(lower: string): boolean {
  if (SOCIAL_KEYWORDS_AR.some((k) => lower.includes(normaliseArabic(k)))) return true;
  if (SNAP_AR_RE.test(lower) || hasEmailWordAr(lower)) return true;
  if (LINE_APP_RE.test(lower) || KIK_RE.test(lower)) return true;
  const latin = lookAlikeLatin(lower);
  if (SIGNAL_APP_RE.test(latin)) return true;
  return SOCIAL_KEYWORDS_LATIN.some((k) => {
    const key = lookAlikeLatin(k);
    if (k.length > WHOLE_WORD_MAX) return latin.includes(key);
    return new RegExp(`(?<![a-z])${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z])`).test(latin);
  });
}

type NumberWord = { place: "u" | "t" | "h"; value: number };

// Numbers spelled out (after normalising أإآ→ا and ة→ه): standard Arabic, Jordanian and Gulf dialects
// («زيرو», «ثنتين», «سبعمية», «اطنعش»), English. Phone numbers of every served country (Jordan 07…/962…,
// Saudi Arabia 05…/966…) are caught by length, whatever the prefix
const UNIT_WORDS: Record<string, number> = {
  صفر: 0, واحد: 1, اثنين: 2, اثنان: 2, ثنين: 2, ثلاثه: 3, ثلاث: 3, اربعه: 4, اربع: 4,
  خمسه: 5, خمس: 5, سته: 6, ست: 6, سبعه: 7, سبع: 7, ثمانيه: 8, ثمان: 8, تسعه: 9, تسع: 9,
  تنين: 2, اتنين: 2, ثنتين: 2, تنتين: 2, تلاته: 3, تلات: 3, تلاث: 3, تمانيه: 8, تمنيه: 8, ثمنيه: 8, تمان: 8,
  زيرو: 0,
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
};
const TENS_WORDS: Record<string, number> = {
  عشره: 10, عشر: 10, ten: 10,
  احدعش: 11, حدعش: 11, اطنعش: 12, اتنعش: 12, ثلطعش: 13, تلطعش: 13, تلتعش: 13, اربعطعش: 14, اربعتعش: 14,
  خمسطعش: 15, خمستعش: 15, ستطعش: 16, سطعش: 16, سبعطعش: 17, سبعتعش: 17, ثمنطعش: 18, تمنطعش: 18, تمنتعش: 18,
  تسعطعش: 19, تسعتعش: 19,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  عشرين: 20, عشرون: 20, ثلاثين: 30, ثلاثون: 30, تلاتين: 30, اربعين: 40, اربعون: 40, خمسين: 50, خمسون: 50,
  ستين: 60, ستون: 60, سبعين: 70, سبعون: 70, ثمانين: 80, ثمانون: 80, تمانين: 80, تسعين: 90, تسعون: 90,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const HUNDREDS_WORDS: Record<string, number> = {
  ميه: 100, مايه: 100, مائه: 100, مئه: 100, ميتين: 200, مئتين: 200, مئتان: 200, ميتان: 200,
  ثلاثميه: 300, تلاتميه: 300, تلتميه: 300, ثلاثمائه: 300, اربعميه: 400, اربعمايه: 400, اربعمائه: 400,
  خمسميه: 500, خمسمايه: 500, خمسمائه: 500, ستميه: 600, ستمايه: 600, ستمائه: 600,
  سبعميه: 700, سبعمايه: 700, سبعمائه: 700, ثمانميه: 800, ثمنميه: 800, تمنميه: 800, تمانميه: 800, ثمانمائه: 800,
  تسعميه: 900, تسعمايه: 900, تسعمائه: 900,
  hundred: 100,
};

/**
 * English number words written in Arabic letters («زيرو سفن ناين ون تو ثري…», iOS audit A-H01). Several are
 * ordinary Arabic words («فور» = at once, «تو» = just now, «ون»), so they count as digits only inside a run of
 * 4+ number words or digit groups in a row (`readTransliterated`). After normalising (أإآ → ا, harakat gone).
 */
const TRANSLITERATED_UNITS: Record<string, string> = {
  زيرو: "zero", زيروو: "zero", ون: "one", وان: "one", تو: "two", تيو: "two", ثري: "three", تري: "three",
  فور: "four", فايف: "five", فايڤ: "five", فيف: "five", سكس: "six", سيكس: "six", سفن: "seven", سيفن: "seven",
  سيڤن: "seven", ايت: "eight", ايث: "eight", ناين: "nine",
};
/** Number words or digit groups in a row that make the transliterated words count as digits */
const TRANSLITERATED_RUN = 4;

function numberWordExact(word: string): NumberWord | null {
  if (word in UNIT_WORDS) return { place: "u", value: UNIT_WORDS[word] };
  if (word in TENS_WORDS) return { place: "t", value: TENS_WORDS[word] };
  if (word in HUNDREDS_WORDS) return { place: "h", value: HUNDREDS_WORDS[word] };
  return null;
}

/** A spelled number word; "و" + a number word ("وخمسه", "وعشرين") counts as the word */
function numberWord(word: string): NumberWord | null {
  return numberWordExact(word) ?? (word.startsWith("و") ? numberWordExact(word.slice(1)) : null);
}

const OFFENSIVE = ["يا حمار", "يا كلب", "يا غبي", "يا حيوان", "حقير", "fuck", "shit", "bitch"];

/**
 * Every digit form a keyboard or emoji picker can produce → ASCII: Arabic-Indic, Persian, fullwidth
 * (０-９), keycap emoji (0️⃣ = "0" + U+FE0F + U+20E3), circled (①, ⓪) and mathematical (𝟎-𝟿) digits.
 */
function normaliseDigits(s: string): string {
  return s
    .replace(/[\uFE0F\u20E3]/g, "")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[０-９]/g, (d) => String(d.charCodeAt(0) - 0xff10))
    .replace(/[①-⑨]/g, (d) => String(d.charCodeAt(0) - 0x2460 + 1))
    .replace(/⓪/g, "0")
    .replace(/[\u{1D7CE}-\u{1D7FF}]/gu, (d) => String((d.codePointAt(0)! - 0x1d7ce) % 10));
}

/**
 * The text every check reads: digits in ASCII, and gone what changes nothing a reader sees: tatweel
 * (ـ, U+0640), every combining mark (harakat, keycap leftovers) and invisible format characters
 * (zero-width joiners, direction marks). Never the stored text.
 */
function forChecks(s: string): string {
  return normaliseDigits(s).replace(/[\u0640\p{M}\p{Cf}]/gu, "");
}

function normaliseArabic(s: string): string {
  return s.replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/[ً-ْ]/g, "");
}

/**
 * A phone number written as one run:
 * - 7+ digits with only spaces, dashes, dots, plus or brackets between them, or
 * - 9+ digits with any symbols between them (079/555/1234, 079_555_1234, 0*7*9…). Nine keeps dates
 *   like 12/10/2026 (8 digits) out.
 */
function hasPhoneNumber(s: string): boolean {
  const runs = s.match(/\d[\d\s\-.()+]*\d/g) ?? [];
  if (runs.some((run) => run.replace(/\D/g, "").length >= 7)) return true;
  const loose = s.match(/\d(?:[^\p{L}\p{N}]{0,3}\d)+/gu) ?? [];
  return loose.some((run) => run.replace(/\D/g, "").length >= 9);
}

/**
 * Latin letters standing in for digits inside a number ("O79 555 I234" → 0, 1) and 1–3 letters of any
 * script used as separators between digits ("079x555x1234", "0ب7ب9…"): only for the number checks, never
 * the stored text. Words with spaces around them ("1995 و 2017") stay apart.
 */
function normaliseNumberDisguise(s: string): string {
  let out = s;
  // Repeat so a run of look-alikes next to a digit ("OO79") is read one letter at a time
  for (let i = 0; i < 4; i++) {
    const next = out
      .replace(/(?<=\d)[oO]|[oO](?=\d)/g, "0")
      .replace(/(?<=\d)[Iil]|[Iil](?=\d)/g, "1");
    if (next === out) break;
    out = next;
  }
  // …except between two years / round amounts ("1990و1995", "2017و2019"): ordinary talk, kept apart
  return out.replace(/(\d+)(\p{L}{1,3})(?=(\d+))/gu, (_m, left: string, sep: string, right: string) =>
    ordinaryNumber(left) && ordinaryNumber(right) ? `${left} ${sep} ` : left,
  );
}

function isYear(group: string): boolean {
  const n = Number(group);
  return group.length === 4 && n >= 1950 && n <= 2039;
}

/** A year (1950–2039) or a round amount ("5000" dowry, "1500" salary): ordinary talk, not a phone group */
function ordinaryNumber(group: string): boolean {
  if (group.length < 4) return false;
  const n = Number(group);
  return (n >= 1950 && n <= 2039) || /00$/.test(group);
}

/** Digit words anywhere in one message that make it a spelled number («صفر ثم سبعة ثم تسعة…») */
const SCATTERED_DIGIT_WORDS = 6;
/** Digits anywhere in one message (written groups + spelled numbers, word-separated) that make it a number */
const SCATTERED_DIGITS = 9;

/** Message split into words: anything that isn't a letter or a digit separates them */
function words(s: string): string[] {
  return normaliseArabic(s.toLowerCase()).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/**
 * A short number with the Arabic connector glued in front («و27», «ف5», «ب30»): a word separator, not a
 * letter between digits, so it reads as «و» then 27 (final review I2, owner ruling). A list of ages or
 * prices written this way («اعمارهم 30 و27 و25 و22 و19») is ordinary family talk, so hasScatteredNumber
 * doesn't count these groups. Pieces glued on both sides ("079و123و4567") are joined by
 * normaliseNumberDisguise first and stay caught as one run.
 */
const GLUED_CONNECTOR_GROUP = /^[وفب]\d{1,2}$/u;

/**
 * Words for the number checks: also split where letters meet digits ("zero7nine1two3" → zero 7 nine 1 two 3,
 * QA WC2-01), and transliterated number words read as digits inside a run of 4+ (`TRANSLITERATED_UNITS`).
 * `glued` marks the digit groups split off a leading connector (`GLUED_CONNECTOR_GROUP`).
 */
function numberWords(s: string): { list: string[]; glued: Set<number> } {
  const list: string[] = [];
  const glued = new Set<number>();
  for (const w of words(s)) {
    const parts = w.split(/(?<=\p{L})(?=\p{N})|(?<=\p{N})(?=\p{L})/u).filter(Boolean);
    if (GLUED_CONNECTOR_GROUP.test(w)) glued.add(list.length + 1);
    list.push(...parts);
  }
  const counts = (w: string) => /^\d+$/.test(w) || numberWord(w) !== null || w in TRANSLITERATED_UNITS;
  const out = [...list];
  let start = 0;
  for (let i = 0; i <= list.length; i++) {
    if (i < list.length && counts(list[i])) continue;
    if (i - start >= TRANSLITERATED_RUN) {
      for (let j = start; j < i; j++) if (numberWord(list[j]) === null && list[j] in TRANSLITERATED_UNITS) out[j] = TRANSLITERATED_UNITS[list[j]];
    }
    start = i + 1;
  }
  return { list: out, glued };
}

/**
 * A message read as tokens: written digit groups, spelled numbers (consecutive number words read as one
 * number the way people say them: «مية وثلاثة وعشرين» = 123, 3 digits; «سبع مية» = 700; "twenty one" = 21)
 * and other words. `single` marks a spelled number that is one digit word on its own («صفر», «سبعة»).
 */
type Token = { kind: "written"; text: string; glued?: boolean } | { kind: "spelled"; digits: number; single: boolean } | { kind: "word"; text: string };

function tokens(s: string): Token[] {
  const out: Token[] = [];
  let group: { value: number; last: NumberWord["place"]; parts: number; hasUnit: boolean } | null = null;
  const flush = () => {
    if (!group) return;
    out.push({ kind: "spelled", digits: group.value === 0 ? 1 : String(group.value).length, single: group.parts === 1 && group.last === "u" });
    group = null;
  };
  const { list, glued } = numberWords(s);
  for (const [i, word] of list.entries()) {
    const n = numberWord(word);
    if (!n) {
      flush();
      out.push(/^\d+$/.test(word) ? { kind: "written", text: word, ...(glued.has(i) && { glued: true }) } : { kind: "word", text: word });
      continue;
    }
    const g = group as { value: number; last: NumberWord["place"]; parts: number; hasUnit: boolean } | null;
    if (g && g.last === "u" && g.parts === 1 && n.place === "h" && n.value === 100 && g.value > 0) {
      // «سبع مية», "seven hundred"
      g.value *= 100;
      g.last = "h";
      g.parts += 1;
    } else if (
      g &&
      ((g.last === "h" && n.place !== "h") ||
        (g.last === "u" && n.place === "t" && g.value % 10 > 0) ||
        (g.last === "t" && n.place === "u" && !g.hasUnit && n.value > 0 && g.value % 10 === 0))
    ) {
      g.value += n.value;
      g.last = n.place;
      g.parts += 1;
      g.hasUnit ||= n.place === "u";
    } else {
      flush();
      group = { value: n.value, last: n.place, parts: 1, hasUnit: n.place === "u" };
    }
  }
  flush();
  return out;
}

/**
 * A number hidden among words: 6+ spelled digits anywhere ("صفر ثم سبعة ثم تسعة ثم …"), or 9+ digits
 * in total across written groups and single spelled digits with words between them ("07 ثم 95 ثم 55 ثم 12
 * ثم 34"). Years and round amounts don't count, so
 * "مواليد 1995 وتخرجت 2017 والمهر 5000" stays an ordinary message.
 */
function hasScatteredNumber(s: string): boolean {
  let spelled = 0;
  let total = 0;
  const list = tokens(s);
  // A group with a leading zero ("07", «و05») is how a phone number starts, never an age or a price: then the
  // glued list items count again ("07 و95 و55 و12 و34")
  const phoneStart = list.some((t) => t.kind === "written" && t.text.length >= 2 && t.text.startsWith("0"));
  for (const t of list) {
    if (t.kind === "spelled") {
      // Single spelled digits only: numbers said the long way («مية وسبعين») with words between them are
      // how people describe themselves (age, height, weight, salary); read in a row they are caught by
      // hasSpelledNumber
      if (t.single) {
        spelled += 1;
        total += 1;
      }
    } else if (t.kind === "written" && !(t.glued && !phoneStart) && !ordinaryNumber(t.text)) {
      // A short number with «و»/«ف»/«ب» glued in front is a list item («30 و27 و25»), not a phone group
      total += t.text.length;
    }
  }
  return spelled >= SCATTERED_DIGIT_WORDS || total >= SCATTERED_DIGITS;
}

/** A short word between the groups of one number read aloud («ثم», «و», «بعدين», "then", "and", any word of ≤ 3 letters) */
const CONNECTORS = new Set(["و", "ثم", "بعدين", "وبعدين", "بعدها", "وبعدها", "then", "and"]);
function connector(word: string): boolean {
  return CONNECTORS.has(word) || [...word].length <= 3;
}

/**
 * 7+ digits in a row (across short connectors), counting written digit groups and spelled-out numbers together, so mixing them
 * ("079 خمسه خمسه خمسه 1234") or spelling in dialect or English doesn't get through.
 */
function hasSpelledNumber(s: string): boolean {
  // Written-only digit runs are hasPhoneNumber's job (it knows dates like 12/10/2026 apart)
  let streak = 0;
  let spelled = false;
  for (const t of tokens(s)) {
    if (t.kind === "written") streak += t.text.length;
    else if (t.kind === "spelled") {
      streak += t.digits;
      spelled = true;
    } else if (connector(t.text)) {
      // «ثم», «و», "then": the next group carries on the same number
    } else {
      streak = 0;
      spelled = false;
    }
    if (streak >= 7 && spelled) return true;
  }
  return false;
}

/**
 * How many digits a message carries (written or spelled out), whether it is only a number (every
 * word is a number word or digit group, e.g. "079" or "صفر سبعة تسعة"), and its longest digit group.
 * In a message with words around the numbers, years and round amounts ("مواليد 1995", "المهر 5000")
 * are ordinary talk and don't count.
 */
export function numberShape(body: string): { digits: number; numberish: boolean; longestGroup: number; spelledRun: number } {
  const list = tokens(normaliseNumberDisguise(forChecks(body ?? "")));
  const numberish = list.length > 0 && list.every((t) => t.kind !== "word");
  let digits = 0;
  let longestGroup = 0;
  // Spelled numbers in a row («سبعة وسبعين واحد اثنين ثلاثة»): 4+ make the message a piece of a number
  let spelledRun = 0;
  let run = 0;
  for (const t of list) {
    run = t.kind === "spelled" ? run + 1 : 0;
    spelledRun = Math.max(spelledRun, run);
    if (t.kind === "spelled") digits += t.digits;
    // Years never count ("1995", then "2020"); round amounts only in a message that is just the number
    else if (t.kind === "written" && !isYear(t.text) && (numberish || !ordinaryNumber(t.text))) {
      digits += t.text.length;
      longestGroup = Math.max(longestGroup, t.text.length);
    }
  }
  // "رقمي 079" has a word, so it is a wrapped piece (mayBePartOfNumber) and needs the higher total
  return { digits, numberish, longestGroup, spelledRun };
}

/** Spelled numbers in a row that make a message with words around them a piece of a number */
const SPELLED_PIECE_RUN = 4;

/**
 * Worth reading together with the sender's previous messages: only a number, carries a 3+ digit group, or 4+
 * spelled numbers in a row («رقمي سبعة وسبعين واحد اثنين ثلاثة», iOS audit A-H01)
 */
export function mayBePartOfNumber(body: string): boolean {
  const shape = numberShape(body);
  return shape.digits > 0 && (shape.numberish || shape.longestGroup >= 3 || shape.spelledRun >= SPELLED_PIECE_RUN);
}

/** Minutes within which the sender's messages are read together */
export const SPLIT_NUMBER_WINDOW_MS = 10 * 60 * 1000;
/** Number-only pieces ("079", «صفر سبعة») are read together over a longer stretch */
export const NUMBER_ONLY_WINDOW_MS = 60 * 60 * 1000;
/** How many recent messages the split-number check reads */
export const SPLIT_NUMBER_LOOKBACK = 20;

/**
 * The sender's own run of messages since the partner last wrote (newest first), as pieces for
 * completesSplitNumber: anything from the last 10 minutes, and number-only messages from the last hour.
 * Two people alternating pieces is accepted (owner): the partner's message ends the run.
 */
export function ownRecentPieces(
  recentNewestFirst: { senderId: string; body: string; createdAt: Date }[],
  senderId: string,
  now = Date.now(),
): string[] {
  const out: string[] = [];
  for (const m of recentNewestFirst) {
    if (m.senderId !== senderId) break;
    const age = now - m.createdAt.getTime();
    if (age <= SPLIT_NUMBER_WINDOW_MS || (age <= NUMBER_ONLY_WINDOW_MS && numberShape(m.body).numberish)) out.push(m.body);
  }
  return out;
}

/**
 * A phone number sent in pieces: this message and the sender's previous messages (newest first, already
 * limited to their own recent run) that may be pieces of a number add up to 7+ digits (9+ when any piece
 * has words around it). The sender's own other messages in between ("تمام", "و") are skipped, not a
 * reset. A message on its own is checkMessage's job: at least one earlier piece is needed.
 */
export function completesSplitNumber(current: string, previousNewestFirst: string[]): boolean {
  if (!mayBePartOfNumber(current)) return false;
  const now = numberShape(current);
  let total = now.digits;
  // Pieces wrapped in text ("رقمي 0795", "والباقي 551234") need 9 digits, so an age or height
  // mentioned in passing doesn't add up to a "number"
  let allNumberish = now.numberish;
  for (const prev of previousNewestFirst) {
    if (!mayBePartOfNumber(prev)) continue;
    const shape = numberShape(prev);
    total += shape.digits;
    allNumberish = allNumberish && shape.numberish;
    if (total >= (allNumberish ? 7 : 9)) return true;
  }
  return false;
}

function fail(reason: FilterReason): FilterResult {
  return { ok: false, reason, message: MESSAGES[reason] };
}

export function checkMessage(body: string): FilterResult {
  const text = (body ?? "").trim();
  if (!text) return fail("EMPTY");
  if (text.length > MAX_MESSAGE_LENGTH) return fail("TOO_LONG");

  const digits = forChecks(text);
  const lower = normaliseArabic(digits.toLowerCase());

  if (LINK_RE.test(digits) || SPACED_LINK_RE.test(lower)) return fail("LINK");
  if (EMAIL_RE.test(digits) || HANDLE_RE.test(digits) || EMAIL_AT_RE.test(lower)) return fail("CONTACT");
  if (HANDLE_AFTER_AR.test(lower) || HANDLE_AFTER_EN.test(lower) || hasUsernameShape(lower)) return fail("CONTACT");
  const numbers = normaliseNumberDisguise(digits);
  if (hasPhoneNumber(numbers) || hasSpelledNumber(numbers) || hasScatteredNumber(numbers)) return fail("CONTACT");
  if (hasSocialKeyword(lower)) return fail("CONTACT");
  if (words(digits).some((w) => SOCIAL_WORDS.has(w))) return fail("CONTACT");
  if (OFFENSIVE.some((w) => lower.includes(normaliseArabic(w)))) return fail("OFFENSIVE");

  return { ok: true, text };
}
