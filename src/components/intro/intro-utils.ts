/** Client helpers shared by the introduction components. */
import { COUNTRIES, COUNTRY_CODES, countryConfig } from "@/lib/countries";

export const RELATIONSHIP_LABELS: Record<string, string> = {
  father: "الأب",
  mother: "الأم",
  brother: "الأخ",
  guardian: "وليّ الأمر",
};

export function daysLeft(iso?: string): number {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}

export function daysLabel(n: number): string {
  if (n <= 0) return "أقل من يوم";
  if (n === 1) return "يوم واحد";
  if (n === 2) return "يومان";
  if (n <= 10) return `${n} أيام`;
  return `${n} يوماً`;
}

/**
 * A stored guardian mobile of any served country → { display, tel, wa }:
 * 9627XXXXXXXX → "+962 7X XXX XXXX", 9665XXXXXXXX → "+966 5X XXX XXXX". A local number (0…) takes
 * the dial code of `country` (the viewer's; Jordan when unknown).
 */
export function formatGuardianPhone(raw: string, country?: unknown) {
  const digits = raw.replace(/\D/g, "");
  const known = COUNTRY_CODES.map((c) => COUNTRIES[c].dialCode).find((d) => digits.startsWith(d) && digits.length > 10);
  const dial = known ?? countryConfig(country).dialCode;
  const intl = known ? digits : digits.startsWith("0") ? `${dial}${digits.slice(1)}` : digits;
  const local = intl.startsWith(dial) ? intl.slice(dial.length) : intl;
  const display = local.length === 9
    ? `+${dial} ${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5)}`
    : `+${intl}`;
  return { display, tel: `+${intl}`, wa: intl };
}

/** Older name (Jordanian numbers format exactly as before) */
export const formatJordanPhone = formatGuardianPhone;

export interface ApiError {
  error?: string;
  code?: string;
}

export async function postJson<T>(url: string, body?: unknown): Promise<{ ok: true; data: T } | { ok: false; status: number; data: ApiError }> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return { ok: false, status: 0, data: { error: "تعذّر الاتصال. تحقق من الإنترنت وحاول مرة أخرى." } };
  }
  const data = await res.json().catch(() => ({}));
  return res.ok ? { ok: true, data: data as T } : { ok: false, status: res.status, data: data as ApiError };
}
