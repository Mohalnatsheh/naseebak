/**
 * «الديانة» (religion). Db-free: client wizards import it.
 *
 * - Stored values never change. A null religion reads «مسلم», a null preference reads «نفس ديانتي».
 * - Muslim-only questions (hijab, niqab, beard, sect and their preferences) are never asked of, stored for or
 *   shown for a Christian.
 * - A mixed pair is allowed only when both chose «لا مانع» (`religionsMatch`), whatever the switch says.
 */
import { sectApplies, visibleSect } from "@/lib/profile-sect";

export const RELIGION_MUSLIM = "مسلم";
export const RELIGION_CHRISTIAN = "مسيحي";
export const RELIGION_VALUES = [RELIGION_MUSLIM, RELIGION_CHRISTIAN] as const;
export type Religion = (typeof RELIGION_VALUES)[number];

export const PREF_RELIGION_SAME = "نفس ديانتي";
export const PREF_RELIGION_ANY = "لا مانع";
export const PREF_RELIGION_VALUES = [PREF_RELIGION_SAME, PREF_RELIGION_ANY] as const;

/** Profile fields only a Muslim answers; cleared for a Christian */
export const MUSLIM_ONLY_FIELDS = ["hijab", "niqab", "beard", "sect", "prefSect", "prefHijab", "prefBeard"] as const;
/** «شروط أساسية» keys that only make sense for a Muslim */
export const MUSLIM_ONLY_DEALBREAKERS = ["hijab", "beard", "sect"] as const;

export type ReligionProfile = { religion?: string | null; prefReligion?: string | null };
type Maybe<T> = T | null | undefined;

export function religionOf(p: Maybe<ReligionProfile>): Religion {
  return p?.religion === RELIGION_CHRISTIAN ? RELIGION_CHRISTIAN : RELIGION_MUSLIM;
}

export function isChristian(p: Maybe<ReligionProfile>): boolean {
  return religionOf(p) === RELIGION_CHRISTIAN;
}

export function opensToOtherReligion(p: Maybe<ReligionProfile>): boolean {
  return p?.prefReligion === PREF_RELIGION_ANY;
}

export function religionsMatch(a: Maybe<ReligionProfile>, b: Maybe<ReligionProfile>): boolean {
  if (religionOf(a) === religionOf(b)) return true;
  return opensToOtherReligion(a) && opensToOtherReligion(b);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** A copy without the Muslim-only answers when the religion is «مسيحي»; anything else comes back unchanged. */
export function stripMuslimOnlyForChristian<T>(religion: string | null | undefined, data: T): T {
  if (religion !== RELIGION_CHRISTIAN || !isPlainObject(data)) return data;
  const copy: Record<string, unknown> = { ...data };
  for (const key of MUSLIM_ONLY_FIELDS) delete copy[key];
  if (Array.isArray(copy.dealbreakers)) {
    const drop: readonly string[] = MUSLIM_ONLY_DEALBREAKERS;
    copy.dealbreakers = copy.dealbreakers.filter((k) => !drop.includes(k as string));
  }
  return copy as T;
}

/** What a stored profile write sets to clear the Muslim-only answers (a member who became a Christian). */
export function muslimOnlyClears(dealbreakers: readonly string[] | null | undefined) {
  const drop: readonly string[] = MUSLIM_ONLY_DEALBREAKERS;
  return {
    hijab: null,
    niqab: null,
    beard: null,
    sect: null,
    prefSect: [] as string[],
    prefHijab: null,
    prefBeard: null,
    dealbreakers: (dealbreakers ?? []).filter((k) => !drop.includes(k)),
  };
}

type StoredMuslimOnly = {
  hijab?: boolean | null;
  niqab?: boolean | null;
  beard?: boolean | null;
  sect?: string | null;
  prefSect?: string[] | null;
  prefHijab?: string | null;
  prefBeard?: string | null;
  dealbreakers?: string[] | null;
};

/**
 * Only the clears a stored profile actually needs: a field already empty is left out, and `dealbreakers` only when
 * the stored list holds a Muslim-only key. Autosaves use it so they never rewrite a field another save may be
 * writing at the same time (the final `PUT /api/profile` sets the dealbreakers).
 */
export function neededMuslimOnlyClears(stored: Maybe<StoredMuslimOnly>): Partial<ReturnType<typeof muslimOnlyClears>> {
  if (!stored) return {};
  const all = muslimOnlyClears(stored.dealbreakers);
  const out: Partial<ReturnType<typeof muslimOnlyClears>> = {};
  for (const key of ["hijab", "niqab", "beard", "sect", "prefHijab", "prefBeard"] as const) {
    if (stored[key] != null) out[key] = null;
  }
  if ((stored.prefSect ?? []).length > 0) out.prefSect = all.prefSect;
  if ((stored.dealbreakers ?? []).length !== all.dealbreakers.length) out.dealbreakers = all.dealbreakers;
  return out;
}

/**
 * The preferences a «شرط أساسي» is checked against. For a Christian the Muslim-only ones read as empty, so their
 * conditions never count. Pass the STORED religion when saving: a pending change to «مسيحي» must not drop the stored
 * keys before it is approved (approval's `muslimOnlyClears` removes them).
 */
export function dealbreakerPrefsFor<T extends object>(religion: string | null | undefined, prefs: T): T {
  if (religion !== RELIGION_CHRISTIAN) return prefs;
  return { ...prefs, prefHijab: "", prefBeard: "", prefSect: [] };
}

/** Drops `religion` and `prefReligion` from a write while the switch is off. */
export function stripReligionUnlessEnabled<T>(enabled: boolean, data: T): T {
  if (enabled || !isPlainObject(data)) return data;
  const copy: Record<string, unknown> = { ...data };
  delete copy.religion;
  delete copy.prefReligion;
  return copy as T;
}

/** Whether «المذهب» is asked: Lebanon, and not a Christian. */
export function sectAsked(country: unknown, religion: string | null | undefined): boolean {
  return sectApplies(country) && religion !== RELIGION_CHRISTIAN;
}

/** The note «شروطك الأساسية مثل الحجاب تبقى سارية»: a Muslim open to another religion with a hijab or beard condition. */
export function showsDealbreakerHint(
  religion: string | null | undefined,
  prefReligion: string | null | undefined,
  dealbreakers: readonly string[] | null | undefined,
): boolean {
  if (religion === RELIGION_CHRISTIAN || prefReligion !== PREF_RELIGION_ANY) return false;
  return (dealbreakers ?? []).some((k) => k === "hijab" || k === "beard");
}

/** The religion-related fields another member may see. */
export function publicReligionFields(
  p: Maybe<ReligionProfile & { hijab?: boolean | null; niqab?: boolean | null; beard?: boolean | null; sect?: string | null }>,
  enabled: boolean,
): { religion: Religion | null; hijab: boolean | null; niqab: boolean | null; beard: boolean | null; sect: string | null } {
  const religion = enabled ? religionOf(p) : null;
  if (isChristian(p)) return { religion, hijab: null, niqab: null, beard: null, sect: null };
  return {
    religion,
    hijab: p?.hijab ?? null,
    niqab: p?.niqab ?? null,
    beard: p?.beard ?? null,
    sect: visibleSect(p?.sect),
  };
}
