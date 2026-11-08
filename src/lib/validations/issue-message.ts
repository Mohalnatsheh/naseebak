/**
 * Arabic error text for member-facing validation failures. Our schemas give most rules an Arabic
 * message, but Zod's own defaults ("Invalid input: expected number, received undefined") reached
 * members when a field was missing or of the wrong type. Db-free.
 */

/** Fields as members see them (sign-up, the wizards, the edit page, the guardian form). */
const FIELD_LABELS: Record<string, string> = {
  firstName: "الاسم الأول",
  lastName: "اسم العائلة",
  phone: "رقم الجوال",
  gender: "الجنس",
  parentName: "اسم ولي الأمر",
  parentPhone: "رقم جوال ولي الأمر",
  relationship: "صلة القرابة",
  address: "العنوان",
  notes: "الملاحظات",
  dateOfBirth: "تاريخ الميلاد",
  city: "المدينة",
  nationality: "الجنسية",
  education: "المستوى التعليمي",
  fieldOfStudy: "التخصص",
  job: "الوظيفة",
  incomeRange: "الدخل الشهري",
  height: "الطول",
  weight: "الوزن",
  skinColor: "لون البشرة",
  childrenCount: "عدد الأبناء",
  willingToRelocate: "الاستعداد للانتقال",
  maritalStatus: "الحالة الاجتماعية",
  religiosity: "مستوى التدين",
  familyValues: "القيم العائلية",
  partnerExpectations: "توقعاتك من الشريك",
  hobbies: "الهوايات",
  interests: "الاهتمامات",
  lifestyle: "نمط الحياة",
  hijab: "الحجاب",
  smokingStatus: "التدخين",
  aboutMe: "نبذة عني",
  area: "المنطقة",
  tribe: "العائلة أو القبيلة",
  familyOriginArea: "منطقة أصل العائلة",
  numberOfSiblings: "عدد الإخوة",
  housingType: "نوع السكن",
  beard: "اللحية",
  cookingAbility: "مهارة الطبخ",
  drivingLicense: "رخصة القيادة",
  healthConditions: "الحالات الصحية",
  monthlyExpenses: "المصاريف الشهرية",
  prefAgeMin: "العمر الأدنى للشريك",
  prefAgeMax: "العمر الأقصى للشريك",
  prefCity: "مدينة الشريك",
  prefEducation: "تعليم الشريك",
  prefMaritalStatus: "الحالة الاجتماعية للشريك",
  prefHijab: "حجاب الشريكة",
  prefBeard: "لحية الشريك",
  prefReligiosity: "تدين الشريك",
  prefSmokingStatus: "تدخين الشريك",
  prefChildrenAcceptance: "قبول الأبناء",
  message: "الملاحظة",
};

const GENERIC = "بيانات غير صالحة، يرجى المراجعة والمحاولة مرة أخرى";

type Issue = { message: string; path: readonly PropertyKey[]; code?: string };

/** The schema's own Arabic message, or an Arabic line naming the field when Zod's English default would show. */
export function arabicIssueMessage(issue: Issue | undefined): string {
  if (!issue) return GENERIC;
  // Our own messages are Arabic; Zod's defaults are English
  if (issue.message && /[؀-ۿ]/.test(issue.message)) return issue.message;
  const field = [...issue.path].reverse().find((p): p is string => typeof p === "string" && p in FIELD_LABELS);
  if (!field) return GENERIC;
  const label = FIELD_LABELS[field];
  if (/received undefined/.test(issue.message)) return `يرجى إدخال «${label}»`;
  return `يرجى التحقق من قيمة «${label}»`;
}
