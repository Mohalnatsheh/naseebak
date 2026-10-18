/**
 * The landing page's quick start ("أبحث عن زوجة / زوج" + phone) handed to /register through
 * sessionStorage — never the URL (no phone numbers in links, logs or analytics). Valid 30 minutes.
 */
import { toLatinDigits } from "@/lib/digits";
import { jordanPhoneRegex } from "@/lib/validations/auth";

export const LANDING_START_KEY = "naseeb:register-start";
const MAX_AGE_MS = 30 * 60 * 1000;

export type StartGender = "MALE" | "FEMALE";

export interface LandingStart {
  gender: StartGender;
  /** As typed (Western digits), already checked against jordanPhoneRegex; "" when left empty */
  phone: string;
  at: number;
}

/** "" = empty (allowed), null = not a Jordanian mobile number */
export function cleanStartPhone(raw: string): string | null {
  const cleaned = toLatinDigits(raw).replace(/[\s\-()]/g, "");
  if (!cleaned) return "";
  return jordanPhoneRegex.test(cleaned) ? cleaned : null;
}

export function saveLandingStart(storage: Pick<Storage, "setItem"> | undefined, start: Omit<LandingStart, "at">, now = Date.now()) {
  try {
    storage?.setItem(LANDING_START_KEY, JSON.stringify({ ...start, at: now }));
  } catch {
    // private mode: the register page simply starts empty
  }
}

/** Reads and removes the hand-off; null when missing, stale or malformed */
export function takeLandingStart(storage: Pick<Storage, "getItem" | "removeItem"> | undefined, now = Date.now()): LandingStart | null {
  try {
    const raw = storage?.getItem(LANDING_START_KEY);
    if (!raw) return null;
    storage?.removeItem(LANDING_START_KEY);
    const v = JSON.parse(raw) as Partial<LandingStart>;
    if (v.gender !== "MALE" && v.gender !== "FEMALE") return null;
    if (typeof v.at !== "number" || now - v.at > MAX_AGE_MS || v.at > now + 60_000) return null;
    const phone = typeof v.phone === "string" ? cleanStartPhone(v.phone) : "";
    return { gender: v.gender, phone: phone ?? "", at: v.at };
  } catch {
    return null;
  }
}
