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

interface ProfileForScoring {
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
}

interface UserForScoring {
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
    details.push({ field: "education", label: "Education", matched: profile.prefEducation.includes(otherProfile.education), weight: 1, userPref: profile.prefEducation.join(", "), candidateValue: otherProfile.education });
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
  if (profile.prefHijab && otherGender === "FEMALE" && otherProfile.hijab !== null && otherProfile.hijab !== undefined) {
    const prefBool = profile.prefHijab === "yes";
    details.push({ field: "hijab", label: "Hijab", matched: otherProfile.hijab === prefBool, weight: 1, userPref: profile.prefHijab, candidateValue: otherProfile.hijab ? "yes" : "no" });
  }

  // Beard preference
  if (profile.prefBeard && otherGender === "MALE" && otherProfile.beard !== null && otherProfile.beard !== undefined) {
    const prefBool = profile.prefBeard === "yes";
    details.push({ field: "beard", label: "Beard", matched: otherProfile.beard === prefBool, weight: 1, userPref: profile.prefBeard, candidateValue: otherProfile.beard ? "yes" : "no" });
  }

  // Children acceptance
  if (profile.prefChildrenAcceptance && otherProfile.childrenCount !== undefined) {
    let matched: boolean;
    if (profile.prefChildrenAcceptance === "no_children") {
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
