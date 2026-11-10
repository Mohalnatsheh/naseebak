/**
 * Birth date as three lists (day / month / year) instead of `<input type="date">`: the native picker fails in
 * some in-app browsers (Instagram on Android, ticket 2026-11-03) and opens 18 years back, far from most birth years.
 * The value stays the `YYYY-MM-DD` string the APIs and `dateOfBirthError()` already take. Db-free, client safe.
 */
import { MAX_MEMBER_AGE, MIN_MEMBER_AGE } from "@/lib/validations/profile";

/** Levantine month names (what Jordan uses); the list shows each with its number ("11 - تشرين الثاني") */
export const BIRTH_MONTHS = [
  "كانون الثاني",
  "شباط",
  "آذار",
  "نيسان",
  "أيار",
  "حزيران",
  "تموز",
  "آب",
  "أيلول",
  "تشرين الأول",
  "تشرين الثاني",
  "كانون الأول",
] as const;

const SAUDI_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"] as const;

/** The month names a country uses */
export function birthMonths(country: unknown): readonly string[] {
  return country === "SA" ? SAUDI_MONTHS : BIRTH_MONTHS; // Lebanon uses the Levantine names, like Jordan
}

export interface DobParts {
  /** "" while not chosen, else the number as text ("1".."31", "1".."12", "1990") */
  day: string;
  month: string;
  year: string;
}

export const EMPTY_DOB: DobParts = { day: "", month: "", year: "" };

/** Days in a month (month 1–12); without a year, February allows 29 so the day isn't refused before the year. */
export function daysInMonth(month: number, year?: number): number {
  if (!month) return 31;
  return new Date(Date.UTC(year || 2000, month, 0)).getUTCDate();
}

/** Years a member can be born in, newest first: from MIN_MEMBER_AGE to MAX_MEMBER_AGE years ago. */
export function birthYearOptions(now = new Date()): number[] {
  const newest = now.getUTCFullYear() - MIN_MEMBER_AGE;
  const oldest = now.getUTCFullYear() - MAX_MEMBER_AGE - 1;
  const years: number[] = [];
  for (let y = newest; y >= oldest; y--) years.push(y);
  return years;
}

/** Parts of a stored `YYYY-MM-DD` (or ISO) value; empty parts when it is missing or unreadable. */
export function splitDob(value: string | null | undefined): DobParts {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? "");
  if (!m) return EMPTY_DOB;
  return { year: String(Number(m[1])), month: String(Number(m[2])), day: String(Number(m[3])) };
}

/** `YYYY-MM-DD` once all three parts are chosen and form a real date, else "". */
export function joinDob({ day, month, year }: DobParts): string {
  const d = Number(day), m = Number(month), y = Number(year);
  if (!d || !m || !y || d > daysInMonth(m, y)) return "";
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Some but not all parts chosen: the field shows "complete the date" instead of "required". */
export function isPartialDob(parts: DobParts): boolean {
  const chosen = [parts.day, parts.month, parts.year].filter(Boolean).length;
  return chosen > 0 && chosen < 3;
}

/** New parts after one list changes; a day the new month/year doesn't have (31 Apr, 29 Feb 2001) is cleared. */
export function changeDobPart(parts: DobParts, key: keyof DobParts, value: string): DobParts {
  const next = { ...parts, [key]: value };
  if (next.day && Number(next.day) > daysInMonth(Number(next.month), Number(next.year))) next.day = "";
  return next;
}
