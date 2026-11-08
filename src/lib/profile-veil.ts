/**
 * Hijab and niqab (women only). Pure, db-free: used by the profile write paths on the server and by
 * the website forms and cards.
 *
 * One question «الحجاب» with three answers: «محجبة» (hijab, no niqab), «منتقبة» (hijab + niqab),
 * «غير محجبة» (neither). Stored as `hijab` + `niqab` (Boolean?, null = not answered).
 */

export type VeilChoice = "محجبة" | "منتقبة" | "غير محجبة";

export const VEIL_CHOICES: readonly VeilChoice[] = ["محجبة", "منتقبة", "غير محجبة"];

/**
 * The invariant every write path applies to the fields it is about to store (a copy is returned):
 * - `niqab === true` ⇒ `hijab = true` (wins over a contradicting `hijab: false` in the same body);
 * - `hijab === false` ⇒ `niqab = false`;
 * - `hijab === null` (answer cleared) ⇒ `niqab = null`;
 * - a body without `niqab` otherwise leaves it out, so the stored value is never nulled by omission
 *   (app 1.0.0 only sends `hijab`).
 */
export function applyNiqabRule<T extends Record<string, unknown>>(data: T): T {
  const out: Record<string, unknown> = { ...data };
  if (out.niqab === true) out.hijab = true;
  else if (out.hijab === false) out.niqab = false;
  else if (out.hijab === null && out.niqab === undefined) out.niqab = null;
  return out as T;
}

/** The answer to show; null when hijab isn't answered. */
export function veilChoice(hijab: boolean | null | undefined, niqab: boolean | null | undefined): VeilChoice | null {
  if (niqab === true) return "منتقبة";
  if (hijab === true) return "محجبة";
  if (hijab === false) return "غير محجبة";
  return null;
}

/** Display label for «الحجاب»: «منتقبة» / «محجبة» / «غير محجبة», null when not answered. */
export const veilLabel = veilChoice;

export function veilFromChoice(choice: VeilChoice): { hijab: boolean; niqab: boolean } {
  if (choice === "منتقبة") return { hijab: true, niqab: true };
  if (choice === "محجبة") return { hijab: true, niqab: false };
  return { hijab: false, niqab: false };
}
