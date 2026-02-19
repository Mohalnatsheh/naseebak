/**
 * Matching algorithm — weighted compatibility scoring engine.
 *
 * Weights:
 *   Preference match: 50% (bidirectional)
 *   Personality similarity: 30% (cosine similarity on 5D vectors)
 *   Profile quality bonus: 20% (completeness of both profiles)
 */

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
  const checks: { met: boolean; weight: number }[] = [];

  // Age preference
  const otherAge = getAge(otherProfile.dateOfBirth);
  if ((profile.prefAgeMin || profile.prefAgeMax) && otherAge !== null) {
    const minOk = !profile.prefAgeMin || otherAge >= profile.prefAgeMin;
    const maxOk = !profile.prefAgeMax || otherAge <= profile.prefAgeMax;
    checks.push({ met: minOk && maxOk, weight: 2 });
  }

  // City preference
  if (profile.prefCity && profile.prefCity.length > 0 && otherProfile.city) {
    checks.push({ met: profile.prefCity.includes(otherProfile.city), weight: 1.5 });
  }

  // Education preference
  if (profile.prefEducation && profile.prefEducation.length > 0 && otherProfile.education) {
    checks.push({ met: profile.prefEducation.includes(otherProfile.education), weight: 1 });
  }

  // Marital status preference
  if (profile.prefMaritalStatus && profile.prefMaritalStatus.length > 0 && otherProfile.maritalStatus) {
    checks.push({ met: profile.prefMaritalStatus.includes(otherProfile.maritalStatus), weight: 1.5 });
  }

  // Religiosity preference
  if (profile.prefReligiosity && profile.prefReligiosity.length > 0 && otherProfile.religiosity) {
    checks.push({ met: profile.prefReligiosity.includes(otherProfile.religiosity), weight: 1 });
  }

  // Smoking preference
  if (profile.prefSmokingStatus && profile.prefSmokingStatus.length > 0 && otherProfile.smokingStatus) {
    checks.push({ met: profile.prefSmokingStatus.includes(otherProfile.smokingStatus), weight: 1 });
  }

  // Hijab preference (men preferring women's hijab)
  if (profile.prefHijab && otherGender === "FEMALE" && otherProfile.hijab !== null && otherProfile.hijab !== undefined) {
    const prefBool = profile.prefHijab === "yes";
    checks.push({ met: otherProfile.hijab === prefBool, weight: 1 });
  }

  // Beard preference (women preferring men's beard)
  if (profile.prefBeard && otherGender === "MALE" && otherProfile.beard !== null && otherProfile.beard !== undefined) {
    const prefBool = profile.prefBeard === "yes";
    checks.push({ met: otherProfile.beard === prefBool, weight: 1 });
  }

  // Children acceptance
  if (profile.prefChildrenAcceptance && otherProfile.childrenCount !== undefined) {
    if (profile.prefChildrenAcceptance === "no_children") {
      checks.push({ met: (otherProfile.childrenCount ?? 0) === 0, weight: 1.5 });
    } else if (profile.prefChildrenAcceptance === "accept_children") {
      checks.push({ met: true, weight: 1.5 });
    }
  }

  if (checks.length === 0) return 1; // No preferences set = full score

  const totalWeight = checks.reduce((sum, c) => sum + c.weight, 0);
  const metWeight = checks.filter((c) => c.met).reduce((sum, c) => sum + c.weight, 0);
  return metWeight / totalWeight;
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
  const profileA = userA.profile;
  const profileB = userB.profile;

  if (!profileA || !profileB) return 0;

  // 1. Preference match (50%) — bidirectional average
  const prefAtoB = checkPreferenceMatch(profileA, profileB, userB.gender);
  const prefBtoA = checkPreferenceMatch(profileB, profileA, userA.gender);
  const preferenceScore = (prefAtoB + prefBtoA) / 2;

  // 2. Personality similarity (30%)
  let personalityScore = 0.5; // Default if no quiz
  const vecA = userA.personalityResult?.vector;
  const vecB = userB.personalityResult?.vector;
  if (vecA && vecB && vecA.length > 0 && vecB.length > 0) {
    personalityScore = cosineSimilarity(vecA, vecB);
  }

  // 3. Profile quality (20%)
  const qualityA = profileQualityScore(userA);
  const qualityB = profileQualityScore(userB);
  const qualityScore = (qualityA + qualityB) / 2;

  // Weighted sum
  let finalScore: number;

  // If both have personality quiz, use normal weights
  if (vecA && vecB && vecA.length > 0 && vecB.length > 0) {
    finalScore = preferenceScore * 50 + personalityScore * 30 + qualityScore * 20;
  } else {
    // Redistribute personality weight to preferences
    finalScore = preferenceScore * 65 + qualityScore * 35;
  }

  return Math.round(Math.max(0, Math.min(100, finalScore)));
}
