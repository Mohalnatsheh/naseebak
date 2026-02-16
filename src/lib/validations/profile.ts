import { z } from "zod/v4";

export const profileSchema = z.object({
  dateOfBirth: z.string().min(1, "تاريخ الميلاد مطلوب"),
  city: z.string().min(1, "المدينة مطلوبة"),
  nationality: z.string().min(1, "الجنسية مطلوبة"),
  education: z.string().min(1, "المستوى التعليمي مطلوب"),
  job: z.string().optional(),
  height: z.number().min(100).max(250).optional(),
  weight: z.number().min(30).max(300).optional(),
  skinColor: z.string().optional(),
  maritalStatus: z.string().min(1, "الحالة الاجتماعية مطلوبة"),
  religiosity: z.string().min(1, "مستوى التدين مطلوب"),
  hijab: z.boolean().optional(),
  smokingStatus: z.string().optional(),
  aboutMe: z.string().max(500, "الحد الأقصى 500 حرف").optional(),
  spousePrefs: z.string().max(500, "الحد الأقصى 500 حرف").optional(),
});

export const parentInfoSchema = z.object({
  parentName: z.string().min(2, "اسم ولي الأمر مطلوب"),
  parentPhone: z.string().min(10, "رقم الهاتف غير صالح"),
  relationship: z.enum(["father", "mother", "brother", "guardian"]),
  notes: z.string().optional(),
});

export type ProfileInput = z.infer<typeof profileSchema>;
export type ParentInfoInput = z.infer<typeof parentInfoSchema>;
