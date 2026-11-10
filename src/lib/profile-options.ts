/**
 * Profile option lists with labels per gender.
 * The stored value never changes (matching compares values, and existing rows keep them);
 * only what people see changes: feminine forms for women, and third person when the
 * option describes someone else (partner preferences, other people's cards).
 */

import { countryConfig, toCountry, type CountryCode } from "@/lib/countries";
import { PREF_SECT_VALUES, SECT_VALUES } from "@/lib/profile-sect";

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
  /** «المذهب», Lebanese members only (`sectApplies`) */
  sect: SECT_VALUES,
} as const;

export type OptionField = keyof typeof OPTION_VALUES;

/** Options with one label for everyone (same in every country) */
export const SKIN_COLORS = ["أبيض", "حنطي", "أسمر", "غامق"] as const;

/** Skin colour in the person's gender (stored values stay masculine; QA WA-13) */
const SKIN_FEMALE: Record<string, string> = { "أبيض": "بيضاء", "حنطي": "حنطية", "أسمر": "سمراء", "غامق": "غامقة" };
export function skinColorLabel(value: string, gender: string | null | undefined): string {
  return norm(gender) === "FEMALE" ? (SKIN_FEMALE[value] ?? value) : value;
}

/** Skin colour choices for a person of this gender describing themself */
export function skinColorOptions(gender: string | null | undefined): Opt[] {
  return SKIN_COLORS.map((value) => ({ value, label: skinColorLabel(value, gender) }));
}

/** Jobs only one gender picks: «ربة منزل» is not offered to men (a stored value still shows) */
const FEMALE_ONLY_JOBS: ReadonlySet<string> = new Set(["ربة منزل"]);

/** The job values offered to a person of this gender */
export function jobValuesFor(gender: string | null | undefined): string[] {
  return OPTION_VALUES.job.filter((j) => norm(gender) === "FEMALE" || !FEMALE_ONLY_JOBS.has(j));
}
export const HOUSING_TYPES = ["ملك", "إيجار", "مع العائلة"] as const;

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
    sect: { "سني": "سنية", "شيعي": "شيعية" },
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

/* ---------- Per-country lists (the member's country; db-free, safe in client wizards) ---------- */

/**
 * Nationality suggestions for the free-text field (masculine stored form; the member's country
 * first, then other Arab nationalities). The wizards offer them as a datalist; any value is accepted.
 */
const NATIONALITIES: Record<CountryCode, readonly string[]> = {
  JO: [
    "أردني", "فلسطيني", "سوري", "عراقي", "مصري", "لبناني", "سعودي", "يمني", "سوداني",
    "كويتي", "إماراتي", "بحريني", "قطري", "عماني", "مغربي", "جزائري", "تونسي", "ليبي", "موريتاني", "صومالي",
  ],
  SA: [
    "سعودي", "يمني", "مصري", "سوري", "أردني", "فلسطيني", "لبناني", "عراقي", "سوداني",
    "كويتي", "إماراتي", "بحريني", "قطري", "عماني", "مغربي", "جزائري", "تونسي", "ليبي", "موريتاني", "صومالي",
  ],
  LB: [
    "لبناني", "سوري", "فلسطيني", "أردني", "عراقي", "مصري", "سعودي", "يمني", "سوداني",
    "كويتي", "إماراتي", "بحريني", "قطري", "عماني", "مغربي", "جزائري", "تونسي", "ليبي", "موريتاني", "صومالي",
  ],
};

/** Default nationality in the person's own gender: «أردني/أردنية» (Jordan), «سعودي/سعودية» (Saudi Arabia) */
export function defaultNationality(gender: string | null | undefined, country: unknown): string {
  const w = countryConfig(country).words;
  return gender === "FEMALE" ? w.nationalityFemale : w.nationalityMale;
}

/** Nationality suggestions in the person's own gender, the member's country first */
export function nationalityOptions(gender: string | null | undefined, country: unknown): string[] {
  return NATIONALITIES[toCountry(country)].map((n) => nationalityLabel(n, gender) ?? n);
}

/** Label of the stored `tribe` field for a viewer of `country`: «العشيرة» / «القبيلة» */
export function tribeLabel(country: unknown): string {
  return countryConfig(country).words.tribe;
}

/**
 * Monthly income / expense ranges in the country's currency. Stored as shown, so the Jordanian
 * values must never change (existing rows keep them).
 */
const INCOME_RANGES: Record<CountryCode, readonly string[]> = {
  JO: ["أقل من 300 د.أ", "300-500 د.أ", "500-1000 د.أ", "1000-2000 د.أ", "أكثر من 2000 د.أ"],
  SA: ["أقل من 5,000 ر.س", "5,000-10,000 ر.س", "10,000-20,000 ر.س", "20,000-35,000 ر.س", "أكثر من 35,000 ر.س"],
  LB: ["أقل من 500 $", "500-1000 $", "1000-2000 $", "2000-4000 $", "أكثر من 4000 $"],
};
const EXPENSE_RANGES: Record<CountryCode, readonly string[]> = {
  JO: ["أقل من 300 د.أ", "300-500 د.أ", "500-800 د.أ", "أكثر من 800 د.أ"],
  SA: ["أقل من 3,000 ر.س", "3,000-6,000 ر.س", "6,000-10,000 ر.س", "10,000-15,000 ر.س", "أكثر من 15,000 ر.س"],
  LB: ["أقل من 300 $", "300-700 $", "700-1500 $", "أكثر من 1500 $"],
};

export function incomeRangesFor(country: unknown): readonly string[] {
  return INCOME_RANGES[toCountry(country)];
}

export function expenseRangesFor(country: unknown): readonly string[] {
  return EXPENSE_RANGES[toCountry(country)];
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
  const values: readonly string[] = field === "job" ? jobValuesFor(gender) : OPTION_VALUES[field];
  return values.map((value) => ({ value, label: selfLabel(field, value, gender) }));
}

/** Options for a partner preference, written about the partner (the other gender). */
export function partnerOptions(field: OptionField, myGender: string | null | undefined): Opt[] {
  const partner = oppositeGender(myGender);
  // A sect preference never offers «أفضّل عدم الذكر»
  const values: readonly string[] = field === "sect" ? PREF_SECT_VALUES : OPTION_VALUES[field];
  return values.map((value) => ({ value, label: describeOption(field, value, partner) }));
}
