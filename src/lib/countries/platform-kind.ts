import type { CountryCode } from "@/lib/countries";

/**
 * The platform's nationality word for the privacy and terms intros, written
 * right after «منصة» with its own leading space (Lebanon names none, so no
 * stray space). JSX drops the space across a line break, so the page puts
 * «منصة» and this value on the same line.
 */
export const PLATFORM_KIND: Record<CountryCode, string> = {
  JO: " أردنية",
  // [NEEDS LEGAL REVIEW: KSA]
  SA: " سعودية",
  // LB draft: owner's legal review pending
  LB: "",
};
