/**
 * Edit page (`/dashboard/profile/edit`): which changed fields save where. Pure, db-free (client).
 * - `prefs`: partner preferences (`pref*`) → saved directly by `/api/profile/update-request`
 * - `fills`: fields still empty in the database → saved directly by `PUT /api/profile`
 *   (the server allows filling an empty field, see `reviewedChanges()` in profile-review.ts)
 * - `reviewed`: changes to a value already stored → admin review request
 */

/** Same rule as the server (`profile-review.ts`): null, "", or an empty list. `false`/`0` are answers. */
export function isEmptyStored(v: unknown): boolean {
  return v == null || v === "" || (Array.isArray(v) && v.length === 0);
}

export function splitProfileEdit(
  changes: Record<string, unknown>,
  stored: Record<string, unknown>,
): { fills: Record<string, unknown>; prefs: Record<string, unknown>; reviewed: Record<string, unknown> } {
  const fills: Record<string, unknown> = {};
  const prefs: Record<string, unknown> = {};
  const reviewed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(changes)) {
    if (key.startsWith("pref")) prefs[key] = value;
    else if (isEmptyStored(stored[key]) && !isEmptyStored(value)) fills[key] = value;
    else reviewed[key] = value;
  }
  return { fills, prefs, reviewed };
}

const NUMBER_FIELDS = new Set(["height", "weight", "childrenCount", "numberOfSiblings"]);

/**
 * Body for `PUT /api/profile` that fills empty fields: the stored required basics (unchanged, so the
 * server accepts them) plus the fills. Null when the stored profile lacks a basic (not set up yet).
 */
export function buildFillBody(stored: Record<string, unknown>, fills: Record<string, unknown>): Record<string, unknown> | null {
  const dob = stored.dateOfBirth;
  const dobDay = typeof dob === "string" ? dob.slice(0, 10) : dob instanceof Date ? dob.toISOString().slice(0, 10) : "";
  const base: Record<string, unknown> = {
    dateOfBirth: dobDay,
    city: stored.city,
    nationality: stored.nationality,
    education: stored.education,
    maritalStatus: stored.maritalStatus,
    religiosity: stored.religiosity,
    prefAgeMin: stored.prefAgeMin,
    prefAgeMax: stored.prefAgeMax,
  };
  if (Object.values(base).some((v) => isEmptyStored(v))) return null;
  const body: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(fills)) {
    if (NUMBER_FIELDS.has(key) && typeof value === "string") {
      const n = parseInt(value, 10);
      if (!Number.isFinite(n)) continue;
      body[key] = n;
    } else {
      body[key] = value;
    }
  }
  return body;
}
