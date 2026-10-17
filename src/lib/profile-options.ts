/**
 * Profile option lists with labels per gender.
 * The stored value never changes (matching compares values, and existing rows keep them);
 * only what people see changes: feminine forms for women, and third person when the
 * option describes someone else (partner preferences, other people's cards).
 */

export interface Opt {
  value: string;
  label: string;
}

type G = "MALE" | "FEMALE";
const norm = (g: string | null | undefined): G => (g === "FEMALE" ? "FEMALE" : "MALE");
export const oppositeGender = (g: string | null | undefined): G => (norm(g) === "FEMALE" ? "MALE" : "FEMALE");

export const OPTION_VALUES = {
  job: [
    "مهندس", "طبيب", "صيدلي", "محامي", "معلم/أستاذ", "محاسب", "ممرض",
    "ضابط/عسكري", "موظف حكومي", "موظف قطاع خاص", "رجل أعمال",
    "تاجر", "مبرمج/مطور", "مصمم", "صحفي/إعلامي", "مقاول",
    "سائق", "حرفي/فني", "طالب/طالبة", "أعمال حرة", "ربة منزل",
    "متقاعد", "لا يعمل حالياً", "أخرى",
  ],
  maritalStatus: ["أعزب/عزباء", "مطلق/مطلقة", "أرمل/أرملة"],
  religiosity: ["ملتزم جداً", "ملتزم", "متوسط", "غير ملتزم"],
  smokingStatus: ["لا أدخن", "أدخن", "أدخن أحياناً", "تركت التدخين"],
  cookingAbility: ["لا أطبخ", "أطبخ قليلاً", "أطبخ جيداً", "أطبخ ممتازاً"],
  lifestyle: ["نشيط", "هادئ", "متوازن", "اجتماعي"],
} as const;

export type OptionField = keyof typeof OPTION_VALUES;

type Labels = Partial<Record<OptionField, Record<string, string>>>;

/** How a person of that gender describes themself (first-person verbs are the same for both). */
const SELF: Record<G, Labels> = {
  MALE: {
    job: { "طالب/طالبة": "طالب" },
    maritalStatus: { "أعزب/عزباء": "أعزب", "مطلق/مطلقة": "مطلق", "أرمل/أرملة": "أرمل" },
  },
  FEMALE: {
    job: {
      "مهندس": "مهندسة", "طبيب": "طبيبة", "صيدلي": "صيدلانية", "محامي": "محامية",
      "معلم/أستاذ": "معلمة/أستاذة", "محاسب": "محاسبة", "ممرض": "ممرضة",
      "ضابط/عسكري": "ضابطة/عسكرية", "موظف حكومي": "موظفة حكومية", "موظف قطاع خاص": "موظفة قطاع خاص",
      "رجل أعمال": "سيدة أعمال", "تاجر": "تاجرة", "مبرمج/مطور": "مبرمجة/مطورة", "مصمم": "مصممة",
      "صحفي/إعلامي": "صحفية/إعلامية", "مقاول": "مقاولة", "سائق": "سائقة", "حرفي/فني": "حرفية/فنية",
      "طالب/طالبة": "طالبة", "متقاعد": "متقاعدة", "لا يعمل حالياً": "لا تعمل حالياً",
    },
    maritalStatus: { "أعزب/عزباء": "عزباء", "مطلق/مطلقة": "مطلقة", "أرمل/أرملة": "أرملة" },
    religiosity: { "ملتزم جداً": "ملتزمة جداً", "ملتزم": "ملتزمة", "متوسط": "متوسطة", "غير ملتزم": "غير ملتزمة" },
    lifestyle: { "نشيط": "نشيطة", "هادئ": "هادئة", "متوازن": "متوازنة", "اجتماعي": "اجتماعية" },
  },
};

/** Overrides when the option describes someone else (third person). */
const OTHER: Record<G, Labels> = {
  MALE: {
    smokingStatus: { "لا أدخن": "غير مدخن", "أدخن": "مدخن", "أدخن أحياناً": "يدخن أحياناً", "تركت التدخين": "ترك التدخين" },
    cookingAbility: { "لا أطبخ": "لا يطبخ", "أطبخ قليلاً": "يطبخ قليلاً", "أطبخ جيداً": "يطبخ جيداً", "أطبخ ممتازاً": "يطبخ بإتقان" },
  },
  FEMALE: {
    smokingStatus: { "لا أدخن": "غير مدخنة", "أدخن": "مدخنة", "أدخن أحياناً": "تدخن أحياناً", "تركت التدخين": "تركت التدخين" },
    cookingAbility: { "لا أطبخ": "لا تطبخ", "أطبخ قليلاً": "تطبخ قليلاً", "أطبخ جيداً": "تطبخ جيداً", "أطبخ ممتازاً": "تطبخ بإتقان" },
  },
};

/** The label of one stored value as the person themself sees it. Unknown values (free-text jobs) come back as they are. */
export function selfLabel(field: OptionField, value: string, gender: string | null | undefined): string {
  return SELF[norm(gender)][field]?.[value] ?? value;
}

/** The label of one stored value describing a person of `gender` to someone else. */
export function describeOption(field: OptionField, value: string, gender: string | null | undefined): string {
  return OTHER[norm(gender)][field]?.[value] ?? selfLabel(field, value, gender);
}

/**
 * Nationality is free text ("أردني", "أردنية", "مصري"…): show it in the person's gender.
 * "أردني" → "أردنية" for a woman, "أردنية" → "أردني" for a man; anything else unchanged.
 */
export function nationalityLabel(value: string | null | undefined, gender: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (gender === "FEMALE" && /ي$/.test(v)) return `${v}ة`;
  if (gender === "MALE" && /ية$/.test(v)) return v.slice(0, -1);
  return v;
}

/** Options for my own profile. */
export function ownOptions(field: OptionField, gender: string | null | undefined): Opt[] {
  return OPTION_VALUES[field].map((value) => ({ value, label: selfLabel(field, value, gender) }));
}

/** Options for a partner preference, written about the partner (the other gender). */
export function partnerOptions(field: OptionField, myGender: string | null | undefined): Opt[] {
  const partner = oppositeGender(myGender);
  return OPTION_VALUES[field].map((value) => ({ value, label: describeOption(field, value, partner) }));
}
