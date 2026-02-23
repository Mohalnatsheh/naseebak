/**
 * Profile completeness calculator — field-level scoring with section weights.
 */

interface ProfileData {
  isComplete?: boolean;
  dateOfBirth?: string | Date | null;
  city?: string | null;
  area?: string | null;
  nationality?: string | null;
  education?: string | null;
  job?: string | null;
  height?: number | null;
  weight?: number | null;
  maritalStatus?: string | null;
  aboutMe?: string | null;
  prefAgeMin?: number | null;
  prefAgeMax?: number | null;
  prefCity?: string[] | null;
  prefEducation?: string[] | null;
  prefMaritalStatus?: string[] | null;
  prefReligiosity?: string[] | null;
  prefSmokingStatus?: string[] | null;
  tribe?: string | null;
  familyOriginArea?: string | null;
  numberOfSiblings?: number | null;
}

interface ParentInfoData {
  id?: string;
  parentName?: string;
}

interface IdentityDocData {
  status?: string;
}

interface PersonalityResultData {
  id?: string;
  personalityType?: string | null;
}

interface PhotoData {
  id: string;
}

export interface UserForCompleteness {
  profile?: ProfileData | null;
  parentInfo?: ParentInfoData | null;
  identityDoc?: IdentityDocData | null;
  personalityResult?: PersonalityResultData | null;
  photos?: PhotoData[] | null;
}

export interface CompletenessSection {
  key: string;
  label: string;
  percentage: number;
  weight: number;
  missingFields: string[];
  link: string;
}

export type StrengthLevel = "weak" | "good" | "strong" | "excellent";

export interface StrengthTip {
  message: string;  // Arabic tip
  impact: number;   // Weight % this would add
  link: string;     // Action link
  sectionKey: string;
}

export interface CompletenessResult {
  total: number; // 0-100
  sections: CompletenessSection[];
  level: StrengthLevel;
  tips: StrengthTip[];
}

function hasValue(val: unknown): boolean {
  if (val === null || val === undefined) return false;
  if (typeof val === "string") return val.trim().length > 0;
  if (Array.isArray(val)) return val.length > 0;
  return true;
}

export function calculateCompleteness(user: UserForCompleteness): CompletenessResult {
  const profile = user.profile;
  const profileLink = profile?.isComplete ? "/dashboard/profile/edit" : "/dashboard/profile/setup";

  // Section 1: Identity verification (15%)
  const identityApproved = user.identityDoc?.status === "APPROVED";
  const identitySection: CompletenessSection = {
    key: "identity",
    label: "التحقق من الهوية",
    percentage: identityApproved ? 100 : 0,
    weight: 15,
    missingFields: identityApproved ? [] : ["التحقق من الهوية"],
    link: "/dashboard/identity",
  };

  // Section 2: Basic info (30%)
  const basicFields: [string, unknown, string][] = [
    ["تاريخ الميلاد", profile?.dateOfBirth, "dateOfBirth"],
    ["المدينة", profile?.city, "city"],
    ["المنطقة", profile?.area, "area"],
    ["الجنسية", profile?.nationality, "nationality"],
    ["المستوى التعليمي", profile?.education, "education"],
    ["المهنة", profile?.job, "job"],
    ["الطول", profile?.height, "height"],
    ["الوزن", profile?.weight, "weight"],
    ["الحالة الاجتماعية", profile?.maritalStatus, "maritalStatus"],
    ["نبذة عني", profile?.aboutMe, "aboutMe"],
  ];
  const basicFilled = basicFields.filter(([, val]) => hasValue(val)).length;
  const basicMissing = basicFields
    .filter(([, val]) => !hasValue(val))
    .map(([label]) => label);
  const basicSection: CompletenessSection = {
    key: "basic",
    label: "المعلومات الأساسية",
    percentage: basicFields.length > 0 ? Math.round((basicFilled / basicFields.length) * 100) : 0,
    weight: 30,
    missingFields: basicMissing,
    link: profileLink,
  };

  // Section 3: Preferences (20%)
  const prefFields: [string, unknown, string][] = [
    ["العمر المفضل (الحد الأدنى)", profile?.prefAgeMin, "prefAgeMin"],
    ["العمر المفضل (الحد الأقصى)", profile?.prefAgeMax, "prefAgeMax"],
    ["المدينة المفضلة", profile?.prefCity, "prefCity"],
    ["المستوى التعليمي المفضل", profile?.prefEducation, "prefEducation"],
    ["الحالة الاجتماعية المفضلة", profile?.prefMaritalStatus, "prefMaritalStatus"],
    ["مستوى التدين المفضل", profile?.prefReligiosity, "prefReligiosity"],
    ["حالة التدخين المفضلة", profile?.prefSmokingStatus, "prefSmokingStatus"],
  ];
  const prefFilled = prefFields.filter(([, val]) => hasValue(val)).length;
  const prefMissing = prefFields
    .filter(([, val]) => !hasValue(val))
    .map(([label]) => label);
  const prefSection: CompletenessSection = {
    key: "preferences",
    label: "التفضيلات",
    percentage: prefFields.length > 0 ? Math.round((prefFilled / prefFields.length) * 100) : 0,
    weight: 20,
    missingFields: prefMissing,
    link: profileLink,
  };

  // Section 4: Personality quiz (15%)
  const hasQuiz = !!user.personalityResult;
  const quizSection: CompletenessSection = {
    key: "quiz",
    label: "اختبار الشخصية",
    percentage: hasQuiz ? 100 : 0,
    weight: 15,
    missingFields: hasQuiz ? [] : ["اختبار الشخصية"],
    link: "/dashboard/personality-quiz",
  };

  // Section 5: Photos (10%)
  const hasPhotos = (user.photos?.length ?? 0) > 0;
  const photosSection: CompletenessSection = {
    key: "photos",
    label: "الصور",
    percentage: hasPhotos ? 100 : 0,
    weight: 10,
    missingFields: hasPhotos ? [] : ["رفع صورة واحدة على الأقل"],
    link: "/dashboard/photos",
  };

  // Section 6: Family & Guardian (10%)
  const familyFields: [string, unknown, string][] = [
    ["القبيلة/العائلة", profile?.tribe, "tribe"],
    ["منطقة أصل العائلة", profile?.familyOriginArea, "familyOriginArea"],
    ["عدد الأخوة", profile?.numberOfSiblings, "numberOfSiblings"],
    ["معلومات ولي الأمر", user.parentInfo?.id, "parentInfo"],
  ];
  const familyFilled = familyFields.filter(([, val]) => hasValue(val)).length;
  const familyMissing = familyFields
    .filter(([, val]) => !hasValue(val))
    .map(([label]) => label);
  const familySection: CompletenessSection = {
    key: "family",
    label: "العائلة وولي الأمر",
    percentage: familyFields.length > 0 ? Math.round((familyFilled / familyFields.length) * 100) : 0,
    weight: 10,
    missingFields: familyMissing,
    link: profileLink,
  };

  const sections = [identitySection, basicSection, prefSection, quizSection, photosSection, familySection];

  // Weighted total
  const total = Math.round(
    sections.reduce((sum, s) => sum + (s.percentage / 100) * s.weight, 0)
  );

  const level = getLevel(total);
  const tips = generateTips(sections);

  return { total, sections, level, tips };
}

function getLevel(total: number): StrengthLevel {
  if (total >= 100) return "excellent";
  if (total >= 71) return "strong";
  if (total >= 41) return "good";
  return "weak";
}

const sectionTipMessages: Record<string, string> = {
  identity: "أكمل التحقق من هويتك لزيادة مصداقية ملفك",
  basic: "أضف معلوماتك الأساسية لتحسين فرص التوافق",
  preferences: "حدّد تفضيلاتك لتلقي اقتراحات أفضل",
  quiz: "أكمل اختبار الشخصية لتحسين دقة التوافق",
  photos: "أضف صورك لإكمال ملفك الشخصي",
  family: "أكمل معلومات العائلة وولي الأمر",
};

function generateTips(sections: CompletenessSection[]): StrengthTip[] {
  const tips: StrengthTip[] = [];

  for (const section of sections) {
    if (section.percentage < 100) {
      const missingWeight = Math.round(((100 - section.percentage) / 100) * section.weight);
      tips.push({
        message: sectionTipMessages[section.key] || `أكمل ${section.label}`,
        impact: missingWeight,
        link: section.link,
        sectionKey: section.key,
      });
    }
  }

  // Sort by impact descending, return top 3
  tips.sort((a, b) => b.impact - a.impact);
  return tips.slice(0, 3);
}
