/**
 * "لماذا هذا الاقتراح" — a one-line reason shown on suggestion cards.
 * Written from the viewer's side only: which of *their* preferences the other person meets.
 * Never mentions the other person's preferences.
 */
import {
  checkPreferenceMatchDetailed,
  cosineSimilarity,
  DEALBREAKER_LABELS,
  type DealbreakerKey,
  type UserForScoring,
} from "@/lib/matching/score";

const MAX_LABELS = 3;
const CLOSE_PERSONALITY = 0.75;

export function suggestionReason(viewer: UserForScoring, other: UserForScoring): string {
  const generic = "اقترحناه لتوافق ملفيكما بشكل عام";
  if (!viewer.profile || !other.profile) return generic;

  const labels = checkPreferenceMatchDetailed(viewer.profile, other.profile, other.gender)
    .details.filter((d) => d.matched)
    // "accept_children" always matches, so it says nothing about this person
    .filter((d) => d.field !== "children" || viewer.profile?.prefChildrenAcceptance === "no_children")
    .sort((a, b) => b.weight - a.weight)
    .slice(0, MAX_LABELS)
    .map((d) => DEALBREAKER_LABELS[d.field as DealbreakerKey])
    .filter(Boolean);

  const vecA = viewer.personalityResult?.vector;
  const vecB = other.personalityResult?.vector;
  const closePersonality = !!(vecA?.length && vecB?.length) && cosineSimilarity(vecA, vecB) >= CLOSE_PERSONALITY;

  const verb = other.gender === "MALE" ? "يوافق" : "توافق";
  const seek = viewer.gender === "FEMALE" ? "تبحثين" : "تبحث";

  if (labels.length > 0) {
    return `${verb} ما ${seek} عنه في ${labels.join(" و")}${closePersonality ? "، وشخصيتاكما متقاربة" : ""}`;
  }
  const sameCity = !!viewer.profile.city && viewer.profile.city === other.profile.city;
  if (sameCity) return `من المدينة نفسها${closePersonality ? "، وشخصيتاكما متقاربة" : ""}`;
  if (closePersonality) return "شخصيتاكما متقاربة حسب اختبار الشخصية";
  return generic;
}
