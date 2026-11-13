/**
 * The full sign-up setup's step map and required rule, driven by the edit field table (`EDIT_SECTIONS`).
 * Pure, db-free (client components import it). Spec: docs/superpowers/specs/2026-11-14-full-setup-design.md.
 *
 * Required: `required` in the table, or an own (non-`pref*`) `choice` / `yesNo` / `picker` field, and always only
 * while shown. `pref*` fields are optional except the age range. `false` and 0 are answers; a job left on
 * «أخرى» with no text typed is not.
 */
import { EDIT_SECTIONS, editField, type EditCtx, type EditField, type EditShowCtx } from "@/lib/profile-edit-fields";
import { isEmptyStored } from "@/lib/profile-edit-split";

export type SetupStepId = "you" | "faith" | "work" | "family" | "about" | "looking" | "musts";
export interface SetupStep { id: SetupStepId; title: string; fieldKeys: string[] }

const OTHER_JOB = "أخرى";
const OWN_REQUIRED_CONTROLS = new Set(["choice", "yesNo", "picker"]);

const PREF_KEYS = EDIT_SECTIONS.filter((s) => s.id === "prefs").flatMap((s) => s.fields.map((f) => f.key));

const STEPS: SetupStep[] = [
  { id: "you", title: "عنك", fieldKeys: ["dateOfBirth", "nationality", "city", "maritalStatus", "childrenCount", "height", "weight", "skinColor"] },
  { id: "faith", title: "الدين ونمط الحياة", fieldKeys: ["religion", "religiosity", "sect", "hijab", "beard", "smokingStatus", "cookingAbility", "lifestyle", "drivingLicense", "willingToRelocate"] },
  { id: "work", title: "التعليم والعمل", fieldKeys: ["education", "fieldOfStudy", "job", "incomeRange"] },
  { id: "family", title: "العائلة", fieldKeys: ["tribe", "familyOriginArea", "numberOfSiblings", "housingType", "monthlyExpenses", "healthConditions"] },
  { id: "about", title: "عنّي", fieldKeys: ["aboutMe", "partnerExpectations", "hobbies", "interests", "familyValues"] },
  { id: "looking", title: "من تبحث عنه", fieldKeys: PREF_KEYS },
  { id: "musts", title: "شروط أساسية", fieldKeys: [] },
];

/** 7 steps, or 6 without «شروط أساسية» (where the legacy shows no dealbreakers). Fresh copies. */
export function setupSteps(opts: { dealbreakers: boolean }): SetupStep[] {
  return STEPS.filter((s) => s.id !== "musts" || opts.dealbreakers).map((s) => ({ ...s, fieldKeys: [...s.fieldKeys] }));
}

/**
 * `field.showIf` reads `ctx.profile` (the values shown), so pass an `EditShowCtx` to get the shown-ness rules
 * (Christian, «المذهب», children count). A plain `EditCtx` reads an empty profile.
 * `ctx` may carry `profile` (the values shown) for the field's `showIf`; without it the profile is empty. */
export function setupRequired(field: EditField, ctx: EditCtx | EditShowCtx): boolean {
  const showCtx: EditShowCtx = { ...ctx, profile: "profile" in ctx ? ctx.profile : {} };
  if (field.showIf && !field.showIf(showCtx)) return false;
  if (field.required) return true;
  return !field.key.startsWith("pref") && OWN_REQUIRED_CONTROLS.has(field.control);
}

function answered(key: string, value: unknown): boolean {
  if (key === "job" && value === OTHER_JOB) return false;
  return !isEmptyStored(value);
}

/** Row keys on `step` that are required, shown and unanswered, in the step's order. */
export function missingOnStep(step: SetupStep, values: Record<string, unknown>, ctx: EditCtx): string[] {
  const showCtx: EditShowCtx = { ...ctx, profile: values };
  const missing: string[] = [];
  for (const key of step.fieldKeys) {
    const field = editField(key);
    if (!field || !setupRequired(field, showCtx)) continue;
    if (!answered(key, values[key])) missing.push(key);
    // a required range is whole: its `pref*` companions (prefAgeMax) too; `area` and `niqab` stay optional
    for (const companion of field.companions ?? []) {
      if (companion.startsWith("pref") && !answered(companion, values[companion])) missing.push(companion);
    }
  }
  return missing;
}

/** Index of the first step with a missing required field; the last step when none. */
export function firstIncompleteStep(steps: SetupStep[], values: Record<string, unknown>, ctx: EditCtx): number {
  const i = steps.findIndex((s) => missingOnStep(s, values, ctx).length > 0);
  return i === -1 ? steps.length - 1 : i;
}
