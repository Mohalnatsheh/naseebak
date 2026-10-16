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

const LINK_RE =
  /(https?:\/\/|www\.|wa\.me|t\.me|\b[a-z0-9-]+\.(com|net|org|me|jo|io|co|info|app|link|ly)\b)/i;

const EMAIL_RE = /\S+@\S+\.\S+/;
const HANDLE_RE = /(^|[\s(،,])@[a-z0-9_.]{2,}/i;

const SOCIAL_KEYWORDS = [
  "whatsapp", "watsapp", "واتس", "وتس اب",
  "instagram", "insta", "انستا", "انستغرام", "انستقرام",
  "snapchat", "snap", "سناب",
  "telegram", "تلغرام", "تيليجرام", "تلجرام", "تيلجرام",
  "facebook", "فيسبوك", "فيس بوك",
  "tiktok", "تيك توك", "تيكتوك",
  "gmail", "hotmail", "ايميل", "اميل",
];

// Digits spelled out in Arabic (after normalising أإآ→ا and ة→ه)
const DIGIT_WORDS = new Set([
  "صفر", "واحد", "اثنين", "اثنان", "ثنين", "ثلاثه", "ثلاث", "اربعه", "اربع",
  "خمسه", "خمس", "سته", "ست", "سبعه", "سبع", "ثمانيه", "ثمان", "تسعه", "تسع",
]);

const OFFENSIVE = ["يا حمار", "يا كلب", "يا غبي", "يا حيوان", "حقير", "fuck", "shit", "bitch"];

/** Arabic-Indic and Persian digits → ASCII */
function normaliseDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

function normaliseArabic(s: string): string {
  return s.replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/[ً-ْ]/g, "");
}

/** 7+ digits written as one number, allowing spaces, dashes, dots, plus and brackets between them */
function hasPhoneNumber(s: string): boolean {
  const runs = s.match(/\d[\d\s\-.()+]*\d/g) ?? [];
  return runs.some((run) => run.replace(/\D/g, "").length >= 7);
}

function hasSpelledNumber(s: string): boolean {
  let streak = 0;
  for (const raw of normaliseArabic(s).split(/[\s،,.-]+/)) {
    const word = raw.startsWith("و") && DIGIT_WORDS.has(raw.slice(1)) ? raw.slice(1) : raw;
    streak = DIGIT_WORDS.has(word) ? streak + 1 : 0;
    if (streak >= 7) return true;
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

  const digits = normaliseDigits(text);
  const lower = normaliseArabic(digits.toLowerCase());

  if (LINK_RE.test(digits)) return fail("LINK");
  if (EMAIL_RE.test(digits) || HANDLE_RE.test(digits)) return fail("CONTACT");
  if (hasPhoneNumber(digits) || hasSpelledNumber(digits)) return fail("CONTACT");
  if (SOCIAL_KEYWORDS.some((k) => lower.includes(normaliseArabic(k)))) return fail("CONTACT");
  if (OFFENSIVE.some((w) => lower.includes(normaliseArabic(w)))) return fail("OFFENSIVE");

  return { ok: true, text };
}
