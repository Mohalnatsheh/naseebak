/** Client helpers shared by the introduction components. */
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

/** 9627XXXXXXXX → { display: "+962 7X XXX XXXX", tel: "+9627…", wa: "9627…" } */
export function formatJordanPhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  const intl = digits.startsWith("962") ? digits : digits.startsWith("0") ? `962${digits.slice(1)}` : digits;
  const local = intl.startsWith("962") ? intl.slice(3) : intl;
  const display = local.length === 9
    ? `+962 ${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5)}`
    : `+${intl}`;
  return { display, tel: `+${intl}`, wa: intl };
}

export interface ApiError {
  error?: string;
  code?: string;
}

export async function postJson<T>(url: string, body?: unknown): Promise<{ ok: true; data: T } | { ok: false; status: number; data: ApiError }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return res.ok ? { ok: true, data: data as T } : { ok: false, status: res.status, data: data as ApiError };
}
