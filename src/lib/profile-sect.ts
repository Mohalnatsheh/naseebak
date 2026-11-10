/**
 * «المذهب» (sect): asked of Lebanese members only. Db-free: client wizards import it.
 *
 * - The stored values never change.
 * - «أفضّل عدم الذكر» is a real answer, but it is never shown on a card (as if empty), never offered as a
 *   partner preference, scores as unknown and fails a sect «شرط أساسي» like a missing value.
 * - Other countries never store a sect, a sect preference or a sect «شرط أساسي» (`stripSectUnlessLebanon`).
 */
import { isCountryCode } from "@/lib/countries";

export const SECT_UNDISCLOSED = "أفضّل عدم الذكر";
export const SECT_VALUES = ["سني", "شيعي", SECT_UNDISCLOSED] as const;
/** What a partner preference may ask for: never «أفضّل عدم الذكر» */
export const PREF_SECT_VALUES = ["سني", "شيعي"] as const;

/** Whether a member of this country is asked «المذهب» (Lebanon only). */
export function sectApplies(country: unknown): boolean {
  return isCountryCode(country) && country === "LB";
}

/** The sect another member may see: null when empty or «أفضّل عدم الذكر». */
export function visibleSect(value: string | null | undefined): string | null {
  return !value || value === SECT_UNDISCLOSED ? null : value;
}

/**
 * Drops `sect`, `prefSect` and the "sect" dealbreaker from a profile write when the member isn't
 * Lebanese. A copy is returned; a Lebanese member's data comes back unchanged.
 */
export function stripSectUnlessLebanon<T>(country: unknown, data: T): T {
  if (sectApplies(country) || !data || typeof data !== "object" || Array.isArray(data)) return data;
  const copy = { ...(data as Record<string, unknown>) };
  delete copy.sect;
  delete copy.prefSect;
  if (Array.isArray(copy.dealbreakers)) copy.dealbreakers = copy.dealbreakers.filter((k) => k !== "sect");
  return copy as T;
}
