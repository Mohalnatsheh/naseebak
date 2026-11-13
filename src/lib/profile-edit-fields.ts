/**
 * The profile edit list (`/dashboard/profile/edit`, behind `auth_profile_redesign`): one row per field, grouped
 * in sections. Labels and options come from the shared option tables. Pure, db-free (client components import it).
 *
 * - `companions`: stored keys edited in the same row and saved with it (city → area, hijab → niqab,
 *   prefAgeMin → prefAgeMax).
 * - `yesNo` options carry "true" / "false"; the control stores the boolean.
 * - `hijab` is one question «الحجاب» with the three `VEIL_CHOICES`; the control maps a choice to
 *   hijab + niqab with `veilFromChoice`.
 * - `dealbreaker`: the «شرط أساسي» key of a preference (`DealbreakerKey`, `/api/profile/dealbreakers`).
 * - `fem`: the label is grammatically feminine (the save banner's «حُفظت» vs «حُفظ»).
 * - `reviewLabel`: how the save banner names a new value of this field sent for review, when
 *   «{label} الجديد/الجديدة» reads badly.
 */
import { countryConfig } from "@/lib/countries";
import { citiesFor } from "@/lib/countries/places";
import { EDUCATION_ORDER } from "@/lib/matching/score";
import type { DealbreakerKey } from "@/lib/matching/score";
import {
  HOUSING_TYPES,
  expenseRangesFor,
  incomeRangesFor,
  ownOptions,
  partnerOptions,
  skinColorOptions,
  tribeLabel,
  type Opt,
} from "@/lib/profile-options";
import { sectApplies } from "@/lib/profile-sect";
import { VEIL_CHOICES } from "@/lib/profile-veil";
import { PREF_AGE_MAX } from "@/lib/validations/profile";

type Gender = "MALE" | "FEMALE";

export type EditControl = "date" | "choice" | "multi" | "number" | "text" | "longText" | "picker" | "yesNo";

export interface EditField {
  key: string;
  /** The row's label. `country` only matters for the tribe label; default Jordan. */
  label: (gender: Gender, country?: string) => string;
  control: EditControl;
  options?: (ctx: { gender: Gender; country: string }) => Opt[];
  required?: boolean;
  showIf?: (ctx: { gender: Gender; country: string; profile: Record<string, unknown> }) => boolean;
  /** Unit shown next to a number («سم», the country's «كغ») */
  unit?: (country?: string) => string;
  /** Longest text, or the highest number */
  max?: number;
  /** Lowest number */
  min?: number;
  companions?: string[];
  /** «شرط أساسي» key (preferences only) */
  dealbreaker?: DealbreakerKey;
  fem?: boolean;
  reviewLabel?: string;
}

export interface EditSection {
  id: "basics" | "work" | "life" | "about" | "family" | "prefs";
  title: string;
  fields: EditField[];
}

const SINGLE = "أعزب/عزباء";
const LONG_TEXT_MAX = 500;
const SHORT_TEXT_MAX = 100;

const fixed = (text: string) => () => text;
const plain = (values: readonly string[]): Opt[] => values.map((value) => ({ value, label: value }));
const isLebanon = ({ country }: { country: string }) => sectApplies(country);
const isFemale = ({ gender }: { gender: Gender }) => gender === "FEMALE";
const isMale = ({ gender }: { gender: Gender }) => gender === "MALE";

const YES_NO: Opt[] = [{ value: "true", label: "نعم" }, { value: "false", label: "لا" }];
/** prefHijab / prefBeard / prefChildrenAcceptance store these words as they are */
const PREFERENCE_VALUES = ["نعم", "لا", "لا يهم"] as const;
/** prefHijab: «منتقبة» = wants niqab */
const HIJAB_PREF_VALUES = ["نعم", "منتقبة", "لا", "لا يهم"] as const;
const RELOCATE: Opt[] = [{ value: "yes", label: "نعم" }, { value: "no", label: "لا" }, { value: "maybe", label: "ربما" }];

export const EDIT_SECTIONS: EditSection[] = [
  {
    id: "basics",
    title: "البيانات الأساسية",
    fields: [
      { key: "dateOfBirth", label: fixed("تاريخ الميلاد"), control: "date", required: true },
      { key: "nationality", label: fixed("الجنسية"), control: "text", required: true, fem: true, max: SHORT_TEXT_MAX },
      {
        key: "city",
        label: fixed("المدينة"),
        control: "picker",
        required: true,
        fem: true,
        companions: ["area"],
        options: ({ country }) => plain(citiesFor(country)),
      },
      {
        key: "maritalStatus",
        label: fixed("الحالة الاجتماعية"),
        control: "choice",
        required: true,
        fem: true,
        options: ({ gender }) => ownOptions("maritalStatus", gender),
      },
      {
        key: "childrenCount",
        label: fixed("عدد الأبناء"),
        control: "number",
        required: true,
        min: 0,
        max: 20,
        showIf: ({ profile }) => profile.maritalStatus !== SINGLE,
      },
      {
        key: "religiosity",
        label: fixed("مستوى التدين"),
        control: "choice",
        required: true,
        options: ({ gender }) => ownOptions("religiosity", gender),
      },
      {
        key: "sect",
        label: fixed("المذهب"),
        control: "choice",
        required: true,
        showIf: isLebanon,
        options: ({ gender }) => ownOptions("sect", gender),
      },
    ],
  },
  {
    id: "work",
    title: "التعليم والعمل",
    fields: [
      { key: "education", label: fixed("المستوى التعليمي"), control: "choice", required: true, options: () => plain(EDUCATION_ORDER) },
      { key: "fieldOfStudy", label: fixed("التخصص"), control: "text", max: SHORT_TEXT_MAX },
      // «أخرى» opens a free-text box; the typed job is stored in `job` itself
      { key: "job", label: fixed("الوظيفة"), control: "picker", fem: true, max: SHORT_TEXT_MAX, options: ({ gender }) => ownOptions("job", gender) },
      { key: "incomeRange", label: fixed("مستوى الدخل"), control: "choice", options: ({ country }) => plain(incomeRangesFor(country)) },
    ],
  },
  {
    id: "life",
    title: "المظهر ونمط الحياة",
    fields: [
      { key: "height", label: fixed("الطول"), unit: fixed("سم"), control: "number", min: 100, max: 250 },
      { key: "weight", label: fixed("الوزن"), unit: (country) => countryConfig(country).words.kg, control: "number", min: 30, max: 300 },
      { key: "skinColor", label: fixed("لون البشرة"), control: "choice", options: ({ gender }) => skinColorOptions(gender) },
      {
        key: "hijab",
        label: fixed("الحجاب"),
        control: "choice",
        companions: ["niqab"],
        showIf: isFemale,
        options: () => plain(VEIL_CHOICES),
      },
      {
        key: "beard",
        label: fixed("اللحية"),
        control: "yesNo",
        fem: true,
        showIf: isMale,
        options: () => [{ value: "true", label: "ملتحٍ" }, { value: "false", label: "غير ملتحٍ" }],
      },
      { key: "smokingStatus", label: fixed("التدخين"), control: "choice", options: ({ gender }) => ownOptions("smokingStatus", gender) },
      { key: "cookingAbility", label: fixed("مهارة الطبخ"), control: "choice", fem: true, options: ({ gender }) => ownOptions("cookingAbility", gender) },
      { key: "lifestyle", label: fixed("نمط الحياة"), control: "choice", options: ({ gender }) => ownOptions("lifestyle", gender) },
      { key: "drivingLicense", label: fixed("رخصة القيادة"), control: "yesNo", fem: true, options: () => YES_NO },
      { key: "willingToRelocate", label: fixed("الاستعداد للانتقال"), control: "choice", options: () => RELOCATE },
    ],
  },
  {
    id: "about",
    title: "عنّي",
    fields: [
      { key: "aboutMe", label: fixed("نبذة عني"), control: "longText", fem: true, max: LONG_TEXT_MAX, reviewLabel: "نبذتك الجديدة" },
      { key: "partnerExpectations", label: fixed("مواصفات الشريك المطلوبة"), control: "longText", fem: true, max: LONG_TEXT_MAX },
      { key: "hobbies", label: fixed("الهوايات"), control: "longText", fem: true, max: LONG_TEXT_MAX },
      { key: "interests", label: fixed("الاهتمامات"), control: "longText", fem: true, max: LONG_TEXT_MAX },
      { key: "familyValues", label: fixed("القيم العائلية"), control: "longText", fem: true, max: LONG_TEXT_MAX },
    ],
  },
  {
    id: "family",
    title: "العائلة والسكن",
    fields: [
      { key: "tribe", label: (_g, country) => tribeLabel(country), control: "text", fem: true, max: SHORT_TEXT_MAX },
      { key: "familyOriginArea", label: fixed("منطقة أصل العائلة"), control: "text", fem: true, max: SHORT_TEXT_MAX },
      { key: "numberOfSiblings", label: fixed("عدد الإخوة والأخوات"), control: "number", min: 0, max: 20 },
      { key: "housingType", label: fixed("نوع السكن"), control: "choice", options: () => plain(HOUSING_TYPES) },
      { key: "monthlyExpenses", label: fixed("المصاريف الشهرية"), control: "choice", fem: true, options: ({ country }) => plain(expenseRangesFor(country)) },
      { key: "healthConditions", label: fixed("حالات صحية"), control: "longText", fem: true, max: LONG_TEXT_MAX },
    ],
  },
  {
    id: "prefs",
    title: "تفضيلات الشريك",
    fields: [
      {
        key: "prefAgeMin",
        label: fixed("العمر المفضل"),
        control: "number",
        required: true,
        min: 18,
        max: PREF_AGE_MAX,
        companions: ["prefAgeMax"],
        dealbreaker: "age",
      },
      { key: "prefCity", label: fixed("المدن المفضلة"), control: "multi", fem: true, dealbreaker: "city", options: ({ country }) => plain(citiesFor(country)) },
      { key: "prefEducation", label: fixed("المستوى التعليمي المفضل"), control: "multi", dealbreaker: "education", options: () => plain(EDUCATION_ORDER) },
      {
        key: "prefMaritalStatus",
        label: fixed("الحالة الاجتماعية المفضلة"),
        control: "multi",
        fem: true,
        dealbreaker: "maritalStatus",
        options: ({ gender }) => partnerOptions("maritalStatus", gender),
      },
      { key: "prefHijab", label: fixed("تفضيل الحجاب"), control: "choice", dealbreaker: "hijab", showIf: isMale, options: () => plain(HIJAB_PREF_VALUES) },
      { key: "prefBeard", label: fixed("تفضيل اللحية"), control: "choice", dealbreaker: "beard", showIf: isFemale, options: () => plain(PREFERENCE_VALUES) },
      {
        key: "prefReligiosity",
        label: fixed("مستوى التدين المفضل"),
        control: "multi",
        dealbreaker: "religiosity",
        options: ({ gender }) => partnerOptions("religiosity", gender),
      },
      {
        key: "prefSect",
        label: fixed("المذهب لدى الشريك"),
        control: "multi",
        dealbreaker: "sect",
        showIf: isLebanon,
        options: ({ gender }) => partnerOptions("sect", gender),
      },
      {
        key: "prefSmokingStatus",
        label: fixed("التدخين لدى الشريك"),
        control: "multi",
        dealbreaker: "smokingStatus",
        options: ({ gender }) => partnerOptions("smokingStatus", gender),
      },
      {
        key: "prefChildrenAcceptance",
        label: fixed("قبول وجود أبناء من زواج سابق"),
        control: "choice",
        dealbreaker: "children",
        options: () => plain(PREFERENCE_VALUES),
      },
    ],
  },
];

const BY_KEY = new Map<string, EditField>(EDIT_SECTIONS.flatMap((s) => s.fields.map((f) => [f.key, f] as const)));
const OWNER = new Map<string, string>(
  EDIT_SECTIONS.flatMap((s) => s.fields.flatMap((f) => (f.companions ?? []).map((c) => [c, f.key] as const))),
);

/** The row that edits `key` (a companion key gives its row's key). */
export function rowKeyOf(key: string): string {
  return OWNER.get(key) ?? key;
}

/** The field for a row key or a companion key; undefined for a key not in the list. */
export function editField(key: string): EditField | undefined {
  return BY_KEY.get(rowKeyOf(key));
}

/**
 * First field of each step of the old five-step edit wizard, for `?step=N` deep links.
 * Step 5 (the guardian) is not in the list.
 */
const OLD_STEP_FIRST_FIELD: Record<number, string | null> = {
  1: "dateOfBirth",
  2: "maritalStatus",
  3: "aboutMe",
  4: "tribe",
  5: null,
};

export function fieldForOldStep(step: number): string | null {
  return OLD_STEP_FIRST_FIELD[step] ?? null;
}
