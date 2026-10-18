/**
 * Matching algorithm — weighted compatibility scoring engine.
 *
 * Weights:
 *   Preference match: 50% (bidirectional)
 *   Personality similarity: 30% (cosine similarity on 5D vectors)
 *   Profile quality bonus: 20% (completeness of both profiles)
 */

// --- Detailed breakdown types ---

export interface PreferenceDetail {
  field: string;
  label: string;
  matched: boolean;
  weight: number;
  userPref: string | null;
  candidateValue: string | null;
}

export interface QualityDetail {
  hasCompleteProfile: boolean;
  hasPhotos: boolean;
  hasQuiz: boolean;
  hasIdentityVerified: boolean;
}

export interface CompatibilityBreakdown {
  totalScore: number;
  preferenceScore: number;
  preferenceWeight: 50 | 65;
  preferenceDetails: {
    userToCandidate: PreferenceDetail[];
    candidateToUser: PreferenceDetail[];
  };
  personalityScore: number;
  personalityWeight: 30 | 0;
  hasPersonalityData: boolean;
  qualityScore: number;
  qualityWeight: 20 | 35;
  qualityUserDetail: QualityDetail;
  qualityCandidateDetail: QualityDetail;
}

// --- Core types ---

export interface ProfileForScoring {
  dateOfBirth?: Date | string | null;
  city?: string | null;
  education?: string | null;
  maritalStatus?: string | null;
  religiosity?: string | null;
  smokingStatus?: string | null;
  hijab?: boolean | null;
  beard?: boolean | null;
  childrenCount?: number;
  isComplete?: boolean;
  prefAgeMin?: number | null;
  prefAgeMax?: number | null;
  prefCity?: string[];
  prefEducation?: string[];
  prefMaritalStatus?: string[];
  prefReligiosity?: string[];
  prefSmokingStatus?: string[];
  prefHijab?: string | null;
  prefBeard?: string | null;
  prefChildrenAcceptance?: string | null;
  dealbreakers?: string[];
}

export interface UserForScoring {
  id: string;
  gender: string;
  profile?: ProfileForScoring | null;
  personalityResult?: { vector: number[] } | null;
  photos?: { id: string }[];
  identityDoc?: { status: string } | null;
}

/**
 * Cosine similarity between two vectors. Returns 0-1.
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length || vecA.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  // Cosine similarity is [-1, 1], normalize to [0, 1]
  return (dotProduct / denominator + 1) / 2;
}

/**
 * Calculate age from date of birth.
 */
/**
 * Yes/no preferences (prefHijab, prefBeard): the profile wizards store "نعم" / "لا" / "لا يهم",
 * older rows and tests use "yes" / "no". null = no preference.
 */
export function prefYesNo(v: string | null | undefined): "yes" | "no" | null {
  if (v === "yes" || v === "نعم") return "yes";
  if (v === "no" || v === "لا") return "no";
  return null;
}

/** prefChildrenAcceptance: "no_children" (older rows) or "لا" from the wizards. */
export function wantsNoChildren(v: string | null | undefined): boolean {
  return v === "no_children" || v === "لا";
}

function getAge(dob: Date | string | null | undefined): number | null {
  if (!dob) return null;
  const birthDate = typeof dob === "string" ? new Date(dob) : dob;
  const ageDiff = Date.now() - birthDate.getTime();
  return Math.floor(ageDiff / (365.25 * 24 * 60 * 60 * 1000));
}

/**
 * Check how well `otherProfile` matches `profile`'s preferences.
 * Returns 0-1 score. Missing preferences = full score for that dimension.
 */
export function checkPreferenceMatch(
  profile: ProfileForScoring,
  otherProfile: ProfileForScoring,
  otherGender: string
): number {
  return checkPreferenceMatchDetailed(profile, otherProfile, otherGender).score;
}

/**
 * Profile quality score for a single user. Returns 0-1.
 */
export function profileQualityScore(user: UserForScoring): number {
  let score = 0;
  let total = 0;

  // Profile complete
  total += 3;
  if (user.profile?.isComplete) score += 3;

  // Has photos
  total += 2;
  if (user.photos && user.photos.length > 0) score += 2;

  // Has quiz
  total += 3;
  if (user.personalityResult) score += 3;

  // Identity verified
  total += 2;
  if (user.identityDoc?.status === "APPROVED") score += 2;

  return total > 0 ? score / total : 0;
}

/**
 * Calculate overall compatibility between two users.
 * Returns 0-100 score.
 */
export function calculateCompatibility(userA: UserForScoring, userB: UserForScoring): number {
  return calculateCompatibilityDetailed(userA, userB).totalScore;
}

// --- Detailed breakdown functions ---

/**
 * Same logic as checkPreferenceMatch but captures per-field details.
 */
export function checkPreferenceMatchDetailed(
  profile: ProfileForScoring,
  otherProfile: ProfileForScoring,
  otherGender: string
): { score: number; details: PreferenceDetail[] } {
  const details: PreferenceDetail[] = [];

  // Age preference
  const otherAge = getAge(otherProfile.dateOfBirth);
  if ((profile.prefAgeMin || profile.prefAgeMax) && otherAge !== null) {
    const minOk = !profile.prefAgeMin || otherAge >= profile.prefAgeMin;
    const maxOk = !profile.prefAgeMax || otherAge <= profile.prefAgeMax;
    const prefStr = `${profile.prefAgeMin ?? "—"}–${profile.prefAgeMax ?? "—"}`;
    details.push({ field: "age", label: "Age", matched: minOk && maxOk, weight: 2, userPref: prefStr, candidateValue: String(otherAge) });
  }

  // City preference
  if (profile.prefCity && profile.prefCity.length > 0 && otherProfile.city) {
    details.push({ field: "city", label: "City", matched: profile.prefCity.includes(otherProfile.city), weight: 1.5, userPref: profile.prefCity.join(", "), candidateValue: otherProfile.city });
  }

  // Education preference
  if (profile.prefEducation && profile.prefEducation.length > 0 && otherProfile.education) {
    details.push({ field: "education", label: "Education", matched: educationMatches(profile.prefEducation, otherProfile.education) === true, weight: 1, userPref: profile.prefEducation.join(", "), candidateValue: otherProfile.education });
  }

  // Marital status preference
  if (profile.prefMaritalStatus && profile.prefMaritalStatus.length > 0 && otherProfile.maritalStatus) {
    details.push({ field: "maritalStatus", label: "Marital Status", matched: profile.prefMaritalStatus.includes(otherProfile.maritalStatus), weight: 1.5, userPref: profile.prefMaritalStatus.join(", "), candidateValue: otherProfile.maritalStatus });
  }

  // Religiosity preference
  if (profile.prefReligiosity && profile.prefReligiosity.length > 0 && otherProfile.religiosity) {
    details.push({ field: "religiosity", label: "Religiosity", matched: profile.prefReligiosity.includes(otherProfile.religiosity), weight: 1, userPref: profile.prefReligiosity.join(", "), candidateValue: otherProfile.religiosity });
  }

  // Smoking preference
  if (profile.prefSmokingStatus && profile.prefSmokingStatus.length > 0 && otherProfile.smokingStatus) {
    details.push({ field: "smokingStatus", label: "Smoking", matched: profile.prefSmokingStatus.includes(otherProfile.smokingStatus), weight: 1, userPref: profile.prefSmokingStatus.join(", "), candidateValue: otherProfile.smokingStatus });
  }

  // Hijab preference
  const hijabPref = prefYesNo(profile.prefHijab);
  if (hijabPref && otherGender === "FEMALE" && otherProfile.hijab !== null && otherProfile.hijab !== undefined) {
    const prefBool = hijabPref === "yes";
    details.push({ field: "hijab", label: "Hijab", matched: otherProfile.hijab === prefBool, weight: 1, userPref: profile.prefHijab ?? null, candidateValue: otherProfile.hijab ? "yes" : "no" });
  }

  // Beard preference
  const beardPref = prefYesNo(profile.prefBeard);
  if (beardPref && otherGender === "MALE" && otherProfile.beard !== null && otherProfile.beard !== undefined) {
    const prefBool = beardPref === "yes";
    details.push({ field: "beard", label: "Beard", matched: otherProfile.beard === prefBool, weight: 1, userPref: profile.prefBeard ?? null, candidateValue: otherProfile.beard ? "yes" : "no" });
  }

  // Children acceptance
  if (profile.prefChildrenAcceptance && otherProfile.childrenCount !== undefined) {
    let matched: boolean;
    if (wantsNoChildren(profile.prefChildrenAcceptance)) {
      matched = (otherProfile.childrenCount ?? 0) === 0;
    } else {
      matched = true; // accept_children
    }
    details.push({ field: "children", label: "Children", matched, weight: 1.5, userPref: profile.prefChildrenAcceptance, candidateValue: String(otherProfile.childrenCount ?? 0) });
  }

  if (details.length === 0) return { score: 1, details };

  const totalWeight = details.reduce((sum, d) => sum + d.weight, 0);
  const metWeight = details.filter((d) => d.matched).reduce((sum, d) => sum + d.weight, 0);
  return { score: metWeight / totalWeight, details };
}

/**
 * Extract quality detail booleans for a user.
 */
export function profileQualityDetail(user: UserForScoring): QualityDetail {
  return {
    hasCompleteProfile: !!user.profile?.isComplete,
    hasPhotos: !!(user.photos && user.photos.length > 0),
    hasQuiz: !!user.personalityResult,
    hasIdentityVerified: user.identityDoc?.status === "APPROVED",
  };
}

/**
 * Full compatibility breakdown between two users.
 * Same algorithm as calculateCompatibility but returns detailed info.
 */
export function calculateCompatibilityDetailed(
  userA: UserForScoring,
  userB: UserForScoring
): CompatibilityBreakdown {
  const profileA = userA.profile;
  const profileB = userB.profile;

  if (!profileA || !profileB) {
    return {
      totalScore: 0,
      preferenceScore: 0, preferenceWeight: 50,
      preferenceDetails: { userToCandidate: [], candidateToUser: [] },
      personalityScore: 0, personalityWeight: 30, hasPersonalityData: false,
      qualityScore: 0, qualityWeight: 20,
      qualityUserDetail: profileQualityDetail(userA),
      qualityCandidateDetail: profileQualityDetail(userB),
    };
  }

  // 1. Preference match — bidirectional with details
  const prefAtoB = checkPreferenceMatchDetailed(profileA, profileB, userB.gender);
  const prefBtoA = checkPreferenceMatchDetailed(profileB, profileA, userA.gender);
  const preferenceScore = (prefAtoB.score + prefBtoA.score) / 2;

  // 2. Personality similarity
  let personalityScore = 0.5;
  const vecA = userA.personalityResult?.vector;
  const vecB = userB.personalityResult?.vector;
  const hasPersonalityData = !!(vecA && vecB && vecA.length > 0 && vecB.length > 0);
  if (hasPersonalityData) {
    personalityScore = cosineSimilarity(vecA!, vecB!);
  }

  // 3. Profile quality
  const qualityUserDetail = profileQualityDetail(userA);
  const qualityCandidateDetail = profileQualityDetail(userB);
  const qualityA = profileQualityScore(userA);
  const qualityB = profileQualityScore(userB);
  const qualityScore = (qualityA + qualityB) / 2;

  // Weighted sum
  let totalScore: number;
  let preferenceWeight: 50 | 65;
  let personalityWeight: 30 | 0;
  let qualityWeight: 20 | 35;

  if (hasPersonalityData) {
    preferenceWeight = 50;
    personalityWeight = 30;
    qualityWeight = 20;
    totalScore = preferenceScore * 50 + personalityScore * 30 + qualityScore * 20;
  } else {
    preferenceWeight = 65;
    personalityWeight = 0;
    qualityWeight = 35;
    totalScore = preferenceScore * 65 + qualityScore * 35;
  }

  return {
    totalScore: Math.round(Math.max(0, Math.min(100, totalScore))),
    preferenceScore,
    preferenceWeight,
    preferenceDetails: {
      userToCandidate: prefAtoB.details,
      candidateToUser: prefBtoA.details,
    },
    personalityScore,
    personalityWeight,
    hasPersonalityData,
    qualityScore,
    qualityWeight,
    qualityUserDetail,
    qualityCandidateDetail,
  };
}

// --- Education: a preferred level means "this level or higher" ---

/** Education levels, lowest first (the values the wizards store) */
export const EDUCATION_ORDER = ["ثانوية عامة", "دبلوم", "بكالوريوس", "ماجستير", "دكتوراه"] as const;

/**
 * Does `value` meet an education preference? The lowest level picked counts as a minimum, so "دبلوم"
 * also accepts a bachelor's or higher (owner decision 2026-10-18: people picked their own level
 * meaning "at least"). null = no preference. Unknown values fall back to an exact match.
 */
export function educationMatches(pref: readonly string[] | null | undefined, value: string | null | undefined): boolean | null {
  if (!pref || pref.length === 0) return null;
  if (!value) return false;
  if (pref.includes(value)) return true;
  const rank = (v: string) => (EDUCATION_ORDER as readonly string[]).indexOf(v);
  const ranks = pref.map(rank).filter((i) => i >= 0);
  return ranks.length > 0 && rank(value) >= Math.min(...ranks);
}

/** The lowest education level picked, when every pick is a known level (for "دبلوم فأعلى" wording). */
export function minEducation(pref: readonly string[] | null | undefined): string | null {
  if (!pref || pref.length === 0) return null;
  const ranks = pref.map((v) => (EDUCATION_ORDER as readonly string[]).indexOf(v));
  if (ranks.some((i) => i < 0)) return null;
  return EDUCATION_ORDER[Math.min(...ranks)];
}

// --- Dealbreakers (hard filters, simultaneous suggestions flow) ---

/** Preference keys a user can mark as "شرط أساسي". */
export const DEALBREAKER_KEYS = [
  "age", "city", "education", "maritalStatus", "religiosity", "smokingStatus", "hijab", "beard", "children",
] as const;
export type DealbreakerKey = (typeof DEALBREAKER_KEYS)[number];

export const DEALBREAKER_LABELS: Record<DealbreakerKey, string> = {
  age: "العمر",
  city: "المدينة",
  education: "التعليم",
  maritalStatus: "الحالة الاجتماعية",
  religiosity: "التدين",
  smokingStatus: "التدخين",
  hijab: "الحجاب",
  beard: "اللحية",
  children: "الأبناء",
};

const inList = (pref: string[] | undefined, value: string | null | undefined) =>
  !pref || pref.length === 0 ? null : !!value && pref.includes(value);

/**
 * Whether one dealbreaker of `owner` holds for `other`.
 * null = the preference isn't filled in (or doesn't apply to that gender), so it can't be a hard filter.
 * A missing value on `other` fails: someone who asked for "non-smoker only" must not get "unknown".
 */
function dealbreakerHolds(key: DealbreakerKey, owner: ProfileForScoring, other: ProfileForScoring, otherGender: string): boolean | null {
  switch (key) {
    case "age": {
      if (!owner.prefAgeMin && !owner.prefAgeMax) return null;
      const age = getAge(other.dateOfBirth);
      if (age === null) return false;
      return (!owner.prefAgeMin || age >= owner.prefAgeMin) && (!owner.prefAgeMax || age <= owner.prefAgeMax);
    }
    case "city": return inList(owner.prefCity, other.city);
    case "education": return educationMatches(owner.prefEducation, other.education);
    case "maritalStatus": return inList(owner.prefMaritalStatus, other.maritalStatus);
    case "religiosity": return inList(owner.prefReligiosity, other.religiosity);
    case "smokingStatus": return inList(owner.prefSmokingStatus, other.smokingStatus);
    case "hijab":
      if (!prefYesNo(owner.prefHijab) || otherGender !== "FEMALE") return null;
      return other.hijab === null || other.hijab === undefined ? false : other.hijab === (prefYesNo(owner.prefHijab) === "yes");
    case "beard":
      if (!prefYesNo(owner.prefBeard) || otherGender !== "MALE") return null;
      return other.beard === null || other.beard === undefined ? false : other.beard === (prefYesNo(owner.prefBeard) === "yes");
    case "children":
      if (!wantsNoChildren(owner.prefChildrenAcceptance)) return null;
      return (other.childrenCount ?? 0) === 0;
  }
}

/** True when `other` meets every preference `owner` marked as a dealbreaker. */
export function passesDealbreakers(owner: ProfileForScoring, other: ProfileForScoring, otherGender: string): boolean {
  const keys = (owner.dealbreakers ?? []).filter((k): k is DealbreakerKey =>
    (DEALBREAKER_KEYS as readonly string[]).includes(k)
  );
  return keys.every((k) => dealbreakerHolds(k, owner, other, otherGender) !== false);
}

/** A pair may be suggested only when each passes the other's dealbreakers. */
export function mutuallyAcceptable(a: UserForScoring, b: UserForScoring): boolean {
  if (!a.profile || !b.profile) return false;
  return passesDealbreakers(a.profile, b.profile, b.gender) && passesDealbreakers(b.profile, a.profile, a.gender);
}
