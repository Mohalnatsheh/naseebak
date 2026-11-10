/**
 * One English line naming every invalid field of a failed zod parse, for admin API errors:
 * «Invalid: title (Too small: expected string to have >=1 characters); slug (Invalid string)».
 * Admin is English, so the member-facing Arabic schema messages are never shown here (ADM-16).
 */
export function invalidFields(issues: readonly { path: readonly PropertyKey[]; message: string }[]): string {
  if (issues.length === 0) return "Invalid data";
  const parts = issues.map((i) => {
    const field = i.path.map(String).join(".") || "body";
    // An Arabic message (shared member schemas) reads as noise in the English admin: name the field only
    return /[؀-ۿ]/.test(i.message) ? field : `${field} (${i.message})`;
  });
  return `Invalid: ${[...new Set(parts)].join("; ")}`;
}
