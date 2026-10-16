/**
 * Server rule for direct profile saves once the setup is finished: steps 1–4 fields are reviewed
 * edits (`/api/profile/update-request`), except filling in a field that is still empty.
 */

/** Nothing stored yet: null, "", or an empty list. `false` and `0` are real answers. */
function isEmptyValue(v: unknown): boolean {
  return v == null || v === "" || (Array.isArray(v) && v.length === 0);
}

function sameValue(stored: unknown, next: unknown): boolean {
  if (stored instanceof Date || next instanceof Date) {
    const a = stored instanceof Date ? stored : new Date(String(stored));
    const b = next instanceof Date ? next : new Date(String(next));
    if (isNaN(a.getTime()) || isNaN(b.getTime())) return false;
    // Birth date: compare the calendar day only
    return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
  }
  if (Array.isArray(stored) || Array.isArray(next)) {
    // Multi-select order doesn't matter
    const a = Array.isArray(stored) ? [...stored].map(String).sort() : [];
    const b = Array.isArray(next) ? [...next].map(String).sort() : [];
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  return stored === next;
}

/**
 * Rule for saves after the setup is finished (`profile.isComplete`):
 * - a field the save leaves out (`undefined`) is fine;
 * - a field that is still EMPTY in the database may be filled in directly (optional info added later);
 * - sending the SAME value again is fine (e.g. retrying the setup submit after the guardian step failed);
 * - changing or clearing a value that is already stored is a reviewed edit → 409, use the edit page
 *   (`/api/profile/update-request`).
 * Used by `PUT /api/profile` and `PATCH /api/profile/draft`.
 * Dealbreakers (`/api/profile/dealbreakers`) and guardian info (`/api/profile/parent-info`) have their
 * own routes and are not checked here. Returns the fields that would change.
 */
export function reviewedChanges(existing: Record<string, unknown>, next: Record<string, unknown>): string[] {
  const changed: string[] = [];
  for (const [key, value] of Object.entries(next)) {
    if (value === undefined) continue;
    const stored = existing[key];
    if (isEmptyValue(stored)) continue;
    if (!sameValue(stored, value)) changed.push(key);
  }
  return changed;
}

/** 409 body for a reviewed change sent to a direct-save route. */
export function needsReviewBody(fields: string[]) {
  return {
    error: "ملفك الشخصي مكتمل. لتعديل بياناتك استخدم صفحة تعديل الملف الشخصي، وتتم مراجعة التعديلات قبل اعتمادها.",
    code: "PROFILE_EDIT_NEEDS_REVIEW" as const,
    fields,
    editUrl: "/dashboard/profile/edit",
  };
}
