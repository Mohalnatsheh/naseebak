/**
 * The profile edit list's rules (`/dashboard/profile/edit`, behind `auth_profile_redesign`): each row's state,
 * how one «حفظ» splits into today's calls, and the one banner line after it. Pure, db-free (client).
 *
 * - Partner preferences (`pref*`) save directly, also while a review request is pending.
 * - An empty field is filled directly (`PUT /api/profile`, `buildFillBody`).
 * - A change to a stored value goes to review (`POST /api/profile/update-request`). While a request is
 *   pending, every other stored row is locked (the server allows one request at a time).
 * - «الحجاب» is stored as hijab + niqab: the two keys always share one state (`splitProfileEdit`).
 * - A field with a `storedDefault` («الديانة», «الديانة لدى الشريك») compares a stored null as that value: a stored
 *   null religion reads «مسلم», so choosing «مسيحي» is a change for review, never a fill.
 */
import { buildFillBody, isEmptyStored, splitProfileEdit } from "@/lib/profile-edit-split";
import { editField, rowKeyOf } from "@/lib/profile-edit-fields";
import { activeDealbreakers, type DealbreakerPrefs } from "@/lib/matching/dealbreaker-summary";
import type { DealbreakerKey } from "@/lib/matching/score";
import { MUSLIM_ONLY_FIELDS, dealbreakerPrefsFor, isChristian } from "@/lib/profile-religion";

export type RowState = "idle" | "fill" | "review" | "pending" | "locked";

/** Key in `SaveResult` lists for the «شروط أساسية» save */
export const DEALBREAKERS_KEY = "dealbreakers";

const VEIL_KEYS = ["hijab", "niqab"];
const isPref = (key: string) => key.startsWith("pref");
/** The stored keys that share one row state */
const stateGroup = (key: string) => (VEIL_KEYS.includes(key) ? VEIL_KEYS : [key]);

/** Whether a new value equals the stored one: empty = empty, lists in any order, "175" = 175, a date by its day. */
function sameAsStored(key: string, next: unknown, stored: unknown): boolean {
  const fallback = editField(key)?.storedDefault;
  if (fallback !== undefined) {
    next = isEmptyStored(next) ? fallback : next;
    stored = isEmptyStored(stored) ? fallback : stored;
  }
  if (isEmptyStored(next) || isEmptyStored(stored)) return isEmptyStored(next) && isEmptyStored(stored);
  if (Array.isArray(next) || Array.isArray(stored)) {
    if (!Array.isArray(next) || !Array.isArray(stored) || next.length !== stored.length) return false;
    const a = next.map(String).sort();
    const b = stored.map(String).sort();
    return a.every((v, i) => v === b[i]);
  }
  if (key === "dateOfBirth") return dayOf(next) === dayOf(stored);
  return String(next) === String(stored);
}

function dayOf(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

/** `changes` without the entries that equal the stored value (a row set back is not a change). */
function realChanges(changes: Record<string, unknown>, stored: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(changes)) {
    if (!sameAsStored(key, value, stored[key])) out[key] = value;
  }
  return out;
}

/**
 * One row's state. `pendingKeys`: the fields of the pending review request, null when none is pending.
 */
export function rowState(
  key: string,
  stored: Record<string, unknown>,
  changes: Record<string, unknown>,
  pendingKeys: string[] | null,
): RowState {
  const changed = realChanges(changes, stored);
  if (isPref(key)) return key in changed ? "fill" : "idle";
  const group = stateGroup(key);
  if (pendingKeys && group.some((k) => pendingKeys.includes(k))) return "pending";
  // A field with a `storedDefault` always holds an answer (a null religion is «مسلم»): changing it is a review
  if (pendingKeys && group.some((k) => !isEmptyStored(stored[k]) || editField(k)?.storedDefault !== undefined)) return "locked";
  if (!group.some((k) => k in changed)) return "idle";
  const { fills, reviewed } = splitProfileEdit(changed, stored);
  if (group.some((k) => k in reviewed)) return "review";
  if (group.some((k) => k in fills)) return "fill";
  return "idle";
}

export interface SavePlan {
  prefChanges: Record<string, unknown> | null;
  dealbreakerKeys: string[] | null;
  fillBody: Record<string, unknown> | null;
  reviewChanges: Record<string, unknown> | null;
  fillKeys: string[];
  reviewKeys: string[];
}

const orNull = (o: Record<string, unknown>) => (Object.keys(o).length > 0 ? o : null);

function sameKeys(a: string[], b: string[]): boolean {
  const sb = [...b].sort();
  return a.length === b.length && [...a].sort().every((v, i) => v === sb[i]);
}

/**
 * The changes a save may send: «الديانة» and «الديانة لدى الشريك» only while the switch is on, and never a
 * Muslim-only answer while the religion shown (`changes.religion`, else the stored one) is «مسيحي»: those rows are
 * hidden, and the server clears them when the change is approved. As the legacy edit page. Feed `planSave` with it.
 */
export function sendableChanges(
  changes: Record<string, unknown>,
  stored: Record<string, unknown>,
  religionEnabled: boolean,
): Record<string, unknown> {
  // While the switch is off the religion row is hidden, so only the stored one counts
  const religion = religionEnabled && "religion" in changes ? changes.religion : stored.religion;
  const christian = isChristian({ religion: religion as string | null | undefined });
  const muslimOnly: readonly string[] = MUSLIM_ONLY_FIELDS;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(changes)) {
    if (!religionEnabled && (key === "religion" || key === "prefReligion")) continue;
    if (christian && muslimOnly.includes(key)) continue;
    out[key] = value;
  }
  return out;
}

/**
 * The «شروط أساسية» keys a save sends (`planSave`'s `dealbreakers.next`): the ticked keys whose preference is
 * filled, read with the STORED religion (`dealbreakerPrefsFor`). A pending change to «مسيحي» must not drop the
 * Muslim-only keys before it is approved (approval's `muslimOnlyClears` removes them), as the legacy edit page.
 */
export function dealbreakerKeysToSave(
  ticked: Iterable<string>,
  prefs: DealbreakerPrefs,
  storedReligion: string | null | undefined,
  gender: string | null | undefined,
): DealbreakerKey[] {
  return activeDealbreakers(ticked, dealbreakerPrefsFor(storedReligion, prefs), gender);
}

/**
 * What one «حفظ» sends, and where. `changes`: pass them through `sendableChanges`. `dealbreakers.next`: the caller
 * builds it with `dealbreakerKeysToSave` (the STORED religion), never with the religion being changed to.
 */
export function planSave(
  changes: Record<string, unknown>,
  stored: Record<string, unknown>,
  dealbreakers?: { stored: string[]; next: string[] },
): SavePlan {
  const { fills, prefs, reviewed } = splitProfileEdit(realChanges(changes, stored), stored);
  // Resends the stored age range; `runSave` swaps in a new one only once the preferences saved
  const fillBody = Object.keys(fills).length > 0 ? buildFillBody(stored, fills) : null;
  // Profile not set up yet (no base for the fills): the review request carries them, as today's edit page does
  const review = fillBody ? reviewed : { ...reviewed, ...fills };
  return {
    prefChanges: orNull(prefs),
    dealbreakerKeys: dealbreakers && !sameKeys(dealbreakers.stored, dealbreakers.next) ? dealbreakers.next : null,
    fillBody,
    reviewChanges: orNull(review),
    fillKeys: fillBody ? Object.keys(fills) : [],
    reviewKeys: Object.keys(review),
  };
}

export interface SaveResult {
  saved: string[];
  sentForReview: string[];
  failed: string[];
  error?: string;
}

export interface SaveApi {
  postPrefs(prefs: Record<string, unknown>): Promise<Response>;
  putDealbreakers(keys: string[]): Promise<Response>;
  putProfile(body: Record<string, unknown>): Promise<Response>;
  postReview(changes: Record<string, unknown>, message?: string): Promise<Response>;
}

const PENDING_ERROR = "لديك طلب تعديل قيد المراجعة بالفعل.";
const SAVE_ERROR = "تعذّر الحفظ. يمكنك المحاولة مرة أخرى.";
const NETWORK_ERROR = "حدث خطأ في الاتصال. يمكنك المحاولة مرة أخرى.";

/** null when the call succeeded, else the message to show. */
async function callError(call: () => Promise<Response>): Promise<string | null> {
  let res: Response;
  try {
    res = await call();
  } catch {
    return NETWORK_ERROR;
  }
  if (res.ok) return null;
  const data = (await res.json().catch(() => ({}))) as { error?: unknown; code?: unknown };
  if (res.status === 409 && data.code === "REQUEST_PENDING") return PENDING_ERROR;
  return typeof data.error === "string" && data.error ? data.error : SAVE_ERROR;
}

/**
 * Runs a plan, in order: preferences alone (the server refuses a body mixing them with reviewed fields while a
 * request is pending, and applies them alone), «شروط أساسية», fills, then the review request. Each call stands on
 * its own: a failed one never undoes or skips the others. `error` is the first failure's message.
 */
export async function runSave(plan: SavePlan, api: SaveApi, message?: string): Promise<SaveResult> {
  const result: SaveResult = { saved: [], sentForReview: [], failed: [] };
  const step = async (keys: string[], call: () => Promise<Response>, onOk: string[]) => {
    const error = await callError(call);
    if (error === null) {
      onOk.push(...keys);
      return;
    }
    result.failed.push(...keys);
    result.error ??= error;
  };
  const { prefChanges, dealbreakerKeys, reviewChanges } = plan;
  let fillBody = plan.fillBody;
  if (prefChanges) {
    await step(Object.keys(prefChanges), () => api.postPrefs(prefChanges), result.saved);
    // The fill body resends the age range: once the new one is saved, send it (else the PUT writes the old one
    // back); when the preferences failed, keep the stored one so nothing reported failed gets saved
    if (fillBody && !result.failed.some((k) => k in prefChanges)) {
      for (const key of ["prefAgeMin", "prefAgeMax"]) if (key in prefChanges) fillBody = { ...fillBody, [key]: prefChanges[key] };
    }
  }
  if (dealbreakerKeys) await step([DEALBREAKERS_KEY], () => api.putDealbreakers(dealbreakerKeys), result.saved);
  if (fillBody) {
    const body = fillBody;
    await step(plan.fillKeys, () => api.putProfile(body), result.saved);
  }
  if (reviewChanges) await step(plan.reviewKeys, () => api.postReview(reviewChanges, message), result.sentForReview);
  return result;
}

/* ---------- The banner line ---------- */

interface Named {
  label: string;
  fem: boolean;
  reviewLabel?: string;
}

/** One entry per row (hijab + niqab name «الحجاب» once), in order. */
function named(keys: string[], labelOf: (key: string) => string): Named[] {
  const seen = new Set<string>();
  const out: Named[] = [];
  for (const key of keys) {
    const row = key === DEALBREAKERS_KEY ? key : rowKeyOf(key);
    if (seen.has(row)) continue;
    seen.add(row);
    if (row === DEALBREAKERS_KEY) {
      out.push({ label: "الشروط الأساسية", fem: true });
      continue;
    }
    const field = editField(row);
    out.push({ label: labelOf(row), fem: !!field?.fem, reviewLabel: field?.reviewLabel });
  }
  return out;
}

/** «أ، ب وج» */
function joinLabels(items: Named[]): string {
  const labels = items.map((n) => n.label);
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join("، ")} و${labels[labels.length - 1]}`;
}

/**
 * The one banner line after a save, e.g. «حُفظت الهوايات. نبذتك الجديدة أُرسلت للمراجعة، وستظهر بعد الموافقة.».
 * The verb agrees with the first label (Arabic verb before its subject).
 */
export function saveSummary(r: SaveResult, labelOf: (key: string) => string): string {
  const parts: string[] = [];
  const saved = named(r.saved, labelOf);
  if (saved.length > 0) parts.push(`${saved[0].fem ? "حُفظت" : "حُفظ"} ${joinLabels(saved)}.`);

  const review = named(r.sentForReview, labelOf);
  if (review.length === 1) {
    const [one] = review;
    const subject = one.reviewLabel ?? `${one.label} ${one.fem ? "الجديدة" : "الجديد"}`;
    parts.push(one.fem ? `${subject} أُرسلت للمراجعة، وستظهر بعد الموافقة.` : `${subject} أُرسل للمراجعة، وسيظهر بعد الموافقة.`);
  } else if (review.length > 1) {
    parts.push(`تعديلاتك على ${joinLabels(review)} أُرسلت للمراجعة، وستظهر بعد الموافقة.`);
  }

  const failed = named(r.failed, labelOf);
  if (failed.length > 0) {
    const reason = r.error ?? SAVE_ERROR;
    parts.push(`لم يُحفظ تعديل ${joinLabels(failed)}: ${/[.!؟]$/.test(reason) ? reason : `${reason}.`}`);
  } else if (r.error) {
    parts.push(r.error);
  }
  return parts.join(" ");
}
