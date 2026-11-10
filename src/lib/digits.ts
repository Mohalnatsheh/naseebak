/**
 * Arabic-Indic (٠-٩) and Persian (۰-۹) digits → ASCII 0-9. Arabic keyboards type these in phone
 * and code fields; everything downstream (validation, OTP match, storage) expects ASCII.
 */
export function toLatinDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/**
 * A price as typed on any keyboard → «12.5»: Arabic-Indic digits, the Arabic decimal mark (٫) or a comma become
 * ASCII, anything else is dropped, and only the first decimal point is kept (admin price fields, ADM-15).
 */
export function toDecimalText(value: string): string {
  const ascii = toLatinDigits(value).replace(/[٫,]/g, ".").replace(/[^\d.]/g, "");
  const dot = ascii.indexOf(".");
  return dot === -1 ? ascii : ascii.slice(0, dot + 1) + ascii.slice(dot + 1).replace(/\./g, "");
}
