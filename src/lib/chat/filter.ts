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
    "لا يمكن مشاركة أرقام الهواتف أو الروابط أو حسابات التواصل. مشاركة التواصل تتم عبر التعارف العائلي.",
  LINK:
    "لا يمكن مشاركة أرقام الهواتف أو الروابط أو حسابات التواصل. مشاركة التواصل تتم عبر التعارف العائلي.",
  OFFENSIVE: "الرجاء الالتزام بأسلوب محترم.",
};

// Common generic TLDs + the region's country codes (Gulf, Levant, Egypt, Turkey) and the usual
// short-link/cheap ones (.xyz, .site, .gg …)
const LINK_RE =
  /(https?:\/\/|www\.|wa\.me|t\.me|\b[a-z0-9-]+\.(com|net|org|me|jo|io|co|info|app|link|ly|xyz|site|online|store|shop|live|page|dev|biz|top|club|pro|tv|cc|gg|ws|to|sa|ae|qa|kw|bh|om|eg|ps|iq|lb|sy|tr|uk|us|ca|de|fr)\b)/i;

const EMAIL_RE = /\S+@\S+\.\S+/;
const HANDLE_RE = /(^|[\s(،,])@[a-z0-9_.]{2,}/i;

// Matched anywhere in the message (after normalising), so keep them long enough not to hit normal words
const SOCIAL_KEYWORDS = [
  "whatsapp", "watsapp", "whats app", "what's app", "wats app", "واتس", "واتس اب", "وات ساب", "وات س اب", "وتس اب", "وتساب", "وتسب",
  "instagram", "insta", "انستا", "انستغرام", "انستقرام", "انستجرام", "انستكرام", "اينستا", "انستغرم",
  "snapchat", "snap", "سناب",
  "telegram", "تلغرام", "تيليجرام", "تلجرام", "تيلجرام", "تيليغرام", "تليغرام", "تلقرام", "تيليقرام",
  "facebook", "فيسبوك", "فيس بوك", "messenger", "ماسنجر", "مسنجر",
  "tiktok", "تيك توك", "تيكتوك",
  "viber", "فايبر", "twitter", "تويتر", "signal", "سيجنال", "discord", "ديسكورد",
  "gmail", "hotmail", "yahoo", "outlook", "icloud", "ايميل", "اميل",
];
// Short names only blocked as a whole word ("ig", not "big"; "وتس", not "وتسلم" / "وتسعين")
const SOCIAL_WORDS = new Set(["ig", "fb", "imo", "ايمو", "وتس"]);

// Digits spelled out (after normalising أإآ→ا and ة→ه): standard Arabic, Jordanian dialect, English
const DIGIT_WORDS = new Set([
  "صفر", "واحد", "اثنين", "اثنان", "ثنين", "ثلاثه", "ثلاث", "اربعه", "اربع",
  "خمسه", "خمس", "سته", "ست", "سبعه", "سبع", "ثمانيه", "ثمان", "تسعه", "تسع",
  "تنين", "اتنين", "ثنتين", "تنتين", "تلاته", "تلات", "تلاث", "تمانيه", "تمنيه", "ثمنيه", "تمان",
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
]);

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
 * Latin letters standing in for digits inside a number ("O79 555 I234" → 0, 1) and letters used as
 * separators between digits ("079x555x1234"): only for the number checks, never the stored text.
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
  return out.replace(/(?<=\d)[a-zA-Z]{1,3}(?=\d)/g, "");
}

/** A year (1950–2039) or a round amount ("5000" dowry, "1500" salary): ordinary talk, not a phone group */
function ordinaryNumber(group: string): boolean {
  if (group.length < 4) return false;
  const n = Number(group);
  return (n >= 1950 && n <= 2039) || /00$/.test(group);
}

/** Digit words anywhere in one message that make it a spelled number («صفر ثم سبعة ثم تسعة…») */
const SCATTERED_DIGIT_WORDS = 6;
/** Digits anywhere in one message (written groups + spelled digits, word-separated) that make it a number */
const SCATTERED_DIGITS = 9;

/**
 * A number hidden among words: 6+ spelled digits anywhere ("صفر ثم سبعة ثم تسعة ثم …"), or 9+ digits
 * in total across groups with words between them ("07 ثم 95 ثم 55 ثم 12 ثم 34"). Years and round
 * amounts don't count, so "مواليد 1995 وتخرجت 2017 والمهر 5000" stays an ordinary message.
 */
function hasScatteredNumber(s: string): boolean {
  let spelled = 0;
  let total = 0;
  for (const word of words(s)) {
    if (digitWord(word)) {
      spelled += 1;
      total += 1;
    } else if (/^\d+$/.test(word) && !ordinaryNumber(word)) {
      total += word.length;
    }
  }
  return spelled >= SCATTERED_DIGIT_WORDS || total >= SCATTERED_DIGITS;
}

/** Message split into words: anything that isn't a letter or a digit separates them */
function words(s: string): string[] {
  return normaliseArabic(s.toLowerCase()).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/** "و" + digit word ("وخمسه") counts as the digit word */
function digitWord(word: string): boolean {
  return DIGIT_WORDS.has(word) || (word.startsWith("و") && DIGIT_WORDS.has(word.slice(1)));
}

/**
 * 7+ digits in a row, counting written digit groups and spelled-out digits together, so mixing them
 * ("079 خمسه خمسه خمسه 1234") or spelling in dialect or English doesn't get through.
 */
function hasSpelledNumber(s: string): boolean {
  // Written-only digit runs are hasPhoneNumber's job (it knows dates like 12/10/2026 apart)
  let streak = 0;
  let spelled = false;
  for (const word of words(s)) {
    if (/^\d+$/.test(word)) streak += word.length;
    else if (digitWord(word)) {
      streak += 1;
      spelled = true;
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
 * word is a digit word or digit group, e.g. "079" or "صفر سبعة تسعة"), and its longest digit group.
 */
export function numberShape(body: string): { digits: number; numberish: boolean; longestGroup: number } {
  const tokens = words(normaliseDigits(body ?? ""));
  let digits = 0;
  let numericTokens = 0;
  let longestGroup = 0;
  for (const word of tokens) {
    if (digitWord(word)) {
      digits += 1;
      numericTokens += 1;
    } else if (/^\d+$/.test(word)) {
      digits += word.length;
      numericTokens += 1;
      longestGroup = Math.max(longestGroup, word.length);
    }
  }
  // Only digits (written or spelled): "صفر سبعة تسعة", "079". "رقمي 079" has a word, so it is a
  // wrapped piece (mayBePartOfNumber) and needs the higher total
  return { digits, numberish: tokens.length > 0 && numericTokens === tokens.length, longestGroup };
}

/** Worth reading together with the sender's previous messages: only a number, or carries a 3+ digit group */
export function mayBePartOfNumber(body: string): boolean {
  const shape = numberShape(body);
  return shape.digits > 0 && (shape.numberish || shape.longestGroup >= 3);
}

/** Minutes within which consecutive number-only messages are read together */
export const SPLIT_NUMBER_WINDOW_MS = 10 * 60 * 1000;

/**
 * A phone number sent in pieces: this message and the sender's previous messages (newest first,
 * already limited to the recent window) that may be pieces of a number add up to 7+ digits (9+ when
 * any piece has words around it).
 */
export function completesSplitNumber(current: string, previousNewestFirst: string[]): boolean {
  if (!mayBePartOfNumber(current)) return false;
  const now = numberShape(current);
  let total = now.digits;
  // Pieces wrapped in text ("رقمي 0795", "والباقي 551234") need 9 digits, so an age or height
  // mentioned in passing doesn't add up to a "number"
  let allNumberish = now.numberish;
  const enough = () => total >= (allNumberish ? 7 : 9);
  for (const prev of previousNewestFirst) {
    if (!mayBePartOfNumber(prev)) break;
    const shape = numberShape(prev);
    total += shape.digits;
    allNumberish = allNumberish && shape.numberish;
    if (enough()) return true;
  }
  return enough();
}

function fail(reason: FilterReason): FilterResult {
  return { ok: false, reason, message: MESSAGES[reason] };
}

export function checkMessage(body: string): FilterResult {
  const text = (body ?? "").trim();
  if (!text) return fail("EMPTY");
  if (text.length > MAX_MESSAGE_LENGTH) return fail("TOO_LONG");

  const digits = normaliseDigits(text);
  const lower = normaliseArabic(digits.toLowerCase());

  if (LINK_RE.test(digits)) return fail("LINK");
  if (EMAIL_RE.test(digits) || HANDLE_RE.test(digits)) return fail("CONTACT");
  const numbers = normaliseNumberDisguise(digits);
  if (hasPhoneNumber(numbers) || hasSpelledNumber(numbers) || hasScatteredNumber(numbers)) return fail("CONTACT");
  if (SOCIAL_KEYWORDS.some((k) => lower.includes(normaliseArabic(k)))) return fail("CONTACT");
  if (words(digits).some((w) => SOCIAL_WORDS.has(w))) return fail("CONTACT");
  if (OFFENSIVE.some((w) => lower.includes(normaliseArabic(w)))) return fail("OFFENSIVE");

  return { ok: true, text };
}
