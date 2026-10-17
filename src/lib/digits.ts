/**
 * Arabic-Indic (٠-٩) and Persian (۰-۹) digits → ASCII 0-9. Arabic keyboards type these in phone
 * and code fields; everything downstream (validation, OTP match, storage) expects ASCII.
 */
export function toLatinDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}
