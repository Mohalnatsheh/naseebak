import { z } from "zod/v4";
import { jordanPhoneRegex } from "./auth";

/** Marriage platform: members must be adults */
export const MIN_MEMBER_AGE = 18;
export const MAX_MEMBER_AGE = 80;

/** Full years between a YYYY-MM-DD (or ISO) birth date and `now`; null when the date is unreadable. */
export function ageFromDob(dob: string, now = new Date()): number | null {
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < d.getUTCMonth() || (now.getUTCMonth() === d.getUTCMonth() && now.getUTCDate() < d.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

/** Shared birth-date rule for the wizards and the API: null when fine, else the message to show. */
export function dateOfBirthError(dob: string, now = new Date()): string | null {
  const age = ageFromDob(dob, now);
  if (age === null) return "تاريخ الميلاد غير صالح";
  if (age < MIN_MEMBER_AGE) return `يجب أن يكون عمرك ${MIN_MEMBER_AGE} سنة على الأقل للتسجيل في نصيبك`;
  if (age > MAX_MEMBER_AGE) return "تاريخ الميلاد غير صالح";
  return null;
}

/** Latest birth date an adult can have today, for `<input type="date" max>` */
export function maxDateOfBirth(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear() - MIN_MEMBER_AGE, now.getUTCMonth(), now.getUTCDate()));
  return d.toISOString().slice(0, 10);
}

const dateOfBirthField = z.string().min(1, "تاريخ الميلاد مطلوب").superRefine((v, ctx) => {
  const err = dateOfBirthError(v);
  if (err) ctx.addIssue({ code: "custom", message: err });
});

/**
 * Profile save from the setup wizard. Short start: only the basics are required
 * (birth date, nationality, city, education, marital status, religiosity, partner age range);
 * everything else is optional and keeps its limits when given.
 */
export const profileSchema = z.object({
  dateOfBirth: dateOfBirthField,
  city: z.string().min(1, "المدينة مطلوبة"),
  nationality: z.string().min(1, "الجنسية مطلوبة"),
  education: z.string().min(1, "المستوى التعليمي مطلوب"),
  fieldOfStudy: z.string().optional(),
  job: z.string().optional(),
  incomeRange: z.string().optional(),
  height: z.number().min(100, "الطول يجب أن يكون 100 سم على الأقل").max(250, "الطول يجب أن يكون 250 سم كحد أقصى").optional(),
  weight: z.number().min(30, "الوزن يجب أن يكون 30 كغ على الأقل").max(300, "الوزن يجب أن يكون 300 كغ كحد أقصى").optional(),
  skinColor: z.string().optional(),
  childrenCount: z.number().min(0, "عدد الأبناء لا يمكن أن يكون سالباً").max(20, "عدد الأبناء يجب أن يكون 20 كحد أقصى").optional(),
  willingToRelocate: z.string().optional(),
  maritalStatus: z.string().min(1, "الحالة الاجتماعية مطلوبة"),
  religiosity: z.string().min(1, "مستوى التدين مطلوب"),
  familyValues: z.string().max(500, "الحد الأقصى 500 حرف").optional(),
  partnerExpectations: z.string().max(500, "الحد الأقصى 500 حرف").optional(),
  hobbies: z.string().optional(),
  interests: z.string().optional(),
  lifestyle: z.string().optional(),
  hijab: z.boolean().optional(),
  smokingStatus: z.string().optional(),
  aboutMe: z.string().max(500, "الحد الأقصى 500 حرف").optional(),
  area: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  tribe: z.string().optional(),
  familyOriginArea: z.string().optional(),
  numberOfSiblings: z.number().min(0, "عدد الإخوة لا يمكن أن يكون سالباً").max(20, "عدد الإخوة يجب أن يكون 20 كحد أقصى").optional(),
  housingType: z.string().optional(),
  beard: z.boolean().optional(),
  cookingAbility: z.string().optional(),
  drivingLicense: z.boolean().optional(),
  healthConditions: z.string().max(500, "الحد الأقصى 500 حرف").optional(),
  monthlyExpenses: z.string().optional(),
  wantsPhoto: z.boolean().optional(),
  profileImageUrl: z.string().optional(),
  prefAgeMin: z.number().min(18, "العمر الأدنى يجب أن يكون 18 على الأقل").max(70, "العمر الأدنى يجب أن يكون 70 كحد أقصى"),
  prefAgeMax: z.number().min(18, "العمر الأقصى يجب أن يكون 18 على الأقل").max(70, "العمر الأقصى يجب أن يكون 70 كحد أقصى"),
  prefCity: z.array(z.string()).optional(),
  prefEducation: z.array(z.string()).optional(),
  prefMaritalStatus: z.array(z.string()).optional(),
  prefHijab: z.string().optional(),
  prefBeard: z.string().optional(),
  prefReligiosity: z.array(z.string()).optional(),
  prefSmokingStatus: z.array(z.string()).optional(),
  prefChildrenAcceptance: z.string().optional(),
});

/**
 * Guardian contact: shown to the other family after a family introduction, so it must be a real
 * Arabic name and a reachable Jordanian mobile (any accepted format; normalise before storing).
 */
export const parentInfoSchema = z.object({
  parentName: z
    .string()
    .trim()
    .min(2, "اسم ولي الأمر مطلوب")
    .max(80, "اسم ولي الأمر طويل جداً")
    .regex(/^[\u0600-\u06FF\s]+$/, "يرجى كتابة اسم ولي الأمر باللغة العربية"),
  parentPhone: z
    .string()
    .transform((v) => v.replace(/[\s\-()]/g, ""))
    .pipe(z.string().regex(jordanPhoneRegex, "رقم هاتف ولي الأمر غير صالح. مثال: 0791234567")),
  relationship: z.enum(["father", "mother", "brother", "guardian"], { message: "صلة القرابة مطلوبة" }),
  address: z.string().trim().min(3, "العنوان مطلوب").max(300, "العنوان طويل جداً"),
  notes: z.string().max(500, "الحد الأقصى 500 حرف").optional().nullable(),
});

export const profileDraftSchema = z.object({
  setupStep: z.number().min(1).max(5).optional(),
  dateOfBirth: z
    .string()
    .optional()
    .superRefine((v, ctx) => {
      const err = v ? dateOfBirthError(v) : null;
      if (err) ctx.addIssue({ code: "custom", message: err });
    }),
  city: z.string().optional(),
  nationality: z.string().optional(),
  education: z.string().optional(),
  fieldOfStudy: z.string().optional(),
  job: z.string().optional(),
  incomeRange: z.string().optional(),
  height: z.number().min(100, "الطول يجب أن يكون 100 سم على الأقل").max(250, "الطول يجب أن يكون 250 سم كحد أقصى").optional(),
  weight: z.number().min(30, "الوزن يجب أن يكون 30 كغ على الأقل").max(300, "الوزن يجب أن يكون 300 كغ كحد أقصى").optional(),
  skinColor: z.string().optional(),
  childrenCount: z.number().min(0, "عدد الأبناء لا يمكن أن يكون سالباً").max(20, "عدد الأبناء يجب أن يكون 20 كحد أقصى").optional(),
  willingToRelocate: z.string().optional(),
  maritalStatus: z.string().optional(),
  religiosity: z.string().optional(),
  familyValues: z.string().max(500, "الحد الأقصى 500 حرف").optional(),
  partnerExpectations: z.string().max(500, "الحد الأقصى 500 حرف").optional(),
  hobbies: z.string().optional(),
  interests: z.string().optional(),
  lifestyle: z.string().optional(),
  hijab: z.boolean().optional(),
  smokingStatus: z.string().optional(),
  aboutMe: z.string().max(500, "الحد الأقصى 500 حرف").optional(),
  area: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  tribe: z.string().optional(),
  familyOriginArea: z.string().optional(),
  numberOfSiblings: z.number().min(0, "عدد الإخوة لا يمكن أن يكون سالباً").max(20, "عدد الإخوة يجب أن يكون 20 كحد أقصى").optional(),
  housingType: z.string().optional(),
  beard: z.boolean().optional(),
  cookingAbility: z.string().optional(),
  drivingLicense: z.boolean().optional(),
  healthConditions: z.string().max(500, "الحد الأقصى 500 حرف").optional(),
  monthlyExpenses: z.string().optional(),
  wantsPhoto: z.boolean().optional(),
  prefAgeMin: z.number().min(18, "العمر الأدنى يجب أن يكون 18 على الأقل").max(70, "العمر الأدنى يجب أن يكون 70 كحد أقصى").optional(),
  prefAgeMax: z.number().min(18, "العمر الأقصى يجب أن يكون 18 على الأقل").max(70, "العمر الأقصى يجب أن يكون 70 كحد أقصى").optional(),
  prefCity: z.array(z.string()).optional(),
  prefEducation: z.array(z.string()).optional(),
  prefMaritalStatus: z.array(z.string()).optional(),
  prefHijab: z.string().optional(),
  prefBeard: z.string().optional(),
  prefReligiosity: z.array(z.string()).optional(),
  prefSmokingStatus: z.array(z.string()).optional(),
  prefChildrenAcceptance: z.string().optional(),
});

export type ProfileInput = z.infer<typeof profileSchema>;
export type ParentInfoInput = z.infer<typeof parentInfoSchema>;
export type ProfileDraftInput = z.infer<typeof profileDraftSchema>;
