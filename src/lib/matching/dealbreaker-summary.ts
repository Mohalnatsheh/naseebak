/**
 * "شرط أساسي" helpers shared by the suggestions panel and the profile wizards:
 * which preferences can be a dealbreaker and how to say them in words.
 */
import { DEALBREAKER_KEYS, EDUCATION_ORDER, minEducation, prefYesNo, wantsNoChildren, type DealbreakerKey } from "@/lib/matching/score";
import { describeOption, oppositeGender, type OptionField } from "@/lib/profile-options";

export interface DealbreakerPrefs {
  prefAgeMin?: number | string | null;
  prefAgeMax?: number | string | null;
  prefCity?: string[] | null;
  prefEducation?: string[] | null;
  prefMaritalStatus?: string[] | null;
  prefReligiosity?: string[] | null;
  prefSmokingStatus?: string[] | null;
  prefHijab?: string | null;
  prefBeard?: string | null;
  prefChildrenAcceptance?: string | null;
}

/**
 * What the user asked for, in words; null when that preference isn't filled in
 * (or can't apply to the partner's gender), so it can't be a dealbreaker.
 */
export function dealbreakerSummary(key: DealbreakerKey, p: DealbreakerPrefs, myGender?: string | null): string | null {
  const partner = oppositeGender(myGender);
  const list = (v: string[] | null | undefined, field?: OptionField) =>
    v && v.length > 0 ? v.map((x) => (field ? describeOption(field, x, partner) : x)).join("، ") : null;
  switch (key) {
    case "age":
      return p.prefAgeMin || p.prefAgeMax ? `${p.prefAgeMin || "—"} – ${p.prefAgeMax || "—"} سنة` : null;
    case "city": return list(p.prefCity);
    case "education": {
      // A level means "this level or higher" (educationMatches)
      const min = minEducation(p.prefEducation);
      if (!min) return list(p.prefEducation);
      return min === EDUCATION_ORDER[EDUCATION_ORDER.length - 1] ? min : `${min} فأعلى`;
    }
    case "maritalStatus": return list(p.prefMaritalStatus, "maritalStatus");
    case "religiosity": return list(p.prefReligiosity, "religiosity");
    case "smokingStatus": return list(p.prefSmokingStatus, "smokingStatus");
    case "hijab": {
      if (myGender && partner !== "FEMALE") return null;
      const v = prefYesNo(p.prefHijab);
      return v ? (v === "yes" ? "محجبة" : "غير محجبة") : null;
    }
    case "beard": {
      if (myGender && partner !== "MALE") return null;
      const v = prefYesNo(p.prefBeard);
      return v ? (v === "yes" ? "ملتحٍ" : "بدون لحية") : null;
    }
    case "children": return wantsNoChildren(p.prefChildrenAcceptance) ? "بدون أبناء" : null;
  }
}

/** The ticked keys that can actually work as a filter (their preference is filled in). */
export function activeDealbreakers(keys: Iterable<string>, p: DealbreakerPrefs, myGender?: string | null): DealbreakerKey[] {
  const ticked = new Set(keys);
  return DEALBREAKER_KEYS.filter((k) => ticked.has(k) && dealbreakerSummary(k, p, myGender) !== null);
}
