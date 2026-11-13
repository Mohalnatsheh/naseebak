import { applyNiqabRule } from "@/lib/profile-veil";
import { RELIGION_CHRISTIAN, muslimOnlyClears, stripMuslimOnlyForChristian } from "@/lib/profile-religion";

/**
 * Turns the `changes` of a ProfileUpdateRequest (sent by the user's profile edit form)
 * into Prisma `profile.update` data. Only fields the edit form can change are applied;
 * "" means "cleared" and becomes null (childrenCount → 0, it is not nullable).
 */

const STRING_FIELDS = [
  "city", "area", "nationality", "education", "fieldOfStudy", "job", "incomeRange",
  "maritalStatus", "religiosity", "smokingStatus", "sect", "aboutMe", "partnerExpectations",
  "hobbies", "interests", "lifestyle", "familyValues", "tribe", "familyOriginArea",
  "housingType", "monthlyExpenses", "healthConditions", "cookingAbility", "skinColor",
  "willingToRelocate", "prefHijab", "prefBeard", "prefChildrenAcceptance", "religion", "prefReligion",
] as const;

const INT_FIELDS = ["height", "weight", "numberOfSiblings", "childrenCount", "prefAgeMin", "prefAgeMax"] as const;
const FLOAT_FIELDS = ["latitude", "longitude"] as const;
const BOOL_FIELDS = ["hijab", "niqab", "beard", "drivingLicense", "wantsPhoto"] as const;
const ARRAY_FIELDS = [
  "prefCity", "prefEducation", "prefMaritalStatus", "prefReligiosity", "prefSmokingStatus", "prefSect",
] as const;

/** Non-nullable columns: the value used when the user cleared the field. */
const CLEARED_DEFAULTS: Record<string, unknown> = { childrenCount: 0 };

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "");
}

function cleared(key: string): unknown {
  return key in CLEARED_DEFAULTS ? CLEARED_DEFAULTS[key] : null;
}

export function buildProfileUpdate(
  rawChanges: Record<string, unknown>,
  current?: { religion?: string | null; dealbreakers?: string[] | null } | null,
): Record<string, unknown> {
  // Effective religion: the request's if it carries one, else the stored one; a Christian never gets a Muslim-only value
  const requested = rawChanges && "religion" in rawChanges ? rawChanges.religion : undefined;
  const effective = requested !== undefined ? (isEmpty(requested) ? null : String(requested)) : (current?.religion ?? null);
  const changes = stripMuslimOnlyForChristian(effective, rawChanges ?? {});
  const becomesChristian = effective === RELIGION_CHRISTIAN && requested !== undefined;
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(changes)) {
    if ((STRING_FIELDS as readonly string[]).includes(key)) {
      data[key] = isEmpty(value) ? null : String(value);
    } else if ((INT_FIELDS as readonly string[]).includes(key)) {
      const n = isEmpty(value) ? NaN : parseInt(String(value), 10);
      data[key] = Number.isFinite(n) ? n : cleared(key);
    } else if ((FLOAT_FIELDS as readonly string[]).includes(key)) {
      const n = isEmpty(value) ? NaN : parseFloat(String(value));
      data[key] = Number.isFinite(n) ? n : null;
    } else if ((BOOL_FIELDS as readonly string[]).includes(key)) {
      if (typeof value === "boolean") data[key] = value;
      else if (isEmpty(value)) data[key] = null;
    } else if ((ARRAY_FIELDS as readonly string[]).includes(key)) {
      data[key] = Array.isArray(value) ? value.filter((v) => typeof v === "string") : [];
    } else if (key === "dateOfBirth" && !isEmpty(value)) {
      // Required field: an empty value is ignored rather than wiping the birth date
      const d = new Date(String(value));
      if (!Number.isNaN(d.getTime())) data[key] = d;
    }
  }
  // niqab ⇒ hijab, no hijab ⇒ no niqab (a request from app 1.0.0 carries only hijab)
  const out = applyNiqabRule(data);
  // A switch to مسيحي clears the stored Muslim-only answers and conditions in the same write
  return becomesChristian ? { ...out, ...muslimOnlyClears(current?.dealbreakers) } : out;
}
