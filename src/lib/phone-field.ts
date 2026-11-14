/**
 * Phone field rules for the sign-in / sign-up pages (db-free, client-safe): which country's
 * mobile the dial-code toggle expects, and the error wording per country
 * (Jordan keeps «رقم الهاتف», Saudi Arabia says «رقم الجوال»).
 */
import { COUNTRIES, COUNTRY_CODES, type CountryCode } from "@/lib/countries";
import { isValidPhone } from "@/lib/phone";

/** «الهاتف» / «الجوال» */
export function phoneWord(country: CountryCode): string {
  return `ال${COUNTRIES[country].words.phone}`;
}

/** The formats a member may type, e.g. "07X, 7X, 9627X, +9627X, 009627X" */
export function acceptedFormats(country: CountryCode): string {
  const { dialCode, phone } = COUNTRIES[country];
  const d = phone.placeholder[0];
  return `0${d}X, ${d}X, ${dialCode}${d}X, +${dialCode}${d}X, 00${dialCode}${d}X`;
}

/** Login / sign-up step check: "رقم الهاتف غير صالح. الصيغ المقبولة: …" */
export function phoneFormatsError(country: CountryCode): string {
  return `رقم ${phoneWord(country)} غير صالح. الصيغ المقبولة: ${acceptedFormats(country)}`;
}

/** Before sending the code: "… أدخل رقماً أردنياً مثل 0791234567" / "… أدخل رقم جوال سعودي مثل 0512345678" */
export function phoneExampleError(country: CountryCode): string {
  const example = COUNTRIES[country].phone.example;
  if (country === "SA") return `رقم الجوال غير صالح. أدخل رقم جوال سعودي مثل ${example}`;
  if (country === "LB") return `رقم الهاتف غير صالح. أدخل رقماً لبنانياً مثل ${example}`;
  return `رقم الهاتف غير صالح. أدخل رقماً أردنياً مثل ${example}`;
}

/** A mobile of `country` in any of its formats (spaces, dashes and brackets ignored, Arabic digits accepted) */
export function isPhoneFor(raw: string, country: CountryCode): boolean {
  return isValidPhone(raw, country);
}

/** Whether more digits could still make `raw` a mobile of `country` (it is the start of one) */
function couldBecome(raw: string, country: CountryCode): boolean {
  for (let more = 1; more <= 9; more++) {
    if (isValidPhone(raw + "0".repeat(more), country)) return true;
  }
  return false;
}

/**
 * The dial code to show for what was typed: a complete number of another country switches the
 * toggle to it (7… is never Saudi, 5… never Jordanian); anything else keeps the current choice.
 * A number still being typed for the current country never switches midway: «079692229» is a
 * whole Lebanese number but the start of a Jordanian one, so Jordan stays until it can't be one.
 */
export function dialCountryFor(raw: string, current: CountryCode): CountryCode {
  if (isValidPhone(raw, current) || couldBecome(raw, current)) return current;
  return COUNTRY_CODES.find((c) => c !== current && isValidPhone(raw, c)) ?? current;
}
